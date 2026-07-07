import { clearLeg, departTenants, spawnTenants } from './agents';
import { CATALOG } from './catalog';
import {
  CAR_COST,
  DEMOLISH_REFUND,
  LOT_WIDTH,
  MAX_CARS_PER_SHAFT,
  NOISE_RADIUS_TILES,
  REFUND_WINDOW_TICKS,
  SAT_INITIAL,
  SHAFT_COST,
  STAIR_COST,
  STAIR_WIDTH,
} from './constants';
import { updateStar } from './economy';
import { invalidateFacilityIndex } from './tower';
import type { ElevatorCar, ElevatorShaft, Facility, SimState } from './types';

/** Player actions. Applied between ticks; recorded with their tick so a save
 *  can be reconstructed as snapshot + action log (GDD §12). Every mutation of
 *  sim state that originates outside the tick loop MUST go through here.
 *  Actions that build charge state.cash and fail (return false) when the
 *  player can't afford them; demolition refunds 80% of what was paid if the
 *  thing was built within the last sim-day (GDD §9). */

export type Action =
  | { type: 'addShaft'; service?: boolean }
  | { type: 'removeShaft'; shaftId: number }
  | { type: 'addCar'; shaftId: number }
  | { type: 'removeCar'; shaftId: number }
  | { type: 'placeFacility'; kind: Facility['kind']; floor: number; x: number }
  | { type: 'demolishFacility'; facilityId: number }
  | { type: 'placeStair'; floorLow: number; x: number }
  | { type: 'removeStair'; stairId: number };

export interface LoggedAction {
  tick: number;
  action: Action;
}

function newCar(pos: number): ElevatorCar {
  return { pos, state: 'idle', dir: 0, target: 0, doorTicks: 0, passengers: [] };
}

/** Dump a car's passengers into the tower at the car's current floor; their
 *  walking logic re-plans the rest of the trip next tick. */
function dumpPassengers(state: SimState, shaft: ElevatorShaft, car: ElevatorCar): void {
  const floor = Math.max(shaft.lowFloor, Math.min(shaft.highFloor, Math.round(car.pos)));
  for (const p of car.passengers) {
    const agent = state.agents[p.agentId];
    agent.activity = 'walking';
    agent.floor = floor;
    agent.x = shaft.x;
    agent.shaftId = -1;
    clearLeg(agent);
  }
  car.passengers = [];
}

/** Refund for demolishing something built within the refund window. */
function refundFor(state: SimState, builtTick: number, cost: number): number {
  return state.tick - builtTick <= REFUND_WINDOW_TICKS ? Math.round(cost * DEMOLISH_REFUND) : 0;
}

/** Recompute stored noise for every sensitive unit (GDD §4 adjacency:
 *  emitters reach ±1 floor and NOISE_RADIUS_TILES of horizontal gap).
 *  O(n²) but only runs on place/demolish, never in the tick loop. */
function recomputeNoise(state: SimState): void {
  for (const f of state.facilities) {
    if (!CATALOG[f.kind].noiseSensitive) {
      f.noise = 0;
      continue;
    }
    let n = 0;
    for (const e of state.facilities) {
      const emitted = CATALOG[e.kind].noise;
      if (emitted <= 0 || Math.abs(e.floor - f.floor) > 1) continue;
      const gap =
        e.x >= f.x + f.width ? e.x - (f.x + f.width) : f.x >= e.x + e.width ? f.x - (e.x + e.width) : 0;
      if (gap <= NOISE_RADIUS_TILES) n += emitted;
    }
    f.noise = n;
  }
}

/** Return queued agents to 'walking'; they immediately re-queue on a live shaft. */
function dumpQueues(state: SimState, shaft: ElevatorShaft): void {
  for (let f = shaft.lowFloor; f <= shaft.highFloor; f++) {
    for (const q of [shaft.queueUp[f], shaft.queueDown[f]]) {
      for (const agentId of q) {
        const agent = state.agents[agentId];
        agent.activity = 'walking';
        agent.shaftId = -1;
        clearLeg(agent);
      }
      q.length = 0;
    }
  }
}

export function applyAction(state: SimState, action: Action): boolean {
  switch (action.type) {
    case 'addShaft': {
      if (state.cash < SHAFT_COST) return false;
      const id = state.shafts.length === 0 ? 0 : Math.max(...state.shafts.map((s) => s.id)) + 1;
      const x = state.shafts.length === 0 ? 30 : Math.max(...state.shafts.map((s) => s.x)) + 6;
      const queueUp: Record<number, number[]> = {};
      const queueDown: Record<number, number[]> = {};
      for (let f = 0; f < state.floors; f++) {
        queueUp[f] = [];
        queueDown[f] = [];
      }
      state.cash -= SHAFT_COST;
      state.shafts.push({
        id,
        x,
        lowFloor: 0,
        highFloor: state.floors - 1,
        cars: [newCar(0)],
        service: !!action.service,
        builtTick: state.tick,
        cost: SHAFT_COST,
        boardedToday: 0,
        waitTicksToday: 0,
        queueUp,
        queueDown,
      });
      return true;
    }

    case 'removeShaft': {
      const idx = state.shafts.findIndex((s) => s.id === action.shaftId);
      if (idx < 0 || state.shafts.length <= 1) return false; // keep at least one shaft
      const shaft = state.shafts[idx];
      for (const car of shaft.cars) dumpPassengers(state, shaft, car);
      dumpQueues(state, shaft);
      state.cash += refundFor(state, shaft.builtTick, shaft.cost);
      state.shafts.splice(idx, 1);
      return true;
    }

    case 'addCar': {
      const shaft = state.shafts.find((s) => s.id === action.shaftId);
      if (!shaft || shaft.cars.length >= MAX_CARS_PER_SHAFT) return false;
      if (state.cash < CAR_COST) return false;
      state.cash -= CAR_COST;
      shaft.cars.push(newCar(shaft.lowFloor));
      return true;
    }

    case 'removeCar': {
      const shaft = state.shafts.find((s) => s.id === action.shaftId);
      if (!shaft || shaft.cars.length <= 1) return false;
      // Prefer removing an empty idle car; else the lightest-loaded one.
      let idx = shaft.cars.findIndex((c) => c.state === 'idle' && c.passengers.length === 0);
      if (idx < 0) {
        idx = 0;
        for (let i = 1; i < shaft.cars.length; i++) {
          if (shaft.cars[i].passengers.length < shaft.cars[idx].passengers.length) idx = i;
        }
      }
      dumpPassengers(state, shaft, shaft.cars[idx]);
      // No refund: cars aren't individually cost-tracked. Revisit with the
      // M1 transit rework if it turns out players use cars as a piggy bank.
      shaft.cars.splice(idx, 1);
      return true;
    }

    case 'placeFacility': {
      const def = CATALOG[action.kind];
      if (!def.buildable) return false;
      if (def.minStar > state.star) return false; // not unlocked yet (GDD §6)
      if (state.cash < def.cost) return false;
      const { floor, x } = action;
      if (floor < def.minFloor || floor >= state.floors) return false;
      if (!Number.isInteger(x) || x < 0 || x + def.width > LOT_WIDTH) return false;
      for (const f of state.facilities) {
        if (f.floor === floor && x < f.x + f.width && f.x < x + def.width) return false;
      }
      for (const s of state.shafts) {
        // Shafts render ~3 tiles wide at s.x; don't let rooms swallow them.
        if (floor >= s.lowFloor && floor <= s.highFloor && x < s.x + 3 && s.x < x + def.width)
          return false;
      }
      for (const st of state.stairs) {
        // A stair occupies its footprint on both floors it connects.
        if (
          (floor === st.floorLow || floor === st.floorLow + 1) &&
          x < st.x + STAIR_WIDTH &&
          st.x < x + def.width
        )
          return false;
      }
      state.cash -= def.cost;
      const id = state.facilities.reduce((m, f) => Math.max(m, f.id), -1) + 1;
      const facility: Facility = {
        id,
        kind: def.kind,
        floor,
        x,
        width: def.width,
        builtTick: state.tick,
        cost: def.cost,
        sold: false,
        noise: 0,
        satisfaction: SAT_INITIAL,
        lowSatQuarters: 0,
        vacant: false,
        vacantSinceTick: 0,
        dirty: false,
        assignedTo: -1,
      };
      state.facilities.push(facility);
      invalidateFacilityIndex(state);
      recomputeNoise(state);
      // Tenants move in immediately; their schedule fills in on the next tick,
      // so a mid-morning build staffs up right away.
      spawnTenants(state, facility, def);
      updateStar(state);
      return true;
    }

    case 'demolishFacility': {
      const idx = state.facilities.findIndex((f) => f.id === action.facilityId);
      if (idx < 0) return false;
      const fac = state.facilities[idx];
      if (fac.kind === 'lobby') return false; // the lobby is forever
      state.cash += refundFor(state, fac.builtTick, fac.cost);
      state.facilities.splice(idx, 1);
      invalidateFacilityIndex(state);
      recomputeNoise(state);
      departTenants(state, fac.id);
      return true;
    }

    case 'placeStair': {
      if (state.cash < STAIR_COST) return false;
      const { floorLow, x } = action;
      if (floorLow < 0 || floorLow + 1 >= state.floors) return false;
      if (!Number.isInteger(x) || x < 0 || x + STAIR_WIDTH > LOT_WIDTH) return false;
      for (const f of state.facilities) {
        if (f.kind === 'lobby') continue; // the lobby spans the lot; stairs may pierce it
        if (
          (f.floor === floorLow || f.floor === floorLow + 1) &&
          x < f.x + f.width &&
          f.x < x + STAIR_WIDTH
        )
          return false;
      }
      for (const s of state.shafts) {
        if (s.lowFloor <= floorLow + 1 && s.highFloor >= floorLow && x < s.x + 3 && s.x < x + STAIR_WIDTH)
          return false;
      }
      for (const st of state.stairs) {
        if (
          Math.abs(st.floorLow - floorLow) <= 1 &&
          x < st.x + STAIR_WIDTH &&
          st.x < x + STAIR_WIDTH
        )
          return false;
      }
      state.cash -= STAIR_COST;
      const id = state.stairs.length === 0 ? 0 : Math.max(...state.stairs.map((s) => s.id)) + 1;
      state.stairs.push({ id, floorLow, x, builtTick: state.tick, cost: STAIR_COST });
      return true;
    }

    case 'removeStair': {
      const idx = state.stairs.findIndex((s) => s.id === action.stairId);
      if (idx < 0) return false;
      const stair = state.stairs[idx];
      // Anyone mid-flight steps off at the lower floor and re-plans.
      for (const agent of state.agents) {
        if (agent.activity === 'climbing' && agent.legVia === 'stair' && agent.legViaId === stair.id) {
          agent.floor = stair.floorLow;
          agent.x = stair.x;
          agent.activity = 'walking';
          clearLeg(agent);
        }
      }
      state.cash += refundFor(state, stair.builtTick, stair.cost);
      state.stairs.splice(idx, 1);
      return true;
    }
  }
}

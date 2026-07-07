import { CATALOG } from './catalog';
import { LOT_WIDTH, MAX_SPAN_FLOORS, SAT_INITIAL, STAR2_POP, STARTING_CASH } from './constants';
import { createRng } from './rng';
import type { Agent, ElevatorShaft, Facility, SimState, Stair } from './types';

export interface ScenarioOptions {
  seed: number;
  officeFloors: number; // floors of offices above the ground lobby
  shafts: number;
  carsPerShaft: number;
  officesPerFloor: number;
}

/** Deterministically build the M0 test tower: ground lobby + N office floors,
 *  elevator shafts clustered left-of-center, offices filling each floor. */
export function buildScenario(opts: ScenarioOptions): SimState {
  const floors = opts.officeFloors + 1;
  if (floors > MAX_SPAN_FLOORS) throw new Error(`M0 scenario limited to ${MAX_SPAN_FLOORS} floors`);

  const facilities: Facility[] = [];
  let fid = 0;
  const baseUnit = {
    builtTick: 0,
    cost: 0,
    sold: false,
    noise: 0,
    satisfaction: SAT_INITIAL,
    lowSatQuarters: 0,
    vacant: false,
    vacantSinceTick: 0,
    dirty: false,
    assignedTo: -1,
  };
  facilities.push({ id: fid++, kind: 'lobby', floor: 0, x: 0, width: LOT_WIDTH, ...baseUnit });

  // Shafts at fixed x positions, 6 tiles apart, starting at tile 30.
  const shafts: ElevatorShaft[] = [];
  for (let s = 0; s < opts.shafts; s++) {
    const queueUp: Record<number, number[]> = {};
    const queueDown: Record<number, number[]> = {};
    for (let f = 0; f < floors; f++) {
      queueUp[f] = [];
      queueDown[f] = [];
    }
    const cars = [];
    for (let c = 0; c < opts.carsPerShaft; c++) {
      // Stagger idle cars through the shaft so they don't all fight for ground calls.
      const home = Math.round((c * (floors - 1)) / Math.max(1, opts.carsPerShaft - 1)) || 0;
      cars.push({
        pos: opts.carsPerShaft === 1 ? 0 : home,
        state: 'idle' as const,
        dir: 0 as const,
        target: 0,
        doorTicks: 0,
        passengers: [],
      });
    }
    shafts.push({
      id: s,
      x: 30 + s * 6,
      lowFloor: 0,
      highFloor: floors - 1,
      cars,
      service: false,
      builtTick: 0,
      cost: 0,
      queueUp,
      queueDown,
    });
  }

  // Offices from tile 80 rightward on each floor above ground.
  const office = CATALOG.office;
  const agents: Agent[] = [];
  let aid = 0;
  for (let f = 1; f < floors; f++) {
    for (let o = 0; o < opts.officesPerFloor; o++) {
      const x = 80 + o * (office.width + 1);
      if (x + office.width > LOT_WIDTH) break;
      const facility: Facility = { id: fid++, kind: 'office', floor: f, x, width: office.width, ...baseUnit };
      facilities.push(facility);
      for (let w = 0; w < office.workers; w++) {
        agents.push({
          id: aid++,
          role: office.workerRole!,
          homeFacilityId: facility.id,
          activity: 'offsite',
          floor: 0,
          x: 0,
          targetX: 0,
          destFloor: 0,
          intent: 'none',
          shaftId: -1,
          legVia: 'none' as const,
          legViaId: -1,
          legFloor: -1,
          climbTicksLeft: 0,
          visitFacilityId: -1,
          stressWaitToday: 0,
          stressNoiseToday: 0,
          stressClimbToday: 0,
          peakStressToday: 0,
          worstWaitTicks: 0,
          worstWaitShaftId: -1,
          worstWaitFloor: -1,
          worstWaitTod: -1,
          stress: 0,
          waitTicks: 0,
          arriveTick: -1,
          lunchTick: -1,
          leaveTick: -1,
        });
      }
    }
  }

  return {
    tick: 0,
    seed: opts.seed,
    rng: createRng(opts.seed),
    cash: STARTING_CASH,
    // Big debug scenarios can start beyond the 2★ population gate.
    star: agents.length >= STAR2_POP ? 2 : 1,
    floors,
    facilities,
    agents,
    shafts,
    stairs: [],
    stats: { boardedToday: 0, totalWaitTicksToday: 0, maxQueueToday: 0 },
  };
}

/** Facility ids are stable but, once demolition exists, not array indices.
 *  Lookups are hot (noise checks, trip planning), so they go through a
 *  derived id→facility index. The index is a cache of plain state — rebuilt
 *  lazily and dropped by invalidateFacilityIndex() whenever an action
 *  changes state.facilities — so replay determinism is unaffected. */
const facilityIndexes = new WeakMap<SimState, Map<number, Facility>>();
// Identity fast path — see inboundFor in agents.ts for the rationale.
let lastIndexState: SimState | null = null;
let lastIndex: Map<number, Facility> | null = null;

export function invalidateFacilityIndex(state: SimState): void {
  facilityIndexes.delete(state);
  if (state === lastIndexState) {
    lastIndexState = null;
    lastIndex = null;
  }
}

export function facilityById(state: SimState, id: number): Facility | undefined {
  if (id < 0) return undefined;
  let index = state === lastIndexState ? lastIndex : facilityIndexes.get(state);
  if (!index || index.size !== state.facilities.length) {
    index = new Map(state.facilities.map((f) => [f.id, f]));
    facilityIndexes.set(state, index);
  }
  lastIndexState = state;
  lastIndex = index;
  return index.get(id);
}

export function stairById(state: SimState, id: number): Stair | undefined {
  return state.stairs.find((s) => s.id === id);
}

export function shaftById(state: SimState, id: number): ElevatorShaft | undefined {
  return state.shafts.find((s) => s.id === id);
}

import { MAX_CARS_PER_SHAFT } from './constants';
import type { ElevatorCar, ElevatorShaft, SimState } from './types';

/** Player actions. Applied between ticks; recorded with their tick so a save
 *  can be reconstructed as snapshot + action log (GDD §12). Every mutation of
 *  sim state that originates outside the tick loop MUST go through here. */

export type Action =
  | { type: 'addShaft' }
  | { type: 'removeShaft'; shaftId: number }
  | { type: 'addCar'; shaftId: number }
  | { type: 'removeCar'; shaftId: number };

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
  }
  car.passengers = [];
}

/** Return queued agents to 'walking'; they immediately re-queue on a live shaft. */
function dumpQueues(state: SimState, shaft: ElevatorShaft): void {
  for (let f = shaft.lowFloor; f <= shaft.highFloor; f++) {
    for (const q of [shaft.queueUp[f], shaft.queueDown[f]]) {
      for (const agentId of q) {
        const agent = state.agents[agentId];
        agent.activity = 'walking';
        agent.shaftId = -1;
      }
      q.length = 0;
    }
  }
}

export function applyAction(state: SimState, action: Action): boolean {
  switch (action.type) {
    case 'addShaft': {
      const id = state.shafts.length === 0 ? 0 : Math.max(...state.shafts.map((s) => s.id)) + 1;
      const x = state.shafts.length === 0 ? 30 : Math.max(...state.shafts.map((s) => s.x)) + 6;
      const queueUp: Record<number, number[]> = {};
      const queueDown: Record<number, number[]> = {};
      for (let f = 0; f < state.floors; f++) {
        queueUp[f] = [];
        queueDown[f] = [];
      }
      state.shafts.push({
        id,
        x,
        lowFloor: 0,
        highFloor: state.floors - 1,
        cars: [newCar(0)],
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
      state.shafts.splice(idx, 1);
      return true;
    }

    case 'addCar': {
      const shaft = state.shafts.find((s) => s.id === action.shaftId);
      if (!shaft || shaft.cars.length >= MAX_CARS_PER_SHAFT) return false;
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
      shaft.cars.splice(idx, 1);
      return true;
    }
  }
}

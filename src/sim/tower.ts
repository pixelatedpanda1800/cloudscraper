import { LOT_WIDTH, MAX_SPAN_FLOORS, OFFICE_WIDTH, OFFICE_WORKERS } from './constants';
import { createRng } from './rng';
import type { Agent, ElevatorShaft, Facility, SimState } from './types';

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
  facilities.push({ id: fid++, kind: 'lobby', floor: 0, x: 0, width: LOT_WIDTH });

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
      queueUp,
      queueDown,
    });
  }

  // Offices from tile 80 rightward on each floor above ground.
  const agents: Agent[] = [];
  let aid = 0;
  for (let f = 1; f < floors; f++) {
    for (let o = 0; o < opts.officesPerFloor; o++) {
      const x = 80 + o * (OFFICE_WIDTH + 1);
      if (x + OFFICE_WIDTH > LOT_WIDTH) break;
      const facility: Facility = { id: fid++, kind: 'office', floor: f, x, width: OFFICE_WIDTH };
      facilities.push(facility);
      for (let w = 0; w < OFFICE_WORKERS; w++) {
        agents.push({
          id: aid++,
          homeFacilityId: facility.id,
          activity: 'offsite',
          floor: 0,
          x: 0,
          targetX: 0,
          destFloor: 0,
          intent: 'none',
          shaftId: -1,
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
    floors,
    facilities,
    agents,
    shafts,
    stats: { boardedToday: 0, totalWaitTicksToday: 0, maxQueueToday: 0 },
  };
}

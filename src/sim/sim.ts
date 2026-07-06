import { tickAgent } from './agents';
import { tickOfDay } from './clock';
import { tickShaft } from './elevator';
import type { SimState } from './types';

export { buildScenario } from './tower';
export { hashState } from './hash';
export { clockOf } from './clock';
export type { SimState, Agent, ElevatorShaft } from './types';

/** Advance the simulation exactly one tick. Fixed iteration order (agents by
 *  index, shafts by index) is a determinism requirement — never reorder. */
export function tick(state: SimState): void {
  state.tick++;

  if (tickOfDay(state.tick) === 0) {
    state.stats.boardedToday = 0;
    state.stats.totalWaitTicksToday = 0;
    state.stats.maxQueueToday = 0;
  }

  for (let i = 0; i < state.agents.length; i++) {
    tickAgent(state, state.agents[i]);
  }
  for (let i = 0; i < state.shafts.length; i++) {
    tickShaft(state, state.shafts[i]);
  }

  // Riding agents track their car's position for rendering.
  for (const shaft of state.shafts) {
    for (const car of shaft.cars) {
      for (const p of car.passengers) {
        const a = state.agents[p.agentId];
        a.floor = Math.round(car.pos);
        a.x = shaft.x;
      }
    }
  }
}

/** Run N ticks (test/bench helper). */
export function run(state: SimState, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(state);
}

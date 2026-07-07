import { tickAgent } from './agents';
import { dayOf, tickOfDay } from './clock';
import { DAYS_PER_QUARTER } from './constants';
import {
  collectDailySales,
  collectQuarterRent,
  reletVacancies,
  updateDailySatisfaction,
  updateStar,
} from './economy';
import { tickShaft } from './elevator';
import { applyAction } from './actions';
import type { LoggedAction } from './actions';
import type { SimState } from './types';

export { buildScenario, facilityById } from './tower';
export { hashState } from './hash';
export { clockOf } from './clock';
export { unitComplaint, updateStar } from './economy';
export type { UnitComplaint } from './economy';
export { applyAction };
export type { Action, LoggedAction } from './actions';
export type { SimState, Agent, ElevatorShaft } from './types';

/** Advance the simulation exactly one tick. Fixed iteration order (agents by
 *  index, shafts by index) is a determinism requirement — never reorder. */
export function tick(state: SimState): void {
  state.tick++;

  if (tickOfDay(state.tick) === 0) {
    state.stats.boardedToday = 0;
    state.stats.totalWaitTicksToday = 0;
    state.stats.maxQueueToday = 0;
    // Midnight economy events, in a fixed order (determinism): satisfaction
    // digests the day's stress before quarterly consequences read it; sales
    // close; vacancies re-let; the star gate re-checks population. Quarter
    // boundary rent (GDD §8): day 0's midnight predates the 06:00 sim start,
    // so the first collection is day DAYS_PER_QUARTER.
    updateDailySatisfaction(state);
    collectDailySales(state);
    if (dayOf(state.tick) % DAYS_PER_QUARTER === 0) collectQuarterRent(state);
    reletVacancies(state);
    updateStar(state);
  }

  const tod = tickOfDay(state.tick);
  const day = dayOf(state.tick);
  const workday = day % 7 < 5;
  for (let i = 0; i < state.agents.length; i++) {
    tickAgent(state, state.agents[i], tod, day, workday);
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

/** Replay helper: run to `untilTick`, applying logged actions at their ticks.
 *  This is the reconstruction path for snapshot + action-log saves. */
export function runWithLog(state: SimState, log: LoggedAction[], untilTick: number): void {
  let li = 0;
  while (state.tick < untilTick) {
    while (li < log.length && log[li].tick === state.tick) {
      applyAction(state, log[li].action);
      li++;
    }
    tick(state);
  }
}

import { describe, expect, it } from 'vitest';
import { applyAction, buildScenario, hashState, run, runWithLog } from '../src/sim/sim';
import type { LoggedAction, SimState } from '../src/sim/sim';
import {
  DEMOLISH_REFUND,
  STAIR_COST,
  STARTING_CASH,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../src/sim/constants';

// tick at which the sim clock (starting 06:00) shows `hour` on day 0
const at = (hour: number) => Math.floor((hour - 6) * TICKS_PER_HOUR);

const settledUpstairs = (s: SimState) =>
  s.agents.filter((a) => a.activity === 'settled' && a.floor > 0).length;

describe('stairs & multi-leg routing', () => {
  it('one-floor commutes take a nearby stair; the elevator stays unused', () => {
    // Offices only on floor 1; stair right next to the lobby entrance, the
    // single shaft far away at x=30.
    const s = buildScenario({ seed: 3, officeFloors: 1, shafts: 1, carsPerShaft: 1, officesPerFloor: 3 });
    expect(applyAction(s, { type: 'placeStair', floorLow: 0, x: 120 })).toBe(true);
    run(s, at(10));
    expect(settledUpstairs(s)).toBe(s.agents.length);
    expect(s.stats.boardedToday).toBe(0);
  });

  it('stacked stairs chain: two-floor commutes climb twice, no elevator', () => {
    const s = buildScenario({ seed: 4, officeFloors: 2, shafts: 1, carsPerShaft: 1, officesPerFloor: 2 });
    expect(applyAction(s, { type: 'placeStair', floorLow: 0, x: 120 })).toBe(true);
    expect(applyAction(s, { type: 'placeStair', floorLow: 1, x: 130 })).toBe(true);
    run(s, at(10));
    expect(settledUpstairs(s)).toBe(s.agents.length);
    expect(s.stats.boardedToday).toBe(0);
  });

  it('mixed tower: stairs and elevators are both used where each makes sense', () => {
    // Offices on floors 1–5; stair only at 0↔1 near the entrance.
    const s = buildScenario({ seed: 5, officeFloors: 5, shafts: 3, carsPerShaft: 2, officesPerFloor: 6 });
    expect(applyAction(s, { type: 'placeStair', floorLow: 0, x: 150 })).toBe(true);
    let sawClimbing = false;
    while (s.tick < at(11)) {
      run(s, 25);
      if (s.agents.some((a) => a.activity === 'climbing')) sawClimbing = true;
    }
    expect(sawClimbing).toBe(true); // floor-1 workers climbed
    expect(s.stats.boardedToday).toBeGreaterThan(0); // upper floors rode
    expect(settledUpstairs(s)).toBe(s.agents.length);
  });

  it('transfers: elevator to its top served floor, stairs the rest of the way', () => {
    const s = buildScenario({ seed: 6, officeFloors: 3, shafts: 1, carsPerShaft: 2, officesPerFloor: 2 });
    s.shafts[0].highFloor = 2; // shaft no longer reaches floor 3
    expect(applyAction(s, { type: 'placeStair', floorLow: 2, x: 120 })).toBe(true);
    run(s, at(11));
    // Everyone settled — including floor 3, reachable only via ride + climb.
    expect(settledUpstairs(s)).toBe(s.agents.length);
    const floor3 = s.agents.filter((a) => a.floor === 3 && a.activity === 'settled');
    expect(floor3.length).toBeGreaterThan(0);
    expect(s.stats.boardedToday).toBeGreaterThan(0);
    // And the day unwinds: everyone transfers back down and goes home.
    run(s, at(23) - s.tick);
    expect(s.agents.filter((a) => a.activity === 'offsite').length).toBe(s.agents.length);
  });

  it('stair costs cash, refunds 80% within a day, and rejects overlaps', () => {
    const s = buildScenario({ seed: 7, officeFloors: 2, shafts: 1, carsPerShaft: 1, officesPerFloor: 2 });
    expect(applyAction(s, { type: 'placeStair', floorLow: 0, x: 120 })).toBe(true);
    expect(s.cash).toBe(STARTING_CASH - STAIR_COST);
    // Overlaps: an office (floor 1 starts at x=80), the shaft (x=30), another stair.
    expect(applyAction(s, { type: 'placeStair', floorLow: 0, x: 80 })).toBe(false);
    expect(applyAction(s, { type: 'placeStair', floorLow: 0, x: 27 })).toBe(false);
    expect(applyAction(s, { type: 'placeStair', floorLow: 1, x: 121 })).toBe(false);
    const stairId = s.stairs[0].id;
    expect(applyAction(s, { type: 'removeStair', stairId })).toBe(true);
    expect(s.cash).toBe(STARTING_CASH - STAIR_COST + Math.round(STAIR_COST * DEMOLISH_REFUND));
    expect(s.stairs.length).toBe(0);
  });

  it('removing a stair mid-rush strands nobody: climbers step off, walkers re-plan', () => {
    const s = buildScenario({ seed: 8, officeFloors: 1, shafts: 1, carsPerShaft: 2, officesPerFloor: 4 });
    applyAction(s, { type: 'placeStair', floorLow: 0, x: 120 });
    run(s, at(9)); // mid-rush; stair is the popular route
    applyAction(s, { type: 'removeStair', stairId: s.stairs[0].id });
    expect(s.agents.some((a) => a.activity === 'climbing')).toBe(false);
    run(s, at(11) - s.tick);
    // Everyone reached their desk via the elevator instead.
    expect(settledUpstairs(s)).toBe(s.agents.length);
    expect(s.stats.boardedToday).toBeGreaterThan(0);
  });

  it('snapshot + action log with stair actions replays identically', () => {
    const log: LoggedAction[] = [
      { tick: 600, action: { type: 'placeStair', floorLow: 0, x: 120 } },
      { tick: 900, action: { type: 'placeStair', floorLow: 1, x: 132 } },
      { tick: 6000, action: { type: 'removeStair', stairId: 0 } },
      { tick: 8000, action: { type: 'placeFacility', kind: 'office', floor: 2, x: 200 } },
    ];
    const opts = { seed: 9, officeFloors: 3, shafts: 2, carsPerShaft: 2, officesPerFloor: 4 };
    const live = buildScenario(opts);
    runWithLog(live, log, 2 * TICKS_PER_DAY);
    const replayed = buildScenario(opts);
    runWithLog(replayed, log, 2 * TICKS_PER_DAY);
    expect(hashState(replayed)).toBe(hashState(live));
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(live));
  });
});

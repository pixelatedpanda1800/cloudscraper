import { describe, expect, it } from 'vitest';
import { applyAction, buildScenario, hashState, run, runWithLog } from '../src/sim/sim';
import type { LoggedAction } from '../src/sim/sim';
import { TICKS_PER_DAY } from '../src/sim/constants';

const OPTS = { seed: 42, officeFloors: 14, shafts: 6, carsPerShaft: 3, officesPerFloor: 12 };

describe('action system', () => {
  it('snapshot + action log replays to an identical state (save architecture)', () => {
    const log: LoggedAction[] = [
      { tick: 900, action: { type: 'addShaft' } },
      { tick: 1400, action: { type: 'addCar', shaftId: 6 } },
      { tick: 2200, action: { type: 'removeCar', shaftId: 2 } },
      { tick: 3000, action: { type: 'removeShaft', shaftId: 4 } },
      { tick: 4200, action: { type: 'addShaft' } },
    ];
    const live = buildScenario(OPTS);
    runWithLog(live, log, TICKS_PER_DAY);
    const replayed = buildScenario(OPTS);
    runWithLog(replayed, log, TICKS_PER_DAY);
    expect(hashState(replayed)).toBe(hashState(live));
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(live));
  });

  it('removing a busy shaft mid-rush strands nobody', () => {
    const s = buildScenario(OPTS);
    run(s, Math.floor(TICKS_PER_DAY * (9 - 6) / 24)); // 09:00, peak
    expect(applyAction(s, { type: 'removeShaft', shaftId: 0 })).toBe(true);
    expect(s.shafts.length).toBe(5);
    // Everyone previously on shaft 0 must be walking (they re-queue next tick).
    for (const a of s.agents) {
      expect(a.shaftId === 0 && a.activity === 'queuing').toBe(false);
      expect(a.shaftId === 0 && a.activity === 'riding').toBe(false);
    }
    // Day still completes: tower empties by 23:00.
    run(s, Math.floor(TICKS_PER_DAY * (23 - 6) / 24) - s.tick);
    const offsite = s.agents.filter((a) => a.activity === 'offsite').length;
    expect(offsite).toBeGreaterThan(s.agents.length * 0.95);
  });

  it('adding capacity during rush reduces total waiting', () => {
    const preRush = Math.floor(TICKS_PER_DAY * (8 - 6) / 24);
    const postRush = Math.floor(TICKS_PER_DAY * (12 - 6) / 24);

    // Total wait = completed waits + in-flight waits of agents still queuing,
    // so slow towers can't hide their worst cases in uncounted queues.
    const totalWait = (s: ReturnType<typeof buildScenario>) =>
      s.stats.totalWaitTicksToday +
      s.agents.reduce((sum, a) => sum + (a.activity === 'queuing' ? a.waitTicks : 0), 0);

    const lean = buildScenario({ ...OPTS, shafts: 3, carsPerShaft: 2 });
    run(lean, postRush);

    const boosted = buildScenario({ ...OPTS, shafts: 3, carsPerShaft: 2 });
    run(boosted, preRush);
    for (let i = 0; i < 3; i++) applyAction(boosted, { type: 'addShaft' });
    run(boosted, postRush - boosted.tick);

    expect(totalWait(boosted)).toBeLessThan(totalWait(lean) * 0.8);
  });

  it('respects limits: min 1 shaft, 1–8 cars', () => {
    const s = buildScenario({ ...OPTS, shafts: 1, carsPerShaft: 1 });
    expect(applyAction(s, { type: 'removeShaft', shaftId: 0 })).toBe(false);
    expect(applyAction(s, { type: 'removeCar', shaftId: 0 })).toBe(false);
    for (let i = 0; i < 7; i++) expect(applyAction(s, { type: 'addCar', shaftId: 0 })).toBe(true);
    expect(applyAction(s, { type: 'addCar', shaftId: 0 })).toBe(false);
    expect(s.shafts[0].cars.length).toBe(8);
  });
});

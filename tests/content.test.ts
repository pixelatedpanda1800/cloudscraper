import { describe, expect, it } from 'vitest';
import { applyAction, buildScenario, facilityById, hashState, run, runWithLog } from '../src/sim/sim';
import type { LoggedAction, SimState } from '../src/sim/sim';
import { CATALOG } from '../src/sim/catalog';
import { STARTING_CASH, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/sim/constants';

// tick at which the sim clock (starting 06:00 day 0) shows `hour` on `day`
const at = (hour: number, day = 0) => day * TICKS_PER_DAY + Math.floor((hour - 6) * TICKS_PER_HOUR);

const OPTS = { seed: 11, officeFloors: 2, shafts: 2, carsPerShaft: 2, officesPerFloor: 3 };

const residentsOf = (s: SimState, facilityId: number) =>
  s.agents.filter((a) => a.homeFacilityId === facilityId);

describe('1★ content: condos, fast food, noise', () => {
  it('condo: residents move in the first evening and commute out on weekdays', () => {
    const s = buildScenario(OPTS);
    expect(applyAction(s, { type: 'placeFacility', kind: 'condo', floor: 2, x: 200 })).toBe(true);
    const condo = s.facilities[s.facilities.length - 1];
    const residents = residentsOf(s, condo.id);
    expect(residents.length).toBe(CATALOG.condo.workers);
    run(s, at(21)); // day 0, 21:00 — everyone has come home
    for (const r of residents) {
      expect(r.activity).toBe('settled');
      expect(r.floor).toBe(2);
    }
    run(s, at(10, 1) - s.tick); // Tuesday 10:00 — out at work
    for (const r of residents) expect(r.activity).toBe('offsite');
    run(s, at(21, 1) - s.tick); // Tuesday evening — home again
    for (const r of residents) expect(r.activity).toBe('settled');
  });

  it('condo sale: $150k lands at the next midnight, and a sold unit refunds nothing', () => {
    const s = buildScenario(OPTS);
    applyAction(s, { type: 'placeFacility', kind: 'condo', floor: 2, x: 200 });
    const condo = s.facilities[s.facilities.length - 1];
    expect(s.cash).toBe(STARTING_CASH - CATALOG.condo.cost);
    run(s, at(23)); // still day 0: not sold yet
    expect(facilityById(s, condo.id)!.sold).toBe(false);
    run(s, at(1, 1) - s.tick); // past midnight
    expect(facilityById(s, condo.id)!.sold).toBe(true);
    expect(s.cash).toBe(STARTING_CASH - CATALOG.condo.cost + CATALOG.condo.salePrice);
    // The sale consumed the developer's stake: demolishing refunds $0.
    const cashBefore = s.cash;
    expect(applyAction(s, { type: 'demolishFacility', facilityId: condo.id })).toBe(true);
    expect(s.cash).toBe(cashBefore);
  });

  it('fast food: staffed all week, and lunching workers spend money there', () => {
    const s = buildScenario(OPTS);
    expect(applyAction(s, { type: 'placeFacility', kind: 'fastfood', floor: 1, x: 200 })).toBe(true);
    const ff = s.facilities[s.facilities.length - 1];
    expect(residentsOf(s, ff.id).length).toBe(CATALOG.fastfood.workers);
    run(s, at(11)); // staff arrived, lunch not yet
    const staff = residentsOf(s, ff.id);
    for (const st of staff) expect(st.activity).not.toBe('offsite');
    const cashBeforeLunch = s.cash;
    run(s, at(15) - s.tick); // lunch rush done
    const earned = s.cash - cashBeforeLunch;
    expect(earned).toBeGreaterThan(0);
    expect(earned % CATALOG.fastfood.spendPerVisit).toBe(0);
  });

  it('noise: a fast food next door stresses residents at home; a quiet condo recovers', () => {
    const s = buildScenario(OPTS);
    // Noisy pair on floor 2: condo at 200..215, fast food at 217..232 (gap 1 ≤ 2).
    applyAction(s, { type: 'placeFacility', kind: 'condo', floor: 2, x: 200 });
    const noisyCondo = s.facilities[s.facilities.length - 1];
    applyAction(s, { type: 'placeFacility', kind: 'fastfood', floor: 2, x: 217 });
    // Quiet control condo — horizontally far (±1 floor still counts as
    // adjacent, so distance must come from the x axis).
    applyAction(s, { type: 'placeFacility', kind: 'condo', floor: 1, x: 64 });
    const quietCondo = s.facilities[s.facilities.length - 1];

    expect(facilityById(s, noisyCondo.id)!.noise).toBeGreaterThan(0);
    expect(facilityById(s, quietCondo.id)!.noise).toBe(0);

    run(s, at(21, 1)); // a full evening at home next to the fryers
    const noisyStress = Math.max(...residentsOf(s, noisyCondo.id).map((a) => a.stress));
    const quietStress = Math.max(...residentsOf(s, quietCondo.id).map((a) => a.stress));
    expect(noisyStress).toBeGreaterThan(quietStress + 3);
  });

  it('noise updates when the emitter is demolished', () => {
    const s = buildScenario(OPTS);
    applyAction(s, { type: 'placeFacility', kind: 'condo', floor: 2, x: 200 });
    const condo = s.facilities[s.facilities.length - 1];
    applyAction(s, { type: 'placeFacility', kind: 'fastfood', floor: 2, x: 217 });
    const ff = s.facilities[s.facilities.length - 1];
    expect(facilityById(s, condo.id)!.noise).toBeGreaterThan(0);
    applyAction(s, { type: 'demolishFacility', facilityId: ff.id });
    expect(facilityById(s, condo.id)!.noise).toBe(0);
  });

  it('snapshot + action log with condos and fast food replays identically', () => {
    const log: LoggedAction[] = [
      { tick: 600, action: { type: 'placeFacility', kind: 'condo', floor: 2, x: 200 } },
      { tick: 900, action: { type: 'placeFacility', kind: 'fastfood', floor: 1, x: 200 } },
      { tick: 5000, action: { type: 'placeFacility', kind: 'condo', floor: 1, x: 220 } },
      { tick: 12000, action: { type: 'demolishFacility', facilityId: 7 } },
    ];
    const live = buildScenario(OPTS);
    runWithLog(live, log, 3 * TICKS_PER_DAY);
    const replayed = buildScenario(OPTS);
    runWithLog(replayed, log, 3 * TICKS_PER_DAY);
    expect(hashState(replayed)).toBe(hashState(live));
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(live));
  });
});

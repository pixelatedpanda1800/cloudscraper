import { describe, expect, it } from 'vitest';
import { applyAction, buildScenario, run, unitComplaints } from '../src/sim/sim';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/sim/constants';

const at = (day: number, hour: number) => day * TICKS_PER_DAY + Math.floor((hour - 6) * TICKS_PER_HOUR);

describe('inspector deep-link data (GDD §5)', () => {
  it('complaints rank by inflicted stress and carry their culprits', () => {
    // A condo whose residents both endure a starved elevator (1 shaft, 1 car,
    // pop for 4 floors) and live next to a fast food: two ranked complaints.
    const s = buildScenario({ seed: 21, officeFloors: 4, shafts: 1, carsPerShaft: 1, officesPerFloor: 10 });
    expect(applyAction(s, { type: 'placeFacility', kind: 'condo', floor: 4, x: 200 })).toBe(true);
    const condo = s.facilities[s.facilities.length - 1];
    expect(applyAction(s, { type: 'placeFacility', kind: 'fastfood', floor: 4, x: 217 })).toBe(true);
    const fastfood = s.facilities[s.facilities.length - 1];

    run(s, at(1, 21)); // day 1 evening: residents commuted home through the crush
    const cs = unitComplaints(s, condo.id);
    expect(cs.length).toBeGreaterThanOrEqual(2);
    // Ranked by magnitude, strictly descending.
    for (let i = 1; i < cs.length; i++) expect(cs[i].magnitude).toBeLessThanOrEqual(cs[i - 1].magnitude);
    const noise = cs.find((c) => c.cause === 'noise');
    expect(noise).toBeDefined();
    expect(noise!.emitterFacilityId).toBe(fastfood.id); // deep-link lands on the culprit
    const wait = cs.find((c) => c.cause === 'elevator waits');
    expect(wait).toBeDefined();
    expect(wait!.shaftId).toBe(0);
  });

  it('per-shaft wait stats accumulate through the day and reset at midnight', () => {
    const s = buildScenario({ seed: 22, officeFloors: 5, shafts: 2, carsPerShaft: 2, officesPerFloor: 6 });
    run(s, at(0, 12));
    const boarded = s.shafts.map((sh) => sh.boardedToday);
    expect(boarded[0] + boarded[1]).toBe(s.stats.boardedToday);
    expect(boarded[0] + boarded[1]).toBeGreaterThan(0);
    const waits = s.shafts.map((sh) => sh.waitTicksToday);
    expect(waits[0] + waits[1]).toBe(s.stats.totalWaitTicksToday);
    run(s, at(1, 0) - s.tick + 1); // past midnight
    for (const sh of s.shafts) {
      expect(sh.boardedToday).toBe(0);
      expect(sh.waitTicksToday).toBe(0);
    }
  });
});

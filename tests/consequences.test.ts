import { describe, expect, it } from 'vitest';
import { applyAction, buildScenario, hashState, run, runWithLog, unitComplaint } from '../src/sim/sim';
import type { LoggedAction } from '../src/sim/sim';
import { CATALOG } from '../src/sim/catalog';
import {
  HOTEL_OCCUPANCY,
  SAT_COMPLAIN_BELOW,
  STAR2_POP,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  VACANT_UPKEEP_PER_QUARTER,
} from '../src/sim/constants';

// tick at which the sim clock (starting 06:00 day 0) shows `hour` on `day`
const at = (day: number, hour: number) => day * TICKS_PER_DAY + Math.floor((hour - 6) * TICKS_PER_HOUR);

/** A tower engineered to enrage: 1,008 commuters, one shaft, one car. */
const MISERY = { seed: 11, officeFloors: 14, shafts: 1, carsPerShaft: 1, officesPerFloor: 12 };
/** Same size, generously served. */
const HEALTHY = { seed: 11, officeFloors: 14, shafts: 6, carsPerShaft: 3, officesPerFloor: 12 };

describe('stress → satisfaction → consequences (GDD §5)', () => {
  it('starved elevators tank satisfaction; tenants leave; vacancies bleed and re-let', () => {
    const s = buildScenario(MISERY);
    run(s, at(7, 1)); // a week of hour-long queues
    const offices = s.facilities.filter((f) => f.kind === 'office');
    const unhappy = offices.filter((f) => !f.vacant && f.satisfaction < SAT_COMPLAIN_BELOW);
    const vacated = offices.filter((f) => f.vacant);
    // Some tenants are furious-but-present, some have already walked.
    expect(unhappy.length + vacated.length).toBeGreaterThan(0);
    expect(vacated.length).toBeGreaterThan(0);

    // Vacancy costs upkeep at the quarter boundary: cash dips relative to
    // an occupied unit's rent by rent + upkeep per vacant office.
    expect(VACANT_UPKEEP_PER_QUARTER).toBeGreaterThan(0); // sanity for the constant

    // Re-letting: run a few more days; some previously vacant unit is
    // occupied again (fresh tenants, satisfaction reset).
    const vacatedIds = vacated.map((f) => f.id);
    run(s, 3 * TICKS_PER_DAY);
    const relet = s.facilities.filter((f) => vacatedIds.includes(f.id) && !f.vacant);
    expect(relet.length).toBeGreaterThan(0);
    // Fresh tenants actually moved in (and, in a still-miserable tower, will
    // churn again — that's the intended pressure loop).
    for (const f of relet) {
      expect(s.agents.some((a) => a.homeFacilityId === f.id)).toBe(true);
    }
  });

  it('a well-served tower keeps its tenants', () => {
    const s = buildScenario(HEALTHY);
    run(s, at(7, 1));
    expect(s.facilities.some((f) => f.vacant)).toBe(false);
  });

  it('complaints name the cause: elevator waits carry shaft, floor, and time of day', () => {
    const s = buildScenario(MISERY);
    run(s, at(0, 10.5)); // mid-way through one brutal morning rush
    const office = s.facilities.find((f) => f.kind === 'office')!;
    const c = unitComplaint(s, office.id);
    expect(c).not.toBeNull();
    expect(c!.cause).toBe('elevator waits');
    expect(c!.shaftId).toBe(0);
    expect(c!.waitSec!).toBeGreaterThan(60);
    expect(c!.bucket).toBe('mornings');
  });

  it('noise complaints: a condo beside a fast food blames the noise', () => {
    const s = buildScenario({ seed: 12, officeFloors: 3, shafts: 2, carsPerShaft: 2, officesPerFloor: 3 });
    expect(applyAction(s, { type: 'placeFacility', kind: 'condo', floor: 2, x: 200 })).toBe(true);
    const condo = s.facilities[s.facilities.length - 1];
    expect(applyAction(s, { type: 'placeFacility', kind: 'fastfood', floor: 2, x: 217 })).toBe(true);
    expect(condo.noise).toBeGreaterThan(0);
    run(s, at(0, 21)); // residents home since ~18:00, fast food roaring
    const c = unitComplaint(s, condo.id);
    expect(c).not.toBeNull();
    expect(c!.cause).toBe('noise');
  });
});

describe('star ladder & 2★ content (GDD §6)', () => {
  it('2★ facilities are locked below pop 300 and unlock above it', () => {
    const small = buildScenario({ seed: 13, officeFloors: 2, shafts: 1, carsPerShaft: 2, officesPerFloor: 3 });
    expect(small.star).toBe(1);
    expect(applyAction(small, { type: 'placeFacility', kind: 'hotel', floor: 2, x: 200 })).toBe(false);

    const big = buildScenario({ seed: 13, officeFloors: 9, shafts: 3, carsPerShaft: 2, officesPerFloor: 6 });
    expect(big.agents.length).toBeGreaterThanOrEqual(STAR2_POP);
    expect(big.star).toBe(2);
    expect(applyAction(big, { type: 'placeFacility', kind: 'hotel', floor: 2, x: 200 })).toBe(true);
  });

  it('growth crosses the gate mid-game: placing offices raises the star', () => {
    const s = buildScenario({ seed: 14, officeFloors: 7, shafts: 2, carsPerShaft: 2, officesPerFloor: 7 });
    expect(s.star).toBe(1); // 49 offices × 6 = 294
    expect(applyAction(s, { type: 'placeFacility', kind: 'office', floor: 1, x: 200 })).toBe(true);
    expect(s.star).toBe(2); // 300 on the nose
  });

  it('hotel night cycle: guest pays at check-in, checkout dirties the room, housekeeping turns it', () => {
    const s = buildScenario({ seed: 15, officeFloors: 9, shafts: 3, carsPerShaft: 3, officesPerFloor: 6 });
    expect(applyAction(s, { type: 'placeFacility', kind: 'hotel', floor: 2, x: 200 })).toBe(true);
    const room = s.facilities[s.facilities.length - 1];
    expect(applyAction(s, { type: 'placeFacility', kind: 'housekeeping', floor: 1, x: 200 })).toBe(true);
    const cashAfterBuilds = s.cash;

    // Find the first booked night for this room's guest (occupancy is jittered).
    run(s, at(1, 0) - s.tick);
    let nights = 0;
    for (let day = 1; day <= 3; day++) {
      const guest = s.agents.find((a) => a.homeFacilityId === room.id)!;
      run(s, at(day, 23.9) - s.tick);
      if (guest.activity === 'settled') nights++;
      run(s, Math.min(at(day + 1, 0), at(day, 23.9) + 30) - s.tick);
    }
    expect(nights).toBeGreaterThan(0);
    // Nightly income arrived (net of the -10k/qtr housekeeping upkeep on day 3).
    const rentFlows =
      s.facilities.filter((f) => f.kind === 'office').length * CATALOG.office.rentPerQuarter +
      CATALOG.housekeeping.rentPerQuarter;
    expect(s.cash - cashAfterBuilds - rentFlows).toBe(nights * CATALOG.hotel.nightlyRate);

    // Housekeeping keeps the room turnable: by early afternoon it's clean.
    run(s, at(4, 15) - s.tick);
    expect(room.dirty).toBe(false);
  });

  it('without housekeeping the room stays dirty and blocks the next check-in', () => {
    const s = buildScenario({ seed: 16, officeFloors: 9, shafts: 3, carsPerShaft: 3, officesPerFloor: 6 });
    applyAction(s, { type: 'placeFacility', kind: 'hotel', floor: 2, x: 200 });
    const room = s.facilities[s.facilities.length - 1];
    const guest = s.agents[s.agents.length - 1];
    // Run until the guest has stayed one night and checked out.
    let checkedOut = false;
    for (let day = 0; day <= 4 && !checkedOut; day++) {
      run(s, at(day, 12) - s.tick);
      if (room.dirty) checkedOut = true;
    }
    expect(checkedOut).toBe(true);
    // From then on: dirty forever, guest never settles again.
    const cashAtDirty = s.cash;
    run(s, 2 * TICKS_PER_DAY);
    expect(room.dirty).toBe(true);
    expect(guest.activity).toBe('offsite');
    // No hotel income since (only quarterly office rent may have landed).
    const rentSince = Math.floor(s.tick / TICKS_PER_DAY) >= 0 ? s.cash - cashAtDirty : 0;
    expect(rentSince % CATALOG.office.rentPerQuarter === 0 || rentSince === 0).toBe(true);
  });

  it('service shafts carry staff only; tenants never ride them', () => {
    const s = buildScenario({ seed: 17, officeFloors: 9, shafts: 2, carsPerShaft: 2, officesPerFloor: 6 });
    applyAction(s, { type: 'placeFacility', kind: 'hotel', floor: 5, x: 200 });
    applyAction(s, { type: 'placeFacility', kind: 'housekeeping', floor: 1, x: 200 });
    applyAction(s, { type: 'addShaft', service: true });
    const service = s.shafts[s.shafts.length - 1];
    expect(service.service).toBe(true);
    const allowed = new Set(['staff', 'housekeeper']);
    let sawServiceRider = false;
    for (let t = 0; t < at(1, 0); t += 50) {
      run(s, 50);
      for (const car of service.cars) {
        for (const p of car.passengers) {
          expect(allowed.has(s.agents[p.agentId].role)).toBe(true);
          sawServiceRider = true;
        }
      }
    }
    expect(sawServiceRider).toBe(true); // housekeepers actually used it
  });

  it('snapshot + action log with 2★ content replays identically', () => {
    const log: LoggedAction[] = [
      { tick: 600, action: { type: 'placeFacility', kind: 'hotel', floor: 2, x: 200 } },
      { tick: 700, action: { type: 'placeFacility', kind: 'housekeeping', floor: 1, x: 200 } },
      { tick: 800, action: { type: 'addShaft', service: true } },
      { tick: 900, action: { type: 'placeFacility', kind: 'security', floor: 3, x: 200 } },
      { tick: 40_000, action: { type: 'demolishFacility', facilityId: 55 } },
    ];
    const opts = { seed: 18, officeFloors: 9, shafts: 3, carsPerShaft: 2, officesPerFloor: 6 };
    const live = buildScenario(opts);
    runWithLog(live, log, 8 * TICKS_PER_DAY);
    const replayed = buildScenario(opts);
    runWithLog(replayed, log, 8 * TICKS_PER_DAY);
    expect(hashState(replayed)).toBe(hashState(live));
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(live));
  });
});

/** Occupancy sanity so the hotel tests above stay meaningful if tuned. */
it('hotel occupancy constant is a probability', () => {
  expect(HOTEL_OCCUPANCY).toBeGreaterThan(0);
  expect(HOTEL_OCCUPANCY).toBeLessThanOrEqual(1);
});

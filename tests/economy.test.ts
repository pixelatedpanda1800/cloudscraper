import { describe, expect, it } from 'vitest';
import { applyAction, buildScenario, facilityById, hashState, run, runWithLog } from '../src/sim/sim';
import type { LoggedAction } from '../src/sim/sim';
import { CATALOG } from '../src/sim/catalog';
import {
  CAR_COST,
  DAYS_PER_QUARTER,
  DEMOLISH_REFUND,
  SHAFT_COST,
  STARTING_CASH,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../src/sim/constants';

const { cost: OFFICE_COST, rentPerQuarter: OFFICE_RENT_PER_QUARTER, workers: OFFICE_WORKERS } =
  CATALOG.office;

const OPTS = { seed: 7, officeFloors: 3, shafts: 2, carsPerShaft: 2, officesPerFloor: 3 };

// tick at which the sim clock (starting 06:00) shows `hour` on day 0
const at = (hour: number) => Math.floor((hour - 6) * TICKS_PER_HOUR);

describe('economy: cash, build costs, rent, refunds', () => {
  it('placing an office charges cash and staffs it with commuting workers', () => {
    const s = buildScenario(OPTS);
    const agentsBefore = s.agents.length;
    expect(applyAction(s, { type: 'placeFacility', kind: 'office', floor: 3, x: 200 })).toBe(true);
    expect(s.cash).toBe(STARTING_CASH - OFFICE_COST);
    expect(s.agents.length).toBe(agentsBefore + OFFICE_WORKERS);
    // New hires show up: run to 11:00; at least one of them is settled upstairs.
    run(s, at(11));
    const hires = s.agents.slice(agentsBefore);
    expect(hires.some((a) => a.activity === 'settled' && a.floor === 3)).toBe(true);
  });

  it('rejects unaffordable, overlapping, and out-of-bounds placements', () => {
    const s = buildScenario(OPTS);
    // Overlap with an existing office (scenario offices start at x=80).
    expect(applyAction(s, { type: 'placeFacility', kind: 'office', floor: 1, x: 82 })).toBe(false);
    // Overlap with the shaft cluster (shafts at x=30, 36).
    expect(applyAction(s, { type: 'placeFacility', kind: 'office', floor: 2, x: 28 })).toBe(false);
    // Lobby floor and out-of-lot.
    expect(applyAction(s, { type: 'placeFacility', kind: 'office', floor: 0, x: 200 })).toBe(false);
    expect(applyAction(s, { type: 'placeFacility', kind: 'office', floor: 1, x: 235 })).toBe(false);
    // Broke.
    s.cash = OFFICE_COST - 1;
    expect(applyAction(s, { type: 'placeFacility', kind: 'office', floor: 3, x: 200 })).toBe(false);
    expect(s.cash).toBe(OFFICE_COST - 1); // rejected actions never touch cash
  });

  it('shafts and cars cost money', () => {
    const s = buildScenario(OPTS);
    applyAction(s, { type: 'addShaft' });
    applyAction(s, { type: 'addCar', shaftId: 0 });
    expect(s.cash).toBe(STARTING_CASH - SHAFT_COST - CAR_COST);
    s.cash = 0;
    expect(applyAction(s, { type: 'addShaft' })).toBe(false);
    expect(applyAction(s, { type: 'addCar', shaftId: 0 })).toBe(false);
  });

  it('demolish within a day refunds 80% of what was paid; workers leave and never return', () => {
    const s = buildScenario(OPTS);
    applyAction(s, { type: 'placeFacility', kind: 'office', floor: 3, x: 200 });
    const placed = s.facilities[s.facilities.length - 1];
    const hires = s.agents.slice(-OFFICE_WORKERS).map((a) => a.id);

    run(s, at(10)); // workers are inside by now
    const cashBefore = s.cash;
    expect(applyAction(s, { type: 'demolishFacility', facilityId: placed.id })).toBe(true);
    expect(s.cash).toBe(cashBefore + Math.round(OFFICE_COST * DEMOLISH_REFUND));
    expect(facilityById(s, placed.id)).toBeUndefined();

    // Nobody is stranded queuing/riding for a dead office, and by the next
    // morning's rush the departed workers are still offsite.
    run(s, at(23) - s.tick);
    for (const id of hires) expect(s.agents[id].activity).toBe('offsite');
    run(s, TICKS_PER_DAY); // same time next day, mid-workday for everyone else
    for (const id of hires) {
      expect(s.agents[id].activity).toBe('offsite');
      expect(s.agents[id].homeFacilityId).toBe(-1);
    }
  });

  it('scenario-built facilities were never paid for, so demolishing them refunds nothing', () => {
    const s = buildScenario(OPTS);
    const office = s.facilities.find((f) => f.kind === 'office')!;
    const cashBefore = s.cash;
    expect(applyAction(s, { type: 'demolishFacility', facilityId: office.id })).toBe(true);
    expect(s.cash).toBe(cashBefore);
  });

  it('demolishing the lobby is rejected', () => {
    const s = buildScenario(OPTS);
    expect(applyAction(s, { type: 'demolishFacility', facilityId: 0 })).toBe(false);
  });

  it('offices pay rent once per quarter', () => {
    const s = buildScenario(OPTS);
    const offices = s.facilities.filter((f) => f.kind === 'office').length;
    // Day 0 starts at 06:00, so exactly one quarter boundary (day 3 midnight)
    // falls inside three sim-days of running.
    run(s, DAYS_PER_QUARTER * TICKS_PER_DAY);
    expect(s.cash).toBe(STARTING_CASH + offices * OFFICE_RENT_PER_QUARTER);
  });

  it('snapshot + action log with economy actions replays identically', () => {
    const log: LoggedAction[] = [
      { tick: 600, action: { type: 'placeFacility', kind: 'office', floor: 3, x: 200 } },
      { tick: 900, action: { type: 'addShaft' } },
      { tick: 5000, action: { type: 'placeFacility', kind: 'office', floor: 2, x: 180 } },
      { tick: 9000, action: { type: 'demolishFacility', facilityId: 10 } },
    ];
    const live = buildScenario(OPTS);
    runWithLog(live, log, 2 * TICKS_PER_DAY);
    const replayed = buildScenario(OPTS);
    runWithLog(replayed, log, 2 * TICKS_PER_DAY);
    expect(hashState(replayed)).toBe(hashState(live));
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(live));
  });
});

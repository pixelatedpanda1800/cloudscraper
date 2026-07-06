import { describe, expect, it } from 'vitest';
import { buildScenario, hashState, run, tick } from '../src/sim/sim';
import { TICKS_PER_DAY } from '../src/sim/constants';

const OPTS = { seed: 42, officeFloors: 14, shafts: 6, carsPerShaft: 3, officesPerFloor: 12 };

describe('determinism (M0 exit criteria)', () => {
  it('two sims with the same seed are tick-for-tick identical over a full day', () => {
    const a = buildScenario(OPTS);
    const b = buildScenario(OPTS);
    for (let i = 0; i < TICKS_PER_DAY; i++) {
      tick(a);
      tick(b);
      if (i % 600 === 0) expect(hashState(a)).toBe(hashState(b));
    }
    expect(hashState(a)).toBe(hashState(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a snapshot restored mid-run replays to the same end state', () => {
    const live = buildScenario(OPTS);
    run(live, 3000);
    const snapshot = JSON.parse(JSON.stringify(live));
    run(live, 3000);
    run(snapshot, 3000);
    expect(hashState(snapshot)).toBe(hashState(live));
  });

  it('different seeds diverge', () => {
    const a = buildScenario({ ...OPTS, seed: 1 });
    const b = buildScenario({ ...OPTS, seed: 2 });
    run(a, 4000);
    run(b, 4000);
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe('simulation sanity', () => {
  it('~1,000 agents commute in and reach their offices on a workday', () => {
    const s = buildScenario(OPTS);
    expect(s.agents.length).toBeGreaterThanOrEqual(1000);
    run(s, Math.floor(TICKS_PER_DAY * (11.5 - 6) / 24)); // 06:00 → 11:30
    const atDesk = s.agents.filter((a) => a.activity === 'settled' && a.floor > 0).length;
    expect(atDesk).toBeGreaterThan(s.agents.length * 0.85);
  });

  it('the tower empties in the evening', () => {
    const s = buildScenario(OPTS);
    run(s, Math.floor(TICKS_PER_DAY * (23 - 6) / 24)); // 06:00 → 23:00
    const offsite = s.agents.filter((a) => a.activity === 'offsite').length;
    expect(offsite).toBeGreaterThan(s.agents.length * 0.95);
  });

  it('queuing raises stress; settling recovers it', () => {
    const s = buildScenario(OPTS);
    run(s, Math.floor(TICKS_PER_DAY * (10 - 6) / 24)); // after morning rush
    const everStressed = s.agents.some((a) => a.stress > 0);
    expect(everStressed).toBe(true);
  });

  it('elevators never exceed capacity and end each trip at a served floor', () => {
    const s = buildScenario(OPTS);
    for (let i = 0; i < 5000; i++) {
      tick(s);
      for (const shaft of s.shafts) {
        for (const car of shaft.cars) {
          expect(car.passengers.length).toBeLessThanOrEqual(20);
          expect(car.pos).toBeGreaterThanOrEqual(shaft.lowFloor - 1e-9);
          expect(car.pos).toBeLessThanOrEqual(shaft.highFloor + 1e-9);
        }
      }
    }
  });

  it('weekend: nobody comes to work', () => {
    const s = buildScenario(OPTS);
    run(s, TICKS_PER_DAY * 5 + Math.floor(TICKS_PER_DAY / 2)); // mid-Saturday
    const inTower = s.agents.filter((a) => a.activity !== 'offsite').length;
    expect(inTower).toBe(0);
  });
});

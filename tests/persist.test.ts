import { describe, expect, it } from 'vitest';
import { buildScenario, hashState, run, runWithLog } from '../src/sim/sim';
import type { LoggedAction } from '../src/sim/sim';
import { decodeSave, encodeSave, SAVE_VERSION } from '../src/persist';
import { TICKS_PER_DAY } from '../src/sim/constants';

const OPTS = { seed: 31, officeFloors: 5, shafts: 3, carsPerShaft: 2, officesPerFloor: 6 };

describe('local save/load (GDD §12 save-file shape)', () => {
  it('round-trips a mid-run state and continues deterministically', () => {
    const log: LoggedAction[] = [
      { tick: 600, action: { type: 'placeStair', floorLow: 0, x: 150 } },
      { tick: 900, action: { type: 'placeFacility', kind: 'fastfood', floor: 2, x: 200 } },
    ];
    const original = buildScenario(OPTS);
    runWithLog(original, log, Math.floor(TICKS_PER_DAY * 1.5));

    const file = decodeSave(encodeSave(original, log, '2026-07-07T12:00:00Z'));
    expect(file).not.toBeNull();
    expect(hashState(file!.state)).toBe(hashState(original));
    expect(file!.actionLog).toEqual(log);
    expect(file!.savedAtIso).toBe('2026-07-07T12:00:00Z');

    // The restored state is a working sim: both timelines stay identical.
    run(original, TICKS_PER_DAY);
    run(file!.state, TICKS_PER_DAY);
    expect(hashState(file!.state)).toBe(hashState(original));
    expect(JSON.stringify(file!.state)).toBe(JSON.stringify(original));
  });

  it('rejects corruption, tampering, and version mismatches instead of loading them', () => {
    const s = buildScenario(OPTS);
    run(s, 1000);
    const good = encodeSave(s, [], '2026-07-07T12:00:00Z');

    expect(decodeSave('not json {')).toBeNull();
    expect(decodeSave('{}')).toBeNull();
    expect(decodeSave(good.replace(`"version":${SAVE_VERSION}`, '"version":999'))).toBeNull();
    // Tampered state (cash bump) no longer matches its hash.
    expect(decodeSave(good.replace(`"cash":${s.cash}`, `"cash":${s.cash + 1_000_000}`))).toBeNull();
    // The pristine file still decodes.
    expect(decodeSave(good)).not.toBeNull();
  });
});

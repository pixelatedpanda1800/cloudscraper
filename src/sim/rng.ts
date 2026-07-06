/** Deterministic PRNG (mulberry32). All sim randomness flows through this —
 *  never Math.random(), never Date. State is a plain number so it serializes. */

export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Returns float in [0, 1). Mutates rng state. */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

/** Order-independent deterministic jitter: hash of (seed, agentId, day, salt).
 *  Used for daily schedules so iteration order can never affect outcomes. */
export function hashJitter(seed: number, a: number, b: number, salt: number): number {
  let h = (seed ^ Math.imul(a + 1, 2654435761) ^ Math.imul(b + 1, 40503) ^ Math.imul(salt + 1, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296; // [0,1)
}

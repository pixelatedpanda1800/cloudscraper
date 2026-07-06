import type { SimState } from './types';

/** FNV-1a over the numerically significant sim state. Two states with equal
 *  hashes over a long run are, for our purposes, identical — this is the
 *  determinism/replay check (GDD §12), not a cryptographic guarantee. */
export function hashState(state: SimState): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    // Quantize floats so -0/+0 and representation noise can't differ.
    const v = Math.round(n * 1024) | 0;
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  };

  mix(state.tick);
  mix(state.rng.s);
  for (const a of state.agents) {
    mix(a.x);
    mix(a.floor);
    mix(a.stress);
    mix(a.waitTicks);
    mix(a.destFloor);
    mix(a.shaftId);
    mix(a.activity.length); // cheap enum discriminator
    mix(a.intent.length);
  }
  mix(state.shafts.length);
  for (const s of state.shafts) {
    mix(s.id);
    mix(s.x);
    mix(s.cars.length);
    for (const car of s.cars) {
      mix(car.pos);
      mix(car.target);
      mix(car.dir);
      mix(car.doorTicks);
      mix(car.passengers.length);
      for (const p of car.passengers) {
        mix(p.agentId);
        mix(p.dest);
      }
    }
    for (let f = s.lowFloor; f <= s.highFloor; f++) {
      for (const id of s.queueUp[f]) mix(id);
      for (const id of s.queueDown[f]) mix(id + 1_000_000);
    }
  }
  return h >>> 0;
}

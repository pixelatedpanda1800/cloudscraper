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
  mix(state.cash);
  mix(state.star);
  mix(state.facilities.length);
  for (const f of state.facilities) {
    mix(f.id);
    mix(f.kind.length); // cheap enum discriminator
    mix(f.floor);
    mix(f.x);
    mix(f.width);
    mix(f.sold ? 1 : 0);
    mix(f.noise);
    mix(f.satisfaction);
    mix(f.lowSatQuarters);
    mix(f.vacant ? 1 : 0);
    mix(f.dirty ? 1 : 0);
    mix(f.assignedTo);
  }
  for (const a of state.agents) {
    mix(a.x);
    mix(a.floor);
    mix(a.stress);
    mix(a.waitTicks);
    mix(a.destFloor);
    mix(a.shaftId);
    mix(a.homeFacilityId);
    mix(a.legViaId);
    mix(a.legFloor);
    mix(a.climbTicksLeft);
    mix(a.visitFacilityId);
    mix(a.activity.length); // cheap enum discriminator
    mix(a.intent.length);
  }
  mix(state.stairs.length);
  for (const st of state.stairs) {
    mix(st.id);
    mix(st.floorLow);
    mix(st.x);
  }
  mix(state.shafts.length);
  for (const s of state.shafts) {
    mix(s.id);
    mix(s.x);
    mix(s.service ? 1 : 0);
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

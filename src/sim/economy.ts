import { departTenants, spawnTenants } from './agents';
import { CATALOG, tracksSatisfaction } from './catalog';
import { tickOfDay } from './clock';
import {
  RELET_DAYS,
  SAT_DAILY_ALPHA,
  SAT_INITIAL,
  SAT_LEAVE_BELOW,
  SAT_LEAVE_QUARTERS,
  STAR2_POP,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  VACANT_UPKEEP_PER_QUARTER,
} from './constants';
import type { Facility, SimState } from './types';

/** Economy and consequence events driven by the sim clock (GDD §5, §8).
 *  Everything here is called from tick() at day/quarter boundaries — never
 *  from the UI — so replay reproduces it exactly. */

/** Quarterly money + tenancy consequences. Occupied units pay rent (negative
 *  rent = staff cost); vacant units bleed upkeep. Units below the leave
 *  threshold for two consecutive quarters lose their tenants (GDD §5). */
export function collectQuarterRent(state: SimState): void {
  for (const f of state.facilities) {
    const def = CATALOG[f.kind];
    if (!tracksSatisfaction(def)) {
      state.cash += def.rentPerQuarter;
      continue;
    }
    if (f.vacant) {
      state.cash -= VACANT_UPKEEP_PER_QUARTER;
      continue;
    }
    state.cash += def.rentPerQuarter;
    if (f.satisfaction < SAT_LEAVE_BELOW) {
      f.lowSatQuarters++;
      if (f.lowSatQuarters >= SAT_LEAVE_QUARTERS) vacate(state, f);
    } else {
      f.lowSatQuarters = 0;
    }
  }
}

function vacate(state: SimState, f: Facility): void {
  departTenants(state, f.id);
  f.vacant = true;
  f.vacantSinceTick = state.tick;
  f.lowSatQuarters = 0;
}

/** Midnight sweep: vacant units re-let after a couple of days — fresh
 *  tenants, fresh benefit of the doubt. Condos re-let without a second sale
 *  (the resale is between owners; `sold` stays true). */
export function reletVacancies(state: SimState): void {
  for (const f of state.facilities) {
    if (!f.vacant || state.tick - f.vacantSinceTick < RELET_DAYS * TICKS_PER_DAY) continue;
    f.vacant = false;
    f.satisfaction = SAT_INITIAL;
    spawnTenants(state, f, CATALOG[f.kind]);
  }
}

/** Midnight sweep: one-time-sale units (condos) placed during the previous
 *  day close their sale. Selling zeroes the unit's refundable cost — the
 *  developer's stake is recovered, so demolish-then-refund can't double-dip
 *  the sale price. */
export function collectDailySales(state: SimState): void {
  for (const f of state.facilities) {
    const price = CATALOG[f.kind].salePrice;
    if (price > 0 && !f.sold) {
      state.cash += price;
      f.sold = true;
      f.cost = 0;
    }
  }
}

/** Midnight sweep: units' rolling satisfaction chases (100 − avg tenant peak
 *  stress of the day just ended), then the per-day stress bookkeeping resets.
 *  Peak (not average) stress is what tenants remember: a brutal morning queue
 *  shouldn't be laundered by a calm afternoon at the desk (GDD §5). */
export function updateDailySatisfaction(state: SimState): void {
  const sum = new Map<number, { total: number; n: number }>();
  for (const a of state.agents) {
    if (a.homeFacilityId < 0) continue;
    const e = sum.get(a.homeFacilityId);
    if (e) {
      e.total += a.peakStressToday;
      e.n++;
    } else {
      sum.set(a.homeFacilityId, { total: a.peakStressToday, n: 1 });
    }
  }
  for (const f of state.facilities) {
    if (!tracksSatisfaction(CATALOG[f.kind]) || f.vacant) continue;
    const e = sum.get(f.id);
    const avgPeak = e ? e.total / e.n : 0;
    f.satisfaction += SAT_DAILY_ALPHA * (100 - avgPeak - f.satisfaction);
    f.satisfaction = Math.max(0, Math.min(100, f.satisfaction));
  }
  for (const a of state.agents) {
    a.peakStressToday = a.stress;
    a.stressWaitToday = 0;
    a.stressNoiseToday = 0;
    a.stressClimbToday = 0;
    a.worstWaitTicks = 0;
    a.worstWaitShaftId = -1;
    a.worstWaitFloor = -1;
    a.worstWaitTod = -1;
  }
}

/** Star ladder progression (GDD §6): population 300 reaches 2★. Monotonic —
 *  a shrinking tower keeps its rating. Population = everyone who currently
 *  calls the tower home or workplace. */
export function updateStar(state: SimState): number {
  let pop = 0;
  for (const a of state.agents) {
    if (a.homeFacilityId >= 0) pop++;
  }
  if (state.star < 2 && pop >= STAR2_POP) state.star = 2;
  return pop;
}

/** The Inspector's raison d'être (GDD §5): a unit's dominant complaint with
 *  its cause pinned to a place and time of day. Derived from tenants' stress
 *  bookkeeping; null when the tenants have nothing to grumble about. */
export interface UnitComplaint {
  cause: 'elevator waits' | 'noise' | 'stair climbs';
  /** Worst single wait backing an elevator complaint. */
  waitSec?: number;
  shaftId?: number;
  floor?: number;
  bucket?: 'mornings' | 'midday' | 'evenings';
}

export function unitComplaint(state: SimState, facilityId: number): UnitComplaint | null {
  let wait = 0;
  let noise = 0;
  let climb = 0;
  let worst: { ticks: number; shaftId: number; floor: number; tod: number } | null = null;
  for (const a of state.agents) {
    if (a.homeFacilityId !== facilityId) continue;
    wait += a.stressWaitToday;
    noise += a.stressNoiseToday;
    climb += a.stressClimbToday;
    if (a.worstWaitTod >= 0 && (worst === null || a.worstWaitTicks > worst.ticks)) {
      worst = { ticks: a.worstWaitTicks, shaftId: a.worstWaitShaftId, floor: a.worstWaitFloor, tod: a.worstWaitTod };
    }
    // A tenant stuck in a queue right now is evidence too — in a starved
    // tower nobody may have *completed* a wait yet.
    if (a.activity === 'queuing' && (worst === null || a.waitTicks > worst.ticks)) {
      worst = { ticks: a.waitTicks, shaftId: a.shaftId, floor: a.floor, tod: tickOfDay(state.tick) };
    }
  }
  const top = Math.max(wait, noise, climb);
  if (top < 1) return null; // less than a stress point between them: no complaint
  if (top === wait && worst) {
    const h = worst.tod / TICKS_PER_HOUR;
    return {
      cause: 'elevator waits',
      waitSec: Math.round(worst.ticks * 0.6), // 1 tick = 0.6 sim-seconds
      shaftId: worst.shaftId,
      floor: worst.floor,
      bucket: h < 11 ? 'mornings' : h < 15 ? 'midday' : 'evenings',
    };
  }
  if (top === noise) return { cause: 'noise' };
  if (top === climb && climb > 0) return { cause: 'stair climbs' };
  return null; // wait-dominant but no locatable evidence yet
}

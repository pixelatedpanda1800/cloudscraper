import { LOT_WIDTH } from './constants';
import type { AgentRole, FacilityKind } from './types';

/** The facility catalog (GDD §4): every facility kind is a data row here plus
 *  a schedule function per worker role in agents.ts — adding content should
 *  never mean forking the sim's state machine. Dollar values are launch
 *  targets from the GDD, tuned later in beta. */

export interface FacilityDef {
  kind: FacilityKind;
  width: number; // tiles
  cost: number; // build cost, $
  rentPerQuarter: number; // quarterly rent (negative = upkeep), $ (0 = other income model)
  salePrice: number; // one-time sale collected at the midnight after placement (condos)
  spendPerVisit: number; // $ credited per customer visit (commercial)
  nightlyRate: number; // $ per occupied night (hotels)
  noise: number; // emitted noise level; stresses sensitive neighbors (GDD §4)
  noiseSensitive: boolean; // accumulates neighbors' noise (condos demand quiet)
  workers: number; // agents that staff/inhabit one unit
  workerRole: AgentRole | null; // role given to spawned agents
  buildable: boolean; // player-placeable via placeFacility
  minFloor: number; // lowest floor this may occupy
  minStar: number; // star rating required to build (GDD §6)
}

/** Units with positive rent or a sale price have tenants whose satisfaction
 *  is tracked and who can leave (GDD §5). */
export function tracksSatisfaction(def: FacilityDef): boolean {
  return def.rentPerQuarter > 0 || def.salePrice > 0;
}

const DEFAULTS = {
  rentPerQuarter: 0,
  salePrice: 0,
  spendPerVisit: 0,
  nightlyRate: 0,
  noise: 0,
  noiseSensitive: false,
  buildable: true,
  minFloor: 1,
  minStar: 1,
};

export const CATALOG: Record<FacilityKind, FacilityDef> = {
  lobby: {
    ...DEFAULTS,
    kind: 'lobby',
    width: LOT_WIDTH,
    cost: 0,
    workers: 0,
    workerRole: null,
    buildable: false, // F1 comes free and is forever (GDD §4)
    minFloor: 0,
  },
  office: {
    ...DEFAULTS,
    kind: 'office',
    width: 9,
    cost: 40_000,
    rentPerQuarter: 10_000,
    workers: 6,
    workerRole: 'officeWorker',
  },
  condo: {
    ...DEFAULTS,
    kind: 'condo',
    width: 16,
    cost: 80_000,
    salePrice: 150_000,
    noiseSensitive: true, // condos demand quiet (GDD §4)
    workers: 3, // residents
    workerRole: 'resident',
  },
  fastfood: {
    ...DEFAULTS,
    kind: 'fastfood',
    width: 16,
    cost: 100_000,
    spendPerVisit: 300, // lunch trade; ~50 covers/day ≈ $45k/quarter before tuning
    noise: 1,
    workers: 2,
    workerRole: 'staff',
  },
  hotel: {
    ...DEFAULTS,
    kind: 'hotel', // single room (GDD §4)
    width: 4,
    cost: 20_000,
    nightlyRate: 2_000,
    workers: 1, // the guest slot
    workerRole: 'hotelGuest',
    minStar: 2,
  },
  housekeeping: {
    ...DEFAULTS,
    kind: 'housekeeping',
    width: 15,
    cost: 50_000,
    rentPerQuarter: -10_000, // staff cost (GDD §4)
    workers: 6,
    workerRole: 'housekeeper',
    minStar: 2,
  },
  security: {
    ...DEFAULTS,
    kind: 'security',
    width: 15,
    cost: 100_000,
    rentPerQuarter: -20_000, // staff cost (GDD §4)
    workers: 6,
    workerRole: 'staff',
    minStar: 2, // response-radius mechanics arrive with events (M2)
  },
};

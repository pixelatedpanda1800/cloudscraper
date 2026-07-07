import type { RngState } from './rng';

/** All state is plain JSON-serializable data — no classes, no functions.
 *  This is what gets snapshotted to the server later (GDD §12). */

export type FacilityKind =
  | 'lobby'
  | 'office'
  | 'condo'
  | 'fastfood'
  | 'hotel'
  | 'housekeeping'
  | 'security';

/** Who an agent is; picks their schedule generator and settled/offsite
 *  behavior (agents.ts). New facility content adds roles here.
 *  officeWorker: 9–5 weekdays + lunch trips. resident: lives in a condo,
 *  out weekday working hours, home overnight. staff: works the facility's
 *  opening hours, weekends included. hotelGuest: one agent per room modeling
 *  successive guests — checks in evenings (when the room is clean), out
 *  mornings. housekeeper: cleans dirty hotel rooms from a housekeeping
 *  office. */
export type AgentRole = 'officeWorker' | 'resident' | 'staff' | 'hotelGuest' | 'housekeeper';

export interface Facility {
  id: number;
  kind: FacilityKind;
  floor: number;
  x: number; // left edge, tiles
  width: number;
  builtTick: number; // when placed; drives the demolish-refund window (GDD §9)
  cost: number; // what was actually paid (0 for scenario-built); refunds are a fraction of this
  /** One-time-sale units (condos): true once the sale price has been
   *  collected. Selling zeroes `cost` — no demolish refund on a sold unit. */
  sold: boolean;
  /** Noise reaching this unit from emitters within ±1 floor / 2 tiles
   *  (GDD §4 adjacency). Recomputed on every place/demolish, stored so the
   *  per-tick stress path and the inspector read plain state. */
  noise: number;
  /** Rolling tenant satisfaction 0–100 (GDD §5), updated nightly from the
   *  tenants' peak stress. Only meaningful for rent/sale units. */
  satisfaction: number;
  /** Consecutive quarters below the leave threshold; at 2 the tenants go. */
  lowSatQuarters: number;
  /** Tenants left; unit pays upkeep instead of rent until it re-lets. */
  vacant: boolean;
  vacantSinceTick: number;
  /** Hotel rooms: needs housekeeping before tonight's guest will check in. */
  dirty: boolean;
  /** Hotel rooms: id of the housekeeper who claimed the cleaning job (-1 none). */
  assignedTo: number;
}

export type AgentActivity =
  | 'offsite' // not in tower
  | 'walking' // moving along a floor toward targetX
  | 'queuing' // waiting at an elevator shaft
  | 'riding' // inside an elevator car
  | 'climbing' // on a stair between two floors
  | 'settled'; // at desk / destination, until next schedule event

export interface Agent {
  id: number;
  role: AgentRole;
  homeFacilityId: number; // facility they belong to; -1 = departed (it was demolished)
  activity: AgentActivity;
  floor: number;
  x: number;
  targetX: number;
  /** Final destination floor of the current trip. */
  destFloor: number;
  /** What to do on arrival at destFloor. 'lunch-back-pending' = lingering at
   *  lunch; 'service' = housekeeper working a room. */
  intent: 'work' | 'leave' | 'lunch-out' | 'lunch-back' | 'lunch-back-pending' | 'service' | 'none';
  shaftId: number; // shaft chosen while queuing/riding, else -1
  /** Current floor-changing leg, re-planned at each floor (agents.ts planNextLeg).
   *  A trip is a chain of legs; each leg must end strictly closer to destFloor. */
  legVia: 'none' | 'shaft' | 'stair';
  legViaId: number; // shaft/stair id, -1 when legVia is 'none'
  legFloor: number; // floor this leg ends at, -1 when no active leg
  climbTicksLeft: number; // >0 only while climbing a stair
  /** Facility this trip patronizes (lunch venue, room being serviced);
   *  resolved on arrival. -1 when the trip has no target facility. */
  visitFacilityId: number;
  /** Stress bookkeeping for legibility (GDD §5): today's totals by cause and
   *  the single worst elevator wait — this is what complaints and the
   *  inspector cite. Reset at midnight after feeding unit satisfaction. */
  stressWaitToday: number;
  stressNoiseToday: number;
  stressClimbToday: number;
  peakStressToday: number;
  worstWaitTicks: number;
  worstWaitShaftId: number;
  worstWaitFloor: number;
  worstWaitTod: number; // tick-of-day the wait ended; -1 = none yet
  stress: number; // 0–100
  waitTicks: number; // current continuous wait (for stats/debug)
  /** Ticks (day-relative) for today's schedule; recomputed each midnight. */
  arriveTick: number;
  lunchTick: number; // -1 if no lunch trip today
  leaveTick: number;
}

export type CarState = 'idle' | 'moving' | 'doors';

export interface ElevatorCar {
  pos: number; // floor position, float
  state: CarState;
  dir: -1 | 0 | 1;
  target: number; // target floor when moving
  doorTicks: number; // countdown while doors open
  passengers: { agentId: number; dest: number }[];
}

export interface ElevatorShaft {
  id: number;
  x: number; // tile position
  lowFloor: number;
  highFloor: number;
  cars: ElevatorCar[]; // SimTower allowed up to 8 cars per shaft
  /** Service shafts carry staff/housekeeping only (GDD §7), keeping workers
   *  out of guest traffic. */
  service: boolean;
  builtTick: number; // when placed; drives the demolish-refund window (GDD §9)
  cost: number; // what was actually paid (0 for scenario-built)
  /** FIFO queues of agentIds waiting on each floor, by direction. Keys are floor numbers. */
  queueUp: Record<number, number[]>;
  queueDown: Record<number, number[]>;
}

/** A stair flight connecting floorLow ↔ floorLow+1 (GDD §4: max ±1 floor).
 *  Escalators (3★) will reuse this shape with a speed/role variant. */
export interface Stair {
  id: number;
  floorLow: number;
  x: number; // left edge, tiles
  builtTick: number; // demolish-refund window (GDD §9)
  cost: number; // what was actually paid (0 for scenario-built)
}

export interface SimStats {
  /** rolling counters, reset daily */
  boardedToday: number;
  totalWaitTicksToday: number;
  maxQueueToday: number;
}

export interface SimState {
  tick: number; // absolute tick since sim start
  seed: number;
  rng: RngState;
  cash: number; // dollars; all changes via actions or economy events
  star: number; // progression rating (GDD §6); monotonic, gates the catalog
  floors: number; // floor count above ground incl. ground (0-indexed: 0..floors-1)
  facilities: Facility[];
  agents: Agent[];
  shafts: ElevatorShaft[];
  stairs: Stair[];
  stats: SimStats;
}

/** Convenience clock view (derived, never stored). */
export interface SimClock {
  day: number;
  hour: number;
  minute: number;
  isWorkday: boolean;
}

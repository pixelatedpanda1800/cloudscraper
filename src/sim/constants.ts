/** Simulation constants. One timebase for everything (GDD §3):
 *  20 ticks/sec at 1× speed; 1 sim-day = 6 real minutes = 7200 ticks. */

export const TICKS_PER_SECOND = 20;
export const TICKS_PER_DAY = 7200;
export const TICKS_PER_HOUR = TICKS_PER_DAY / 24; // 300
export const TICKS_PER_MINUTE = TICKS_PER_HOUR / 60; // 5

/** Tower geometry (tiles). M0 uses a narrower lot than the full 375 for readability. */
export const LOT_WIDTH = 240;

/** Agents */
export const WALK_SPEED = 1.0; // tiles per tick

/** Stress (0–100) */
export const STRESS_PER_WAIT_TICK = 1 / 50; // ~1 pt per 10 real-seconds queuing
export const STRESS_RECOVERY_PER_TICK = 1 / 100; // while settled (working/home/offsite)
export const STRESS_MAX = 100;
export const STRESS_PER_STAIR_FLIGHT = 0.5; // climbing is tiring (GDD §5 trip-length stress)

/** Noise adjacency (GDD §4): emitters stress sensitive neighbors within
 *  2 tiles / 1 floor while open. At noise level 1, an evening at home next
 *  to a fast food adds ~9 stress points (vs recovering). */
export const NOISE_RADIUS_TILES = 2;
export const NOISE_STRESS_PER_TICK = 1 / 100; // per noise level, while exposed
export const NOISE_ACTIVE_FROM_HOUR = 11; // fast food opens for lunch...
export const NOISE_ACTIVE_TO_HOUR = 22; // ...through the evening rush

/** Share of lunching workers who eat at an in-tower venue when one exists;
 *  the rest still head out via the lobby. */
export const EAT_IN_PROB = 0.7;

/** Satisfaction → consequences (GDD §5). Unit satisfaction (0–100) chases
 *  100 − avg tenant peak stress nightly; below 50 the unit complains (with a
 *  cause), below 25 for two consecutive quarters the tenants leave. Vacant
 *  units bleed upkeep and re-let after a couple of days. */
export const SAT_INITIAL = 70;
export const SAT_DAILY_ALPHA = 0.35; // nightly pull toward (100 − avg peak stress)
export const SAT_COMPLAIN_BELOW = 50;
export const SAT_LEAVE_BELOW = 25;
export const SAT_LEAVE_QUARTERS = 2;
export const VACANT_UPKEEP_PER_QUARTER = 4_000;
export const RELET_DAYS = 2;

/** Star ladder (GDD §6). M1 covers 1★→2★. */
export const STAR2_POP = 300;

/** Hotels (GDD §4). One guest-agent per room models successive guests:
 *  check-in evenings when the room is clean, check-out mornings leaves it
 *  dirty until a housekeeper services it (~20 sim-minutes). */
export const HOTEL_OCCUPANCY = 0.7; // chance a guest books the room each night
export const CLEAN_DURATION_TICKS = 100; // 20 sim-minutes per room

/** Stairs (GDD §4: 1★, 8 tiles, $5k, max ±1 floor). */
export const STAIR_WIDTH = 8;
export const STAIR_COST = 5_000;
export const STAIR_CLIMB_TICKS = 15; // 9 sim-seconds per flight

/** Route-planning heuristics (all in ticks). Agents pick the cheapest next
 *  leg toward their destination; these estimates decide stairs vs elevator.
 *  With these values a 1-floor trip prefers a nearby stair, a 2+-floor trip
 *  prefers an elevator unless its queue is long. */
export const EST_ELEVATOR_WAIT_BASE = 40; // ~a car's travel time to reach the caller
export const EST_ELEVATOR_WAIT_PER_QUEUED = 4; // marginal delay per person already waiting
export const EST_REMAINING_FLOOR = 40; // per floor this leg still leaves uncovered

/** Elevator (standard type only in M0).
 *  Timebase note: 1 tick = 0.6 sim-seconds, so 0.5 floors/tick ≈ 1 floor per
 *  sim-second — realistic elevator speed under the day compression. */
export const ELEVATOR_SPEED = 0.5; // floors per tick
export const ELEVATOR_CAPACITY = 20;
export const DOOR_BASE_TICKS = 10; // open/close overhead per stop
export const DOOR_PER_PASSENGER_TICKS = 1;
export const MAX_SPAN_FLOORS = 30; // standard elevator limit (GDD §7)
export const MAX_CARS_PER_SHAFT = 8; // faithful to the original

/** Economy (GDD §4, §8). Per-facility numbers (cost, rent, width, staffing)
 *  live in the facility catalog (catalog.ts); only economy-wide tunables stay
 *  here. A quarter is 3 sim-days ≈ 18 real minutes at 1× — the original's
 *  cadence, and it keeps the afford-something-every-5–10-min pacing rule
 *  reachable once a tower has a handful of offices. */
export const DAYS_PER_QUARTER = 3;
export const STARTING_CASH = 2_000_000; // the classic starting bankroll
export const SHAFT_COST = 200_000; // buys the shaft + its first car
export const CAR_COST = 60_000; // each additional car in a shaft
export const DEMOLISH_REFUND = 0.8; // GDD §9: 80% refund...
export const REFUND_WINDOW_TICKS = TICKS_PER_DAY; // ...within one day of building

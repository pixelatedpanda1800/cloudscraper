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

/** Elevator (standard type only in M0).
 *  Timebase note: 1 tick = 0.6 sim-seconds, so 0.5 floors/tick ≈ 1 floor per
 *  sim-second — realistic elevator speed under the day compression. */
export const ELEVATOR_SPEED = 0.5; // floors per tick
export const ELEVATOR_CAPACITY = 20;
export const DOOR_BASE_TICKS = 10; // open/close overhead per stop
export const DOOR_PER_PASSENGER_TICKS = 1;
export const MAX_SPAN_FLOORS = 30; // standard elevator limit (GDD §7)
export const MAX_CARS_PER_SHAFT = 8; // faithful to the original

/** Office */
export const OFFICE_WIDTH = 9;
export const OFFICE_WORKERS = 6;

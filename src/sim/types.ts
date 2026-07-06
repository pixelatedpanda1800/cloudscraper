import type { RngState } from './rng';

/** All state is plain JSON-serializable data — no classes, no functions.
 *  This is what gets snapshotted to the server later (GDD §12). */

export type FacilityKind = 'lobby' | 'office';

export interface Facility {
  id: number;
  kind: FacilityKind;
  floor: number;
  x: number; // left edge, tiles
  width: number;
}

export type AgentActivity =
  | 'offsite' // not in tower
  | 'walking' // moving along a floor toward targetX
  | 'queuing' // waiting at an elevator shaft
  | 'riding' // inside an elevator car
  | 'settled'; // at desk / destination, until next schedule event

export interface Agent {
  id: number;
  homeFacilityId: number; // office they work in
  activity: AgentActivity;
  floor: number;
  x: number;
  targetX: number;
  /** Multi-leg plan: remaining floors to reach (M0 plans are 1 leg). */
  destFloor: number;
  /** What to do on arrival at destFloor. 'lunch-back-pending' = lingering at lobby. */
  intent: 'work' | 'leave' | 'lunch-out' | 'lunch-back' | 'lunch-back-pending' | 'none';
  shaftId: number; // shaft chosen while queuing/riding, else -1
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
  /** FIFO queues of agentIds waiting on each floor, by direction. Keys are floor numbers. */
  queueUp: Record<number, number[]>;
  queueDown: Record<number, number[]>;
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
  floors: number; // floor count above ground incl. ground (0-indexed: 0..floors-1)
  facilities: Facility[];
  agents: Agent[];
  shafts: ElevatorShaft[];
  stats: SimStats;
}

/** Convenience clock view (derived, never stored). */
export interface SimClock {
  day: number;
  hour: number;
  minute: number;
  isWorkday: boolean;
}

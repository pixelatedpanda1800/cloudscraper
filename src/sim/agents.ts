import {
  CLEAN_DURATION_TICKS,
  EAT_IN_PROB,
  ELEVATOR_SPEED,
  HOTEL_OCCUPANCY,
  EST_ELEVATOR_WAIT_BASE,
  EST_ELEVATOR_WAIT_PER_QUEUED,
  EST_REMAINING_FLOOR,
  NOISE_ACTIVE_FROM_HOUR,
  NOISE_ACTIVE_TO_HOUR,
  NOISE_STRESS_PER_TICK,
  STAIR_CLIMB_TICKS,
  STRESS_MAX,
  STRESS_PER_STAIR_FLIGHT,
  STRESS_PER_WAIT_TICK,
  STRESS_RECOVERY_PER_TICK,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
  WALK_SPEED,
} from './constants';
import { tickOfDay } from './clock';
import { CATALOG } from './catalog';
import type { FacilityDef } from './catalog';
import { enqueueAgent } from './elevator';
import { hashJitter } from './rng';
import { facilityById, shaftById, stairById } from './tower';
import type { Agent, Facility, SimState } from './types';
import type { AgentRole } from './types';

/** Roles allowed to ride service elevators (GDD §7). */
export function canUseServiceShaft(role: AgentRole): boolean {
  return role === 'staff' || role === 'housekeeper';
}

// Noise window in ticks-of-day, precomputed (this sits on a per-tick path).
const NOISE_FROM_TICK = NOISE_ACTIVE_FROM_HOUR * TICKS_PER_HOUR;
const NOISE_TO_TICK = NOISE_ACTIVE_TO_HOUR * TICKS_PER_HOUR;

/** Reset an agent's current leg so the walking logic re-plans it. */
export function clearLeg(agent: Agent): void {
  agent.legVia = 'none';
  agent.legViaId = -1;
  agent.legFloor = -1;
  agent.climbTicksLeft = 0;
}

/** Pull one agent out of whatever shaft queue or car it occupies. */
export function removeFromTransit(state: SimState, agent: Agent): void {
  if (agent.shaftId < 0) return;
  const shaft = shaftById(state, agent.shaftId);
  if (shaft) {
    if (agent.activity === 'queuing') {
      for (let f = shaft.lowFloor; f <= shaft.highFloor; f++) {
        for (const q of [shaft.queueUp[f], shaft.queueDown[f]]) {
          const i = q.indexOf(agent.id);
          if (i >= 0) q.splice(i, 1);
        }
      }
    } else if (agent.activity === 'riding') {
      for (const car of shaft.cars) {
        const i = car.passengers.findIndex((p) => p.agentId === agent.id);
        if (i >= 0) {
          car.passengers.splice(i, 1);
          agent.floor = Math.max(shaft.lowFloor, Math.min(shaft.highFloor, Math.round(car.pos)));
          agent.x = shaft.x;
          break;
        }
      }
    }
  }
  agent.shaftId = -1;
  clearLeg(agent);
}

/** Move `def.workers` fresh tenants into a facility (placement or re-let).
 *  Agents are appended, never recycled: agent id === array index, always. */
export function spawnTenants(state: SimState, facility: Facility, def: FacilityDef): void {
  for (let w = 0; w < def.workers; w++) {
    state.agents.push({
      id: state.agents.length,
      role: def.workerRole!,
      homeFacilityId: facility.id,
      activity: 'offsite',
      floor: 0,
      x: 0,
      targetX: 0,
      destFloor: 0,
      intent: 'none',
      shaftId: -1,
      legVia: 'none',
      legViaId: -1,
      legFloor: -1,
      climbTicksLeft: 0,
      visitFacilityId: -1,
      stressWaitToday: 0,
      stressNoiseToday: 0,
      stressClimbToday: 0,
      peakStressToday: 0,
      worstWaitTicks: 0,
      worstWaitShaftId: -1,
      worstWaitFloor: -1,
      worstWaitTod: -1,
      stress: 0,
      waitTicks: 0,
      arriveTick: -1,
      lunchTick: -1,
      leaveTick: -1,
    });
  }
}

/** Tenants of a unit depart for good (demolition or fed-up move-out): anyone
 *  inside walks out via the lobby; agents are never deleted (id === index),
 *  they just stop coming back. Also releases any cleaning jobs they held. */
export function departTenants(state: SimState, facilityId: number): void {
  for (const agent of state.agents) {
    if (agent.homeFacilityId !== facilityId) continue;
    removeFromTransit(state, agent);
    clearLeg(agent); // covers climbers too (they hold no shaft/queue slot)
    agent.homeFacilityId = -1;
    for (const f of state.facilities) {
      if (f.assignedTo === agent.id) f.assignedTo = -1;
    }
    if (agent.activity !== 'offsite') {
      agent.activity = 'walking';
      agent.intent = 'leave';
      agent.destFloor = 0;
      agent.targetX = 100; // lobby exit, same spot scheduled leave trips use
    }
  }
}


/** Daily schedules, one generator per role, all via order-independent hash
 *  jitter (see rng.ts). New facility content = a catalog row + an entry here.
 *
 *  Field semantics per role — arriveTick: when they next *enter* the tower;
 *  leaveTick: when they next *exit* it; lunchTick: midday trip (-1 = none).
 *  Office worker: arrive 08:30–09:30, ~50% lunch 12:00–12:45, leave 17–18.
 *  Resident: home overnight; out 07:30–08:45 → back 17:30–19:00 on weekdays,
 *  weekends ~50% take one outing around midday, else stay in.
 *  Staff: opening hours 10:00–10:30 → 21:30–22:30, weekends included. */
const SCHEDULES: Record<AgentRole, (state: SimState, agent: Agent, day: number) => void> = {
  officeWorker(state, agent, day) {
    const j1 = hashJitter(state.seed, agent.id, day, 1);
    const j2 = hashJitter(state.seed, agent.id, day, 2);
    const j3 = hashJitter(state.seed, agent.id, day, 3);
    agent.arriveTick = Math.floor(8.5 * TICKS_PER_HOUR + j1 * TICKS_PER_HOUR);
    agent.lunchTick =
      j2 < 0.5 ? Math.floor(12 * TICKS_PER_HOUR + j3 * 45 * TICKS_PER_MINUTE) : -1;
    agent.leaveTick = Math.floor(17 * TICKS_PER_HOUR + hashJitter(state.seed, agent.id, day, 4) * TICKS_PER_HOUR);
  },

  resident(state, agent, day) {
    const j1 = hashJitter(state.seed, agent.id, day, 1);
    const j2 = hashJitter(state.seed, agent.id, day, 2);
    agent.lunchTick = -1;
    if (day % 7 < 5) {
      agent.leaveTick = Math.floor(7.5 * TICKS_PER_HOUR + j1 * 75 * TICKS_PER_MINUTE);
      agent.arriveTick = Math.floor(17.5 * TICKS_PER_HOUR + j2 * 90 * TICKS_PER_MINUTE);
    } else if (j1 < 0.5) {
      // Weekend outing: a couple of hours around midday.
      agent.leaveTick = Math.floor(11 * TICKS_PER_HOUR + j2 * 3 * TICKS_PER_HOUR);
      agent.arriveTick = agent.leaveTick + 2 * TICKS_PER_HOUR;
    } else {
      agent.leaveTick = -1; // staying in
      agent.arriveTick = Math.floor(10 * TICKS_PER_HOUR); // move-in time if still offsite
    }
  },

  staff(state, agent, day) {
    const j1 = hashJitter(state.seed, agent.id, day, 1);
    const j2 = hashJitter(state.seed, agent.id, day, 2);
    agent.lunchTick = -1;
    agent.arriveTick = Math.floor(10 * TICKS_PER_HOUR + j1 * 30 * TICKS_PER_MINUTE);
    agent.leaveTick = Math.floor(21.5 * TICKS_PER_HOUR + j2 * TICKS_PER_HOUR);
  },

  hotelGuest(state, agent, day) {
    // Tonight's booking (or a vacant night), and this morning's checkout.
    const jOcc = hashJitter(state.seed, agent.id, day, 7);
    const j1 = hashJitter(state.seed, agent.id, day, 1);
    const j2 = hashJitter(state.seed, agent.id, day, 2);
    agent.lunchTick = -1;
    agent.arriveTick =
      jOcc < HOTEL_OCCUPANCY ? Math.floor(19 * TICKS_PER_HOUR + j1 * 3.5 * TICKS_PER_HOUR) : -1;
    agent.leaveTick = Math.floor(7 * TICKS_PER_HOUR + j2 * 2 * TICKS_PER_HOUR);
  },

  housekeeper(state, agent, day) {
    // On shift after the checkout wave, seven days a week.
    const j1 = hashJitter(state.seed, agent.id, day, 1);
    const j2 = hashJitter(state.seed, agent.id, day, 2);
    agent.lunchTick = -1;
    agent.arriveTick = Math.floor(9 * TICKS_PER_HOUR + j1 * 30 * TICKS_PER_MINUTE);
    agent.leaveTick = Math.floor(17 * TICKS_PER_HOUR + j2 * 30 * TICKS_PER_MINUTE);
  },
};

export function computeSchedule(state: SimState, agent: Agent, day: number): void {
  SCHEDULES[agent.role](state, agent, day);
}

function deskX(state: SimState, agent: Agent): number {
  const fac = facilityById(state, agent.homeFacilityId)!;
  // Spread a unit's workers across its width deterministically.
  const seats = Math.max(1, CATALOG[fac.kind].workers);
  return fac.x + 1 + (agent.id % seats) * 1.2;
}

function homeFloor(state: SimState, agent: Agent): number {
  return facilityById(state, agent.homeFacilityId)!.floor;
}

/** Start a trip toward (dest, finalX). Legs are planned floor-by-floor from
 *  the walking state; here we only set the goal. `visitFacilityId` marks a
 *  customer visit — its spend is credited on arrival. */
function planTrip(
  agent: Agent,
  dest: number,
  intent: Agent['intent'],
  finalX: number,
  visitFacilityId = -1,
): void {
  agent.intent = intent;
  agent.destFloor = dest;
  agent.targetX = finalX;
  agent.legVia = 'none';
  agent.legViaId = -1;
  agent.legFloor = -1;
  agent.visitFacilityId = visitFacilityId;
  agent.activity = 'walking';
}

/** Pick the cheapest next leg toward destFloor: a stair flight (±1 floor) or
 *  an elevator ride to the served floor nearest the destination. Every leg
 *  ends strictly closer to destFloor, so trips always make progress and the
 *  greedy per-floor re-plan can chain stairs, rides, and transfers freely.
 *  Deterministic: fixed iteration order (stairs, then shafts, by index) and
 *  strict `<` comparison. Leaves legVia 'none' when the floor is a dead end
 *  (the agent stays put and retries next tick). */
/** Walkers already committed to each shaft's hall call — counted alongside
 *  the live queue when estimating wait. Without this, a whole morning wave
 *  plans against the same momentarily-empty queue and dogpiles one shaft.
 *
 *  Cached per (state, tick) and updated incrementally as agents commit or
 *  enqueue within the tick. The cache is *derived* data — rebuilt from state
 *  whenever the tick changes, never snapshotted — and both the rebuild and
 *  the in-tick updates follow the fixed agent iteration order, so replay
 *  determinism is preserved. (A plain per-plan rescan was measured at ~2×
 *  whole-sim slowdown; see the bench floor in CLAUDE.md.) */
interface InboundCache {
  tick: number;
  arr: Int32Array; // index = shaftId * state.floors + floor (floors ≥ 0 until basements)
}
const inboundCaches = new WeakMap<SimState, InboundCache>();
// Identity fast path: WeakMap lookups hash on every call, and this is called
// for every plan and every queue join. Interleaved sims (tests) still work —
// a state switch just falls through to the WeakMap.
let lastInboundState: SimState | null = null;
let lastInbound: InboundCache | null = null;

function inboundFor(state: SimState): Int32Array {
  // Shaft ids are appended in ascending order, so the last one is the max.
  const maxId = state.shafts.length === 0 ? 0 : state.shafts[state.shafts.length - 1].id;
  let c = state === lastInboundState ? lastInbound : inboundCaches.get(state);
  if (!c || c.arr.length < (maxId + 1) * state.floors) {
    c = { tick: -1, arr: new Int32Array((maxId + 8) * state.floors) }; // pad for growth
    inboundCaches.set(state, c);
  }
  lastInboundState = state;
  lastInbound = c;
  if (c.tick !== state.tick) {
    c.arr.fill(0);
    for (const a of state.agents) {
      if (a.activity === 'walking' && a.legVia === 'shaft') {
        c.arr[a.legViaId * state.floors + a.floor]++;
      }
    }
    c.tick = state.tick;
  }
  return c.arr;
}

function bumpInbound(state: SimState, shaftId: number, floor: number, delta: number): void {
  const arr = inboundFor(state);
  const k = shaftId * state.floors + floor;
  arr[k] = Math.max(0, arr[k] + delta);
}

function planNextLeg(state: SimState, agent: Agent): void {
  const from = agent.floor;
  const dest = agent.destFloor;
  let bestCost = Infinity;
  let via: 'shaft' | 'stair' = 'stair';
  let viaId = -1;
  let legFloor = -1;

  for (const st of state.stairs) {
    let to: number;
    if (dest > from && st.floorLow === from) to = from + 1;
    else if (dest < from && st.floorLow === from - 1) to = from - 1;
    else continue;
    const cost =
      Math.abs(agent.x - st.x) / WALK_SPEED +
      STAIR_CLIMB_TICKS +
      Math.abs(dest - to) * EST_REMAINING_FLOOR;
    if (cost < bestCost) {
      bestCost = cost;
      via = 'stair';
      viaId = st.id;
      legFloor = to;
    }
  }

  for (const sh of state.shafts) {
    if (sh.service && !canUseServiceShaft(agent.role)) continue;
    if (from < sh.lowFloor || from > sh.highFloor) continue;
    const to = Math.max(sh.lowFloor, Math.min(sh.highFloor, dest));
    if (to === from) continue; // this shaft can't move us closer
    const queue = to > from ? sh.queueUp[from] : sh.queueDown[from];
    const waiting = queue.length + inboundFor(state)[sh.id * state.floors + from];
    const cost =
      Math.abs(agent.x - sh.x) / WALK_SPEED +
      EST_ELEVATOR_WAIT_BASE +
      waiting * EST_ELEVATOR_WAIT_PER_QUEUED +
      Math.abs(to - from) / ELEVATOR_SPEED +
      Math.abs(dest - to) * EST_REMAINING_FLOOR;
    if (cost < bestCost) {
      bestCost = cost;
      via = 'shaft';
      viaId = sh.id;
      legFloor = to;
    }
  }

  if (viaId >= 0) {
    agent.legVia = via;
    agent.legViaId = viaId;
    agent.legFloor = legFloor;
    if (via === 'shaft') bumpInbound(state, viaId, from, +1);
  }
}

function arriveAtDestination(state: SimState, agent: Agent): void {
  switch (agent.intent) {
    case 'work':
    case 'lunch-back': {
      // Hotel guests pay for the night at check-in.
      if (agent.role === 'hotelGuest' && agent.intent === 'work') {
        const room = facilityById(state, agent.homeFacilityId);
        if (room) state.cash += CATALOG[room.kind].nightlyRate;
      }
      agent.activity = 'settled';
      agent.intent = 'none';
      break;
    }
    case 'service': {
      // Housekeeper starts working the room; lunchTick anchors the timer
      // (unused otherwise for this role).
      agent.activity = 'settled';
      agent.lunchTick = tickOfDay(state.tick);
      break;
    }
    case 'lunch-out': {
      // Linger over lunch, then head back — the return check fires from
      // tickAgent. If this was a customer visit, the venue rings it up now.
      const venue = facilityById(state, agent.visitFacilityId);
      if (venue) state.cash += CATALOG[venue.kind].spendPerVisit;
      agent.activity = 'settled';
      agent.intent = 'lunch-back-pending';
      break;
    }
    case 'leave': {
      // A guest checking out leaves the room for housekeeping.
      if (agent.role === 'hotelGuest') {
        const room = facilityById(state, agent.homeFacilityId);
        if (room) room.dirty = true;
      }
      agent.activity = 'offsite';
      agent.intent = 'none';
      agent.x = 0;
      agent.floor = 0;
      agent.shaftId = -1;
      break;
    }
    default:
      agent.activity = 'settled';
      agent.intent = 'none';
  }
}

/** tod/day/workday are hoisted to the caller (sim.ts) — recomputing the
 *  clock's modulo math per agent per tick was measurably hot at 1k agents. */
export function tickAgent(state: SimState, agent: Agent, tod: number, day: number, workday: boolean): void {
  // Midnight (or an agent's very first tick — both fields are -1 only when
  // freshly spawned; a legitimate schedule always sets at least one).
  if (tod === 0 || (agent.arriveTick < 0 && agent.leaveTick < 0)) {
    computeSchedule(state, agent, day);
  }

  if (agent.stress > agent.peakStressToday) agent.peakStressToday = agent.stress;

  switch (agent.activity) {
    case 'offsite': {
      // Departed agents (home facility demolished) never come back.
      let enter = false;
      if (agent.homeFacilityId >= 0) {
        if (agent.role === 'officeWorker') {
          enter = workday && tod >= agent.arriveTick && tod < agent.leaveTick;
        } else if (agent.role === 'staff' || agent.role === 'housekeeper') {
          enter = tod >= agent.arriveTick && tod < agent.leaveTick;
        } else if (agent.role === 'hotelGuest') {
          // Tonight's guest checks in — but only into a clean room. If
          // housekeeping gets to it later this evening, they still show up.
          if (agent.arriveTick >= 0 && tod >= agent.arriveTick) {
            const room = facilityById(state, agent.homeFacilityId);
            enter = room !== undefined && !room.dirty;
          }
        } else {
          // Resident heading home (evening return, outing end, or move-in).
          enter = agent.arriveTick >= 0 && tod >= agent.arriveTick;
        }
      }
      if (enter) {
        // Spawn at lobby entrance and head to their unit.
        agent.floor = 0;
        agent.x = 100 + (agent.id % 40); // entrance spread keeps the door area readable
        planTrip(agent, homeFloor(state, agent), 'work', deskX(state, agent));
      } else {
        agent.stress = Math.max(0, agent.stress - STRESS_RECOVERY_PER_TICK);
      }
      break;
    }

    case 'walking': {
      if (agent.floor !== agent.destFloor) {
        // Mid-trip: head for the current leg's stair or shaft, planning one if needed.
        if (agent.legVia === 'none') {
          planNextLeg(state, agent);
          if (agent.legVia === 'none') break; // dead-end floor; retry next tick
        }
        const viaX =
          agent.legVia === 'shaft'
            ? shaftById(state, agent.legViaId)?.x
            : stairById(state, agent.legViaId)?.x;
        if (viaX === undefined) {
          // Our ride got demolished while we walked; re-plan next tick.
          agent.legVia = 'none';
          agent.legViaId = -1;
          agent.legFloor = -1;
          break;
        }
        if (Math.abs(agent.x - viaX) <= WALK_SPEED) {
          agent.x = viaX;
          if (agent.legVia === 'shaft') {
            bumpInbound(state, agent.legViaId, agent.floor, -1); // now in the real queue
            enqueueAgent(state, agent, shaftById(state, agent.legViaId)!);
          } else {
            agent.activity = 'climbing';
            agent.climbTicksLeft = STAIR_CLIMB_TICKS;
          }
        } else {
          agent.x += Math.sign(viaX - agent.x) * WALK_SPEED;
        }
      } else {
        // On destination floor: walk to final x.
        if (Math.abs(agent.x - agent.targetX) <= WALK_SPEED) {
          agent.x = agent.targetX;
          arriveAtDestination(state, agent);
        } else {
          agent.x += Math.sign(agent.targetX - agent.x) * WALK_SPEED;
        }
      }
      break;
    }

    case 'climbing': {
      agent.stress = Math.min(STRESS_MAX, agent.stress + STRESS_PER_STAIR_FLIGHT / STAIR_CLIMB_TICKS);
      agent.stressClimbToday += STRESS_PER_STAIR_FLIGHT / STAIR_CLIMB_TICKS;
      agent.climbTicksLeft--;
      if (agent.climbTicksLeft <= 0) {
        agent.floor = agent.legFloor;
        agent.climbTicksLeft = 0;
        agent.legVia = 'none';
        agent.legViaId = -1;
        agent.legFloor = -1;
        agent.activity = 'walking';
      }
      break;
    }

    case 'queuing': {
      agent.waitTicks++;
      agent.stress = Math.min(STRESS_MAX, agent.stress + STRESS_PER_WAIT_TICK);
      agent.stressWaitToday += STRESS_PER_WAIT_TICK;
      break;
    }

    case 'riding': {
      // Position/floor are owned by the elevator; light stress while crammed.
      break;
    }

    case 'settled': {
      // Noise exposure at home replaces stress recovery (GDD §4 adjacency).
      // Only residents live in noise-sensitive units, so everyone else skips
      // the facility lookup — it's a linear find and this path runs every
      // tick for most of the tower's population.
      let exposed = false;
      if (agent.role === 'resident' && tod >= NOISE_FROM_TICK && tod < NOISE_TO_TICK) {
        const home = facilityById(state, agent.homeFacilityId);
        if (home !== undefined && home.noise > 0 && agent.floor === home.floor) {
          exposed = true;
          agent.stress = Math.min(STRESS_MAX, agent.stress + home.noise * NOISE_STRESS_PER_TICK);
          agent.stressNoiseToday += home.noise * NOISE_STRESS_PER_TICK;
        }
      }
      if (!exposed) {
        agent.stress = Math.max(0, agent.stress - STRESS_RECOVERY_PER_TICK);
      }

      if (agent.intent === 'lunch-back-pending') {
        // Linger over lunch ~30 sim-min after arrival — approximate by leaving
        // when the clock passes lunchTick + 30min + trip slack.
        if (tod >= agent.lunchTick + 45 * TICKS_PER_MINUTE) {
          planTrip(agent, homeFloor(state, agent), 'lunch-back', deskX(state, agent));
        }
        break;
      }

      if (agent.role === 'officeWorker') {
        if (!workday) break;
        // Lunch trip — to an in-tower venue when one exists, else out the lobby.
        if (
          agent.lunchTick >= 0 &&
          tod >= agent.lunchTick &&
          tod < agent.leaveTick &&
          agent.floor !== 0
        ) {
          startLunchTrip(state, agent, day);
          agent.lunchTick = tod; // return timer references actual departure
          break;
        }
        leaveIfDue(agent, tod);
      } else if (agent.role === 'staff') {
        leaveIfDue(agent, tod); // staff work weekends; their own schedule decides
      } else if (agent.role === 'hotelGuest') {
        // Checkout is a morning affair; the evening check-in must not bounce
        // straight back out just because tod has passed this morning's slot.
        if (tod >= agent.leaveTick && tod < 12 * TICKS_PER_HOUR) leaveIfDue(agent, tod);
      } else if (agent.role === 'housekeeper') {
        tickHousekeeper(state, agent, tod);
      } else {
        // Resident: head out when scheduled (weekday work / weekend outing).
        if (
          agent.leaveTick >= 0 &&
          tod >= agent.leaveTick &&
          (agent.arriveTick < 0 || tod < agent.arriveTick)
        ) {
          leaveIfDue(agent, tod);
        }
      }
      break;
    }
  }
}

/** Housekeeper work loop, evaluated while settled: finish the room being
 *  serviced, then claim the next dirty unclaimed room (fixed facility order —
 *  deterministic), else head back to base and eventually clock off. */
function tickHousekeeper(state: SimState, agent: Agent, tod: number): void {
  if (agent.intent === 'service') {
    const room = facilityById(state, agent.visitFacilityId);
    if (!room) {
      agent.intent = 'none'; // room demolished under us
      return;
    }
    if (tod >= agent.lunchTick + CLEAN_DURATION_TICKS) {
      room.dirty = false;
      room.assignedTo = -1;
      agent.intent = 'none';
      agent.visitFacilityId = -1;
    }
    return;
  }

  for (const f of state.facilities) {
    if (f.kind === 'hotel' && f.dirty && f.assignedTo < 0) {
      f.assignedTo = agent.id;
      planTrip(agent, f.floor, 'service', f.x + 1, f.id);
      return;
    }
  }

  // Nothing to clean: return to base if we're elsewhere, else wait for work.
  const base = facilityById(state, agent.homeFacilityId);
  if (base && (agent.floor !== base.floor || Math.abs(agent.x - deskX(state, agent)) > 1)) {
    planTrip(agent, base.floor, 'work', deskX(state, agent));
    return;
  }
  leaveIfDue(agent, tod);
}

/** The standard exit: walk out via the lobby, then vanish offsite. */
function leaveIfDue(agent: Agent, tod: number): void {
  if (tod >= agent.leaveTick && agent.floor !== 0) {
    planTrip(agent, 0, 'leave', 100);
  } else if (tod >= agent.leaveTick && agent.floor === 0) {
    agent.activity = 'offsite';
  }
}

/** Pick a lunch venue: EAT_IN_PROB of lunchers eat at an in-tower commercial
 *  facility (deterministic jitter pick), the rest still head out the lobby.
 *  Venue spend is credited on arrival (arriveAtDestination). */
function startLunchTrip(state: SimState, agent: Agent, day: number): void {
  const venues = state.facilities.filter((f) => CATALOG[f.kind].spendPerVisit > 0);
  const jEat = hashJitter(state.seed, agent.id, day, 5);
  if (venues.length > 0 && jEat < EAT_IN_PROB) {
    const jPick = hashJitter(state.seed, agent.id, day, 6);
    const venue = venues[Math.min(venues.length - 1, Math.floor(jPick * venues.length))];
    const seatX = venue.x + 2 + (agent.id % Math.max(1, venue.width - 4));
    planTrip(agent, venue.floor, 'lunch-out', seatX, venue.id);
  } else {
    planTrip(agent, 0, 'lunch-out', 140 + (agent.id % 60));
  }
}

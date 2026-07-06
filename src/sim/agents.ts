import {
  STRESS_MAX,
  STRESS_PER_WAIT_TICK,
  STRESS_RECOVERY_PER_TICK,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
  WALK_SPEED,
} from './constants';
import { dayOf, tickOfDay } from './clock';
import { enqueueAgent } from './elevator';
import { hashJitter } from './rng';
import type { Agent, SimState } from './types';

/** Daily schedule via order-independent hash jitter (see rng.ts):
 *  arrive 08:30–09:30, ~50% take a lunch trip 12:00–12:45, leave 17:00–18:00. */
export function computeSchedule(state: SimState, agent: Agent, day: number): void {
  const j1 = hashJitter(state.seed, agent.id, day, 1);
  const j2 = hashJitter(state.seed, agent.id, day, 2);
  const j3 = hashJitter(state.seed, agent.id, day, 3);
  agent.arriveTick = Math.floor(8.5 * TICKS_PER_HOUR + j1 * TICKS_PER_HOUR);
  agent.lunchTick =
    j2 < 0.5 ? Math.floor(12 * TICKS_PER_HOUR + j3 * 45 * TICKS_PER_MINUTE) : -1;
  agent.leaveTick = Math.floor(17 * TICKS_PER_HOUR + hashJitter(state.seed, agent.id, day, 4) * TICKS_PER_HOUR);
}

function deskX(state: SimState, agent: Agent): number {
  const fac = state.facilities[agent.homeFacilityId];
  // Spread the office's 6 workers across its width deterministically.
  return fac.x + 1 + (agent.id % 6) * 1.2;
}

function homeFloor(state: SimState, agent: Agent): number {
  return state.facilities[agent.homeFacilityId].floor;
}

/** Start a trip: walk to the chosen shaft, then ride to destFloor, then walk to targetX. */
function planTrip(
  agent: Agent,
  dest: number,
  intent: Agent['intent'],
  finalX: number,
): void {
  agent.intent = intent;
  agent.destFloor = dest;
  agent.targetX = finalX;
  if (agent.floor === dest) {
    agent.activity = 'walking';
    return;
  }
  // Walk toward shafts first; enqueue happens when x reaches the shaft cluster.
  agent.activity = 'walking';
}

function arriveAtDestination(agent: Agent): void {
  switch (agent.intent) {
    case 'work':
    case 'lunch-back':
      agent.activity = 'settled';
      agent.intent = 'none';
      break;
    case 'lunch-out': {
      // At lobby; linger 30 sim-minutes then head back up. Model linger by
      // scheduling 'settled' — the lunch return check fires from tickAgent.
      agent.activity = 'settled';
      agent.intent = 'lunch-back-pending';
      break;
    }
    case 'leave':
      agent.activity = 'offsite';
      agent.intent = 'none';
      agent.x = 0;
      agent.floor = 0;
      agent.shaftId = -1;
      break;
    default:
      agent.activity = 'settled';
      agent.intent = 'none';
  }
}

export function tickAgent(state: SimState, agent: Agent): void {
  const tod = tickOfDay(state.tick);
  const day = dayOf(state.tick);

  // Midnight (or first tick): compute today's schedule.
  if (agent.arriveTick < 0 || tod === 0) computeSchedule(state, agent, day);

  const workday = day % 7 < 5;

  switch (agent.activity) {
    case 'offsite': {
      if (workday && tod >= agent.arriveTick && tod < agent.leaveTick) {
        // Spawn at lobby entrance (right side, tile LOT edge) and head to the office.
        agent.floor = 0;
        agent.x = 100 + (agent.id % 40); // entrance spread keeps the door area readable
        planTrip(agent, homeFloor(state, agent), 'work', deskX(state, agent));
      } else {
        agent.stress = Math.max(0, agent.stress - STRESS_RECOVERY_PER_TICK);
      }
      break;
    }

    case 'walking': {
      // If we still need to change floors, walk to the shaft cluster and queue.
      if (agent.floor !== agent.destFloor) {
        const shaftX = 30 + state.shafts.length * 3; // middle of the cluster
        if (Math.abs(agent.x - shaftX) <= WALK_SPEED) {
          agent.x = shaftX;
          enqueueAgent(state, agent, agent.floor, agent.destFloor);
        } else {
          agent.x += Math.sign(shaftX - agent.x) * WALK_SPEED;
        }
      } else {
        // On destination floor: walk to final x.
        if (Math.abs(agent.x - agent.targetX) <= WALK_SPEED) {
          agent.x = agent.targetX;
          arriveAtDestination(agent);
        } else {
          agent.x += Math.sign(agent.targetX - agent.x) * WALK_SPEED;
        }
      }
      break;
    }

    case 'queuing': {
      agent.waitTicks++;
      agent.stress = Math.min(STRESS_MAX, agent.stress + STRESS_PER_WAIT_TICK);
      break;
    }

    case 'riding': {
      // Position/floor are owned by the elevator; light stress while crammed.
      break;
    }

    case 'settled': {
      agent.stress = Math.max(0, agent.stress - STRESS_RECOVERY_PER_TICK);

      if (agent.intent === 'lunch-back-pending') {
        // Linger at the lobby ~30 sim-min after arrival — approximate by leaving
        // when the clock passes lunchTick + 30min + trip slack.
        if (tod >= agent.lunchTick + 45 * TICKS_PER_MINUTE) {
          planTrip(agent, homeFloor(state, agent), 'lunch-back', deskX(state, agent));
        }
        break;
      }

      if (!workday) break;

      // Lunch trip down to the lobby.
      if (
        agent.lunchTick >= 0 &&
        tod >= agent.lunchTick &&
        tod < agent.leaveTick &&
        agent.floor !== 0
      ) {
        planTrip(agent, 0, 'lunch-out', 140 + (agent.id % 60));
        agent.lunchTick = tod; // return timer references actual departure
        break;
      }

      // Go home.
      if (tod >= agent.leaveTick && agent.floor !== 0) {
        planTrip(agent, 0, 'leave', 100);
      } else if (tod >= agent.leaveTick && agent.floor === 0) {
        agent.activity = 'offsite';
      }
      break;
    }
  }
}

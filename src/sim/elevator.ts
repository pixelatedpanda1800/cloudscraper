import {
  DOOR_BASE_TICKS,
  DOOR_PER_PASSENGER_TICKS,
  ELEVATOR_CAPACITY,
  ELEVATOR_SPEED,
} from './constants';
import { tickOfDay } from './clock';
import type { Agent, ElevatorCar, ElevatorShaft, SimState } from './types';

/** Classic collective control (SCAN) per car; cars in a shaft share the hall
 *  queues. Cars may pass each other (SimTower's model) — no shaft collision.
 *  Everything iterates in fixed order: shafts by index, cars by index. */

function hasCallAt(shaft: ElevatorShaft, floor: number, dir: -1 | 1): boolean {
  const q = dir === 1 ? shaft.queueUp[floor] : shaft.queueDown[floor];
  return q !== undefined && q.length > 0;
}

function anyCall(shaft: ElevatorShaft, floor: number): boolean {
  return hasCallAt(shaft, floor, 1) || hasCallAt(shaft, floor, -1);
}

/** Is another car in this shaft already stopped (doors open) at this floor?
 *  Prevents two cars servicing the same call simultaneously. */
function floorClaimed(shaft: ElevatorShaft, car: ElevatorCar, floor: number): boolean {
  for (const other of shaft.cars) {
    if (other === car) continue;
    if (other.state === 'doors' && Math.round(other.pos) === floor) return true;
    if (other.state === 'moving' && other.target === floor && other.passengers.length === 0) return true;
  }
  return false;
}

/** Next stop in direction `dir` strictly beyond `from` (passenger dests or unclaimed hall calls). */
function nextStopInDir(
  shaft: ElevatorShaft,
  car: ElevatorCar,
  from: number,
  dir: -1 | 1,
): number | null {
  let best: number | null = null;
  for (const p of car.passengers) {
    if (dir === 1 ? p.dest > from : p.dest < from) {
      if (best === null || (dir === 1 ? p.dest < best : p.dest > best)) best = p.dest;
    }
  }
  const hasRoom = car.passengers.length < ELEVATOR_CAPACITY;
  if (hasRoom) {
    for (let f = shaft.lowFloor; f <= shaft.highFloor; f++) {
      if (dir === 1 ? f <= from : f >= from) continue;
      if (anyCall(shaft, f) && !floorClaimed(shaft, car, f)) {
        if (best === null || (dir === 1 ? f < best : f > best)) best = f;
      }
    }
  }
  return best;
}

function openDoorsAt(state: SimState, shaft: ElevatorShaft, car: ElevatorCar, floor: number): void {
  car.pos = floor;
  car.state = 'doors';

  // Alight: this leg is done; the walking logic plans the next one (if any).
  let moved = 0;
  const remaining: typeof car.passengers = [];
  for (const p of car.passengers) {
    if (p.dest === floor) {
      const agent = state.agents[p.agentId];
      agent.activity = 'walking';
      agent.floor = floor;
      agent.x = shaft.x;
      agent.shaftId = -1;
      agent.legVia = 'none';
      agent.legViaId = -1;
      agent.legFloor = -1;
      moved++;
    } else {
      remaining.push(p);
    }
  }
  car.passengers = remaining;

  // Board: current direction first; if idle, direction of the longest-waiting head.
  let dir = car.dir;
  if (dir === 0) {
    const up = shaft.queueUp[floor] ?? [];
    const down = shaft.queueDown[floor] ?? [];
    if (up.length === 0 && down.length === 0) dir = 0;
    else if (down.length === 0) dir = 1;
    else if (up.length === 0) dir = -1;
    else dir = state.agents[up[0]].waitTicks >= state.agents[down[0]].waitTicks ? 1 : -1;
  }
  if (dir !== 0) {
    const queue = dir === 1 ? shaft.queueUp[floor] : shaft.queueDown[floor];
    while (queue.length > 0 && car.passengers.length < ELEVATOR_CAPACITY) {
      const agentId = queue.shift()!;
      const agent = state.agents[agentId];
      // Ride to the current leg's floor — with transfers this may not be the
      // trip's final destination.
      car.passengers.push({ agentId, dest: agent.legFloor });
      agent.activity = 'riding';
      state.stats.boardedToday++;
      state.stats.totalWaitTicksToday += agent.waitTicks;
      shaft.boardedToday++;
      shaft.waitTicksToday += agent.waitTicks;
      // Complaint evidence (GDD §5): remember the worst wait — where and when.
      if (agent.waitTicks > agent.worstWaitTicks) {
        agent.worstWaitTicks = agent.waitTicks;
        agent.worstWaitShaftId = shaft.id;
        agent.worstWaitFloor = floor;
        agent.worstWaitTod = tickOfDay(state.tick);
      }
      agent.waitTicks = 0;
      moved++;
    }
    car.dir = dir;
  }

  car.doorTicks = DOOR_BASE_TICKS + moved * DOOR_PER_PASSENGER_TICKS;
}

function tickCar(state: SimState, shaft: ElevatorShaft, car: ElevatorCar): void {
  if (car.state === 'doors') {
    car.doorTicks--;
    if (car.doorTicks > 0) return;
    car.state = 'idle'; // choose next move below
  }

  if (car.state === 'moving') {
    const d = car.target - car.pos;
    const step = Math.sign(d) * Math.min(Math.abs(d), ELEVATOR_SPEED);
    car.pos += step;
    if (Math.abs(car.target - car.pos) < 1e-9) {
      openDoorsAt(state, shaft, car, car.target);
    }
    return;
  }

  // idle: decide next target
  const here = Math.round(car.pos);

  if (car.passengers.length === 0 && anyCall(shaft, here) && !floorClaimed(shaft, car, here)) {
    car.dir = 0;
    openDoorsAt(state, shaft, car, here);
    return;
  }

  const dirs: (-1 | 1)[] = car.dir === -1 ? [-1, 1] : [1, -1];
  for (const dir of dirs) {
    const stop = nextStopInDir(shaft, car, car.pos, dir);
    if (stop !== null) {
      car.dir = dir;
      car.target = stop;
      car.state = 'moving';
      return;
    }
  }

  // Nothing to do: an idle empty car drifts back toward the ground lobby.
  car.dir = 0;
  if (here !== shaft.lowFloor && car.passengers.length === 0 && !floorClaimed(shaft, car, shaft.lowFloor)) {
    car.target = shaft.lowFloor;
    car.state = 'moving';
  }
}

export function tickShaft(state: SimState, shaft: ElevatorShaft): void {
  for (let c = 0; c < shaft.cars.length; c++) {
    tickCar(state, shaft, shaft.cars[c]);
  }
}

/** Agent joins `shaft`'s hall queue on their current floor, riding toward the
 *  current leg's floor. The shaft was already chosen by planNextLeg. */
export function enqueueAgent(state: SimState, agent: Agent, shaft: ElevatorShaft): void {
  const dir: -1 | 1 = agent.legFloor > agent.floor ? 1 : -1;
  const q = dir === 1 ? shaft.queueUp[agent.floor] : shaft.queueDown[agent.floor];
  q.push(agent.id);
  agent.activity = 'queuing';
  agent.shaftId = shaft.id;
  if (q.length > state.stats.maxQueueToday) state.stats.maxQueueToday = q.length;
}

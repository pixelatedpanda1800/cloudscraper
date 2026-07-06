import { LOT_WIDTH } from '../sim/constants';
import { clockOf } from '../sim/clock';
import type { SimState } from '../sim/types';

/** M0 debug renderer: plain Canvas2D cross-section. No art — boxes and dots.
 *  Stress palette matches the GDD: content → irritated (pink) → angry (red). */

const FLOOR_H = 22;
const SCALE_X = 4.2;
const MARGIN = 20;

function stressColor(stress: number): string {
  if (stress < 34) return '#8fd18f';
  if (stress < 67) return '#e88bc4';
  return '#ff4040';
}

export function sizeCanvas(canvas: HTMLCanvasElement, state: SimState): void {
  canvas.width = LOT_WIDTH * SCALE_X + MARGIN * 2;
  canvas.height = state.floors * FLOOR_H + MARGIN * 2;
}

export function render(ctx: CanvasRenderingContext2D, state: SimState): void {
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, ctx.canvas.width, H);

  const floorY = (f: number) => H - MARGIN - (f + 1) * FLOOR_H;
  const tx = (x: number) => MARGIN + x * SCALE_X;

  // Floors + facilities
  for (const fac of state.facilities) {
    const y = floorY(fac.floor);
    if (fac.kind === 'lobby') {
      ctx.fillStyle = '#2a3040';
    } else {
      ctx.fillStyle = '#1e2733';
    }
    ctx.fillRect(tx(fac.x), y + 2, fac.width * SCALE_X, FLOOR_H - 3);
    ctx.strokeStyle = '#39445a';
    ctx.strokeRect(tx(fac.x) + 0.5, y + 2.5, fac.width * SCALE_X - 1, FLOOR_H - 4);
  }

  // Floor lines
  ctx.strokeStyle = '#222835';
  for (let f = 0; f < state.floors; f++) {
    const y = floorY(f) + FLOOR_H - 0.5;
    ctx.beginPath();
    ctx.moveTo(tx(0), y);
    ctx.lineTo(tx(LOT_WIDTH), y);
    ctx.stroke();
  }

  // Shafts, cars, queue counts
  for (const shaft of state.shafts) {
    const x = tx(shaft.x) - 2;
    const topY = floorY(shaft.highFloor);
    const botY = floorY(shaft.lowFloor) + FLOOR_H;
    ctx.fillStyle = '#151a24';
    ctx.fillRect(x, topY, 5 * SCALE_X * 0.6, botY - topY);
    ctx.strokeStyle = '#4a5570';
    ctx.strokeRect(x + 0.5, topY + 0.5, 5 * SCALE_X * 0.6 - 1, botY - topY - 1);

    // Cars
    for (const car of shaft.cars) {
      const carY = floorY(Math.round(car.pos)) + (Math.round(car.pos) - car.pos) * FLOOR_H;
      const load = car.passengers.length;
      ctx.fillStyle = car.state === 'doors' ? '#e8c860' : load > 0 ? '#6ea8ff' : '#3d72d9';
      ctx.fillRect(x + 2, carY + 3, 5 * SCALE_X * 0.6 - 4, FLOOR_H - 6);
      if (load > 0) {
        ctx.fillStyle = '#0c0e12';
        ctx.font = '9px ui-monospace';
        ctx.fillText(String(load), x + 4, carY + FLOOR_H - 9);
      }
    }

    // Queue lengths per floor
    ctx.font = '9px ui-monospace';
    for (let f = shaft.lowFloor; f <= shaft.highFloor; f++) {
      const q = (shaft.queueUp[f]?.length ?? 0) + (shaft.queueDown[f]?.length ?? 0);
      if (q > 0) {
        ctx.fillStyle = q > 15 ? '#ff4040' : q > 6 ? '#e8c860' : '#7f8aa3';
        ctx.fillText(String(q), x - 14, floorY(f) + 14);
      }
    }
  }

  // Agents
  for (const a of state.agents) {
    if (a.activity === 'offsite') continue;
    if (a.activity === 'riding') continue; // shown as car load count
    ctx.fillStyle = stressColor(a.stress);
    const y = floorY(a.floor) + FLOOR_H - 7;
    ctx.fillRect(tx(a.x), y, 3, 5);
  }
}

export interface HudStats {
  clockText: string;
  inTower: number;
  queuing: number;
  riding: number;
  avgWaitSec: number;
  maxQueue: number;
}

export function hudStats(state: SimState): HudStats {
  const c = clockOf(state.tick);
  let inTower = 0;
  let queuing = 0;
  let riding = 0;
  for (const a of state.agents) {
    if (a.activity !== 'offsite') inTower++;
    if (a.activity === 'queuing') queuing++;
    if (a.activity === 'riding') riding++;
  }
  const avgWaitTicks =
    state.stats.boardedToday > 0 ? state.stats.totalWaitTicksToday / state.stats.boardedToday : 0;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    clockText: `Day ${c.day + 1} (${dayNames[c.day % 7]}) ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`,
    inTower,
    queuing,
    riding,
    avgWaitSec: Math.round(avgWaitTicks / 20),
    maxQueue: state.stats.maxQueueToday,
  };
}

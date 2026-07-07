import { LOT_WIDTH, STAIR_CLIMB_TICKS, STAIR_WIDTH } from '../sim/constants';
import { clockOf } from '../sim/clock';
import type { FacilityKind, SimState } from '../sim/types';

const FACILITY_FILL: Record<FacilityKind, string> = {
  lobby: '#2a3040',
  office: '#1e2733',
  condo: '#22331f', // greenish — residential
  fastfood: '#3a2a1c', // warm — commercial/noisy
  hotel: '#2c2438', // purple — hospitality
  housekeeping: '#25313a', // teal-gray — service
  security: '#39232a', // maroon — service
};

/** M0 debug renderer: plain Canvas2D cross-section. No art — boxes and dots.
 *  Stress palette matches the GDD: content → irritated (pink) → angry (red). */

const FLOOR_H = 22;
const SCALE_X = 4.2;
const MARGIN = 20;

/** Selection state consumed by render(); owned by the UI layer. */
export interface Selection {
  agentId: number | null;
  shaftId: number | null;
  facilityId: number | null;
}

/** Canvas-pixel → sim coordinate helpers for hit-testing. */
export function pickAgent(state: SimState, canvasH: number, px: number, py: number): number | null {
  const floorY = (f: number) => canvasH - MARGIN - (f + 1) * FLOOR_H;
  let best: number | null = null;
  let bestD = 8; // px tolerance
  for (const a of state.agents) {
    if (a.activity === 'offsite' || a.activity === 'riding') continue;
    const ax = MARGIN + a.x * SCALE_X;
    const ay = floorY(a.floor) + FLOOR_H - 5;
    const d = Math.abs(ax - px) + Math.abs(ay - py);
    if (d < bestD) {
      bestD = d;
      best = a.id;
    }
  }
  return best;
}

export function pickShaft(state: SimState, px: number): number | null {
  for (const shaft of state.shafts) {
    const x = MARGIN + shaft.x * SCALE_X - 2;
    if (px >= x - 16 && px <= x + 5 * SCALE_X * 0.6 + 4) return shaft.id;
  }
  return null;
}

/** Canvas pixel → tile x (fractional; callers round/clamp as needed). */
export function canvasToTileX(px: number): number {
  return (px - MARGIN) / SCALE_X;
}

/** Canvas pixel → floor number (may be out of range; sim validates). */
export function canvasToFloor(canvasH: number, py: number): number {
  return Math.floor((canvasH - MARGIN - py) / FLOOR_H);
}

export function pickFacility(state: SimState, canvasH: number, px: number, py: number): number | null {
  const floor = canvasToFloor(canvasH, py);
  const tile = canvasToTileX(px);
  for (const f of state.facilities) {
    if (f.kind === 'lobby') continue;
    if (f.floor === floor && tile >= f.x && tile < f.x + f.width) return f.id;
  }
  return null;
}

export function pickStair(state: SimState, canvasH: number, px: number, py: number): number | null {
  const floor = canvasToFloor(canvasH, py);
  const tile = canvasToTileX(px);
  for (const st of state.stairs) {
    if (
      (floor === st.floorLow || floor === st.floorLow + 1) &&
      tile >= st.x &&
      tile < st.x + STAIR_WIDTH
    )
      return st.id;
  }
  return null;
}

function stressColor(stress: number): string {
  if (stress < 34) return '#8fd18f';
  if (stress < 67) return '#e88bc4';
  return '#ff4040';
}

export function sizeCanvas(canvas: HTMLCanvasElement, state: SimState): void {
  canvas.width = LOT_WIDTH * SCALE_X + MARGIN * 2;
  canvas.height = state.floors * FLOOR_H + MARGIN * 2;
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  sel: Selection = { agentId: null, shaftId: null, facilityId: null },
): void {
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, ctx.canvas.width, H);

  const floorY = (f: number) => H - MARGIN - (f + 1) * FLOOR_H;
  const tx = (x: number) => MARGIN + x * SCALE_X;

  // Floors + facilities
  ctx.font = '9px ui-monospace';
  for (const fac of state.facilities) {
    const y = floorY(fac.floor);
    ctx.fillStyle = FACILITY_FILL[fac.kind];
    ctx.fillRect(tx(fac.x), y + 2, fac.width * SCALE_X, FLOOR_H - 3);
    ctx.strokeStyle = fac.id === sel.facilityId ? '#e8c860' : '#39445a';
    ctx.strokeRect(tx(fac.x) + 0.5, y + 2.5, fac.width * SCALE_X - 1, FLOOR_H - 4);
    if (fac.kind !== 'lobby' && fac.kind !== 'office') {
      // Kind initial (lowercase = dirty hotel room); noise-afflicted units
      // get a warm warning tint, vacant ones go dim.
      const letter = fac.kind === 'hotel' && fac.dirty ? 'h' : fac.kind[0].toUpperCase();
      ctx.fillStyle = fac.vacant ? '#3d4351' : fac.noise > 0 ? '#c9803f' : '#5a6680';
      ctx.fillText(fac.vacant ? `${letter}·` : letter, tx(fac.x) + 3, y + 13);
    } else if (fac.vacant) {
      ctx.fillStyle = '#3d4351';
      ctx.fillText('·', tx(fac.x) + 3, y + 13);
    }
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

  // Stairs: a diagonal ramp spanning the two connected floors.
  for (const st of state.stairs) {
    const x0 = tx(st.x);
    const x1 = tx(st.x + STAIR_WIDTH);
    const yBottom = floorY(st.floorLow) + FLOOR_H - 2;
    const yTop = floorY(st.floorLow + 1) + FLOOR_H - 2;
    ctx.strokeStyle = '#8a93ab';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, yBottom);
    ctx.lineTo(x1, yTop);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#4a5570';
    ctx.strokeRect(x0 + 0.5, yTop - 2.5, x1 - x0 - 1, yBottom - yTop + 4);
  }

  // Shafts, cars, queue counts (service shafts tinted green)
  for (const shaft of state.shafts) {
    const x = tx(shaft.x) - 2;
    const topY = floorY(shaft.highFloor);
    const botY = floorY(shaft.lowFloor) + FLOOR_H;
    ctx.fillStyle = shaft.service ? '#16241c' : '#151a24';
    ctx.fillRect(x, topY, 5 * SCALE_X * 0.6, botY - topY);
    ctx.strokeStyle = shaft.id === sel.shaftId ? '#e8c860' : shaft.service ? '#4a7055' : '#4a5570';
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
    if (a.activity === 'climbing') {
      // Interpolate along the ramp by climb progress.
      const stair = state.stairs.find((s) => s.id === a.legViaId);
      if (stair) {
        const frac = 1 - a.climbTicksLeft / STAIR_CLIMB_TICKS;
        const up = a.legFloor > a.floor;
        const t = up ? frac : 1 - frac;
        const px = tx(stair.x) + t * (STAIR_WIDTH - 1) * SCALE_X;
        const py = floorY(stair.floorLow) + FLOOR_H - 7 - t * FLOOR_H;
        ctx.fillRect(px, py, 3, 5);
      }
      continue;
    }
    const y = floorY(a.floor) + FLOOR_H - 7;
    ctx.fillRect(tx(a.x), y, 3, 5);
  }

  // Selected agent: ring highlight (even while riding — follows the car)
  if (sel.agentId !== null) {
    const a = state.agents[sel.agentId];
    if (a.activity !== 'offsite') {
      const y = floorY(a.floor) + FLOOR_H - 5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tx(a.x) + 1.5, y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
}

export interface HudStats {
  clockText: string;
  inTower: number;
  queuing: number;
  riding: number;
  avgWaitSec: number;
  maxQueue: number;
  pop: number;
  star: number;
}

export function hudStats(state: SimState): HudStats {
  const c = clockOf(state.tick);
  let inTower = 0;
  let queuing = 0;
  let riding = 0;
  let pop = 0;
  for (const a of state.agents) {
    if (a.homeFacilityId >= 0) pop++;
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
    pop,
    star: state.star,
  };
}

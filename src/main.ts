import { buildScenario, tick } from './sim/sim';
import { TICKS_PER_SECOND } from './sim/constants';
import { hudStats, render, sizeCanvas } from './render/debugRenderer';

/** M0 debug harness. Fixed-timestep accumulator drives the deterministic sim;
 *  rendering happens at display rate. Sim logic never touches wall-clock time. */

const state = buildScenario({
  seed: 20260706,
  officeFloors: 14,
  shafts: 6,
  carsPerShaft: 3,
  officesPerFloor: 12,
});
// 14 floors × 12 offices × 6 workers = 1,008 agents — the M0 exit-criteria load.

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
sizeCanvas(canvas, state);

let speed = 1; // sim-seconds per real second multiplier
let paused = false;

// HUD
const hud = document.getElementById('hud')!;
const clockEl = document.createElement('span');
const statsEl = document.createElement('span');
const pauseBtn = document.createElement('button');
pauseBtn.textContent = 'Pause';
pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
};
hud.append(clockEl, pauseBtn);
for (const s of [0.5, 1, 2, 4, 8, 32]) {
  const b = document.createElement('button');
  b.textContent = `${s}×`;
  if (s === 1) b.classList.add('active');
  b.onclick = () => {
    speed = s;
    hud.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    if (paused) { paused = false; pauseBtn.textContent = 'Pause'; }
    b.classList.add('active');
  };
  hud.append(b);
}
hud.append(statsEl);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); pauseBtn.click(); }
});

// Fixed-timestep loop
let last = performance.now();
let acc = 0;
const MS_PER_TICK = 1000 / TICKS_PER_SECOND;

function frame(now: number) {
  const dt = Math.min(now - last, 250); // clamp tab-switch spikes
  last = now;
  if (!paused) {
    acc += dt * speed;
    let steps = 0;
    while (acc >= MS_PER_TICK && steps < 2000) {
      tick(state);
      acc -= MS_PER_TICK;
      steps++;
    }
  }
  render(ctx, state);
  const s = hudStats(state);
  clockEl.textContent = s.clockText;
  statsEl.textContent = ` in tower: ${s.inTower} | queuing: ${s.queuing} | riding: ${s.riding} | avg wait today: ${s.avgWaitSec}s | worst queue: ${s.maxQueue}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

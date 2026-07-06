import { applyAction, buildScenario, tick } from './sim/sim';
import type { Action, LoggedAction } from './sim/sim';
import { TICKS_PER_SECOND, TICKS_PER_HOUR, TICKS_PER_MINUTE } from './sim/constants';
import {
  hudStats,
  pickAgent,
  pickShaft,
  render,
  sizeCanvas,
  type Selection,
} from './render/debugRenderer';

/** M0 debug harness. Fixed-timestep accumulator drives the deterministic sim;
 *  rendering happens at display rate. Sim logic never touches wall-clock time.
 *  All build edits go through applyAction and are recorded in actionLog —
 *  the same snapshot+log model the server saves will use (GDD §12). */

const state = buildScenario({
  seed: 20260706,
  officeFloors: 14,
  shafts: 6,
  carsPerShaft: 3,
  officesPerFloor: 12,
});
// 14 floors × 12 offices × 6 workers = 1,008 agents — the M0 exit-criteria load.

const actionLog: LoggedAction[] = [];
function doAction(action: Action): void {
  if (applyAction(state, action)) actionLog.push({ tick: state.tick, action });
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
sizeCanvas(canvas, state);

let speed = 1;
let paused = false;
const sel: Selection = { agentId: null, shaftId: null };

// ---------- HUD ----------
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

// ---------- Selection ----------
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  const agent = pickAgent(state, canvas.height, px, py);
  if (agent !== null) {
    sel.agentId = agent;
    sel.shaftId = null;
  } else {
    sel.shaftId = pickShaft(state, px);
    sel.agentId = null;
  }
  renderPanel();
});

// ---------- Inspector panel ----------
const panel = document.getElementById('panel')!;

function fmtTod(t: number): string {
  if (t < 0) return '—';
  const h = Math.floor(t / TICKS_PER_HOUR);
  const m = Math.floor((t % TICKS_PER_HOUR) / TICKS_PER_MINUTE);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function kv(label: string, value: string): string {
  return `<div class="kv"><span>${label}</span><span>${value}</span></div>`;
}

function renderPanel(): void {
  if (sel.agentId !== null) {
    const a = state.agents[sel.agentId];
    const office = state.facilities[a.homeFacilityId];
    panel.innerHTML =
      `<h3>Person #${a.id}</h3>` +
      kv('Doing', a.activity + (a.intent !== 'none' ? ` → ${a.intent}` : '')) +
      kv('Floor', String(a.floor)) +
      kv('Stress', `${a.stress.toFixed(1)} / 100`) +
      kv('Waiting', a.activity === 'queuing' ? `${(a.waitTicks / TICKS_PER_SECOND).toFixed(0)}s` : '—') +
      kv('Office', `floor ${office.floor}`) +
      kv('Arrives', fmtTod(a.arriveTick)) +
      kv('Lunch', fmtTod(a.lunchTick)) +
      kv('Leaves', fmtTod(a.leaveTick)) +
      `<div class="hint">Click empty space to deselect.</div>`;
    return;
  }

  if (sel.shaftId !== null) {
    const shaft = state.shafts.find((s) => s.id === sel.shaftId);
    if (!shaft) { sel.shaftId = null; renderPanel(); return; }
    let queued = 0;
    for (let f = shaft.lowFloor; f <= shaft.highFloor; f++) {
      queued += shaft.queueUp[f].length + shaft.queueDown[f].length;
    }
    const riding = shaft.cars.reduce((n, c) => n + c.passengers.length, 0);
    panel.innerHTML =
      `<h3>Shaft #${shaft.id}</h3>` +
      kv('Cars', String(shaft.cars.length)) +
      kv('Riding', String(riding)) +
      kv('Queued', String(queued)) +
      kv('Serves', `floors ${shaft.lowFloor}–${shaft.highFloor}`);
    const addCar = document.createElement('button');
    addCar.textContent = '+ car';
    addCar.disabled = shaft.cars.length >= 8;
    addCar.onclick = () => { doAction({ type: 'addCar', shaftId: shaft.id }); renderPanel(); };
    const rmCar = document.createElement('button');
    rmCar.textContent = '− car';
    rmCar.disabled = shaft.cars.length <= 1;
    rmCar.onclick = () => { doAction({ type: 'removeCar', shaftId: shaft.id }); renderPanel(); };
    const rmShaft = document.createElement('button');
    rmShaft.textContent = 'demolish shaft';
    rmShaft.disabled = state.shafts.length <= 1;
    rmShaft.onclick = () => {
      doAction({ type: 'removeShaft', shaftId: shaft.id });
      sel.shaftId = null;
      renderPanel();
    };
    panel.append(addCar, rmCar, rmShaft);
    return;
  }

  panel.innerHTML =
    `<h3>Inspector</h3>` +
    `<div class="hint">Click a person or an elevator shaft to inspect it.</div>`;
  const addShaft = document.createElement('button');
  addShaft.textContent = '+ shaft';
  addShaft.onclick = () => { doAction({ type: 'addShaft' }); renderPanel(); };
  panel.append(addShaft);
  const logInfo = document.createElement('div');
  logInfo.className = 'hint';
  logInfo.textContent = `${actionLog.length} actions logged this session`;
  panel.append(logInfo);
}
renderPanel();

// Keep live numbers fresh while something is selected.
setInterval(() => {
  if (sel.agentId !== null || sel.shaftId !== null) renderPanel();
}, 500);

// ---------- Fixed-timestep loop ----------
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
  render(ctx, state, sel);
  const s = hudStats(state);
  clockEl.textContent = s.clockText;
  statsEl.textContent = ` in tower: ${s.inTower} | queuing: ${s.queuing} | riding: ${s.riding} | avg wait today: ${s.avgWaitSec}s | worst queue: ${s.maxQueue}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

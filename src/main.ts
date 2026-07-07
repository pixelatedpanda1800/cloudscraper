import { applyAction, buildScenario, facilityById, tick, unitComplaint } from './sim/sim';
import type { Action, LoggedAction } from './sim/sim';
import { CATALOG, tracksSatisfaction } from './sim/catalog';
import {
  LOT_WIDTH,
  STAIR_COST,
  STAIR_WIDTH,
  TICKS_PER_SECOND,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
} from './sim/constants';
import {
  canvasToFloor,
  canvasToTileX,
  hudStats,
  pickAgent,
  pickFacility,
  pickShaft,
  pickStair,
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
const sel: Selection = { agentId: null, shaftId: null, facilityId: null };

// ---------- HUD ----------
const hud = document.getElementById('hud')!;
const clockEl = document.createElement('span');
const cashEl = document.createElement('span');
const statsEl = document.createElement('span');
const pauseBtn = document.createElement('button');
pauseBtn.textContent = 'Pause';
pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
};
hud.append(clockEl, cashEl, pauseBtn);
for (const s of [0.5, 1, 2, 4, 8, 32]) {
  const b = document.createElement('button');
  b.textContent = `${s}×`;
  b.classList.add('speed');
  if (s === 1) b.classList.add('active');
  b.onclick = () => {
    speed = s;
    hud.querySelectorAll('button.speed').forEach((x) => x.classList.remove('active'));
    if (paused) { paused = false; pauseBtn.textContent = 'Pause'; }
    b.classList.add('active');
  };
  hud.append(b);
}

// Build modes: clicks on the canvas either inspect, place something, or bulldoze.
type FacilityKind = keyof typeof CATALOG;
type BuildMode = 'inspect' | FacilityKind | 'stair' | 'demolish';
let buildMode: BuildMode = 'inspect';
const modeButtons = new Map<BuildMode, HTMLButtonElement>();
function setMode(m: BuildMode): void {
  buildMode = buildMode === m ? 'inspect' : m;
  for (const [mode, btn] of modeButtons) btn.classList.toggle('active', mode === buildMode);
}
const modeLabels: [BuildMode, string][] = (
  Object.values(CATALOG)
    .filter((d) => d.buildable)
    .map((d) => [
      d.kind,
      `+ ${d.kind} ($${d.cost / 1000}k${d.minStar > 1 ? `, ${d.minStar}★` : ''})`,
    ]) as [BuildMode, string][]
).concat([
  ['stair', `+ stairs ($${STAIR_COST / 1000}k)`],
  ['demolish', 'bulldoze'],
]);
for (const [mode, label] of modeLabels) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => setMode(mode);
  modeButtons.set(mode, b);
  hud.append(b);
}
hud.append(statsEl);

/** Star-locked build buttons stay visible but disabled until unlocked. */
function refreshBuildLocks(): void {
  for (const [mode, btn] of modeButtons) {
    if (mode in CATALOG) {
      btn.disabled = CATALOG[mode as FacilityKind].minStar > state.star;
    }
  }
}
refreshBuildLocks();

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); pauseBtn.click(); }
  if (e.code === 'Escape') setMode('inspect');
});

// ---------- Canvas clicks: build, bulldoze, or inspect ----------
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;

  if (buildMode !== 'inspect' && buildMode !== 'stair' && buildMode !== 'demolish') {
    const w = CATALOG[buildMode].width;
    const floor = canvasToFloor(canvas.height, py);
    const x = Math.max(0, Math.min(LOT_WIDTH - w, Math.round(canvasToTileX(px) - w / 2)));
    doAction({ type: 'placeFacility', kind: buildMode, floor, x });
    return;
  }
  if (buildMode === 'stair') {
    // The clicked floor is the stair's lower floor.
    const floorLow = canvasToFloor(canvas.height, py);
    const x = Math.max(
      0,
      Math.min(LOT_WIDTH - STAIR_WIDTH, Math.round(canvasToTileX(px) - STAIR_WIDTH / 2)),
    );
    doAction({ type: 'placeStair', floorLow, x });
    return;
  }
  if (buildMode === 'demolish') {
    const facilityId = pickFacility(state, canvas.height, px, py);
    if (facilityId !== null) {
      doAction({ type: 'demolishFacility', facilityId });
      return;
    }
    const stairId = pickStair(state, canvas.height, px, py);
    if (stairId !== null) doAction({ type: 'removeStair', stairId });
    return;
  }

  const agent = pickAgent(state, canvas.height, px, py);
  sel.agentId = agent;
  sel.shaftId = agent === null ? pickShaft(state, px) : null;
  sel.facilityId =
    agent === null && sel.shaftId === null ? pickFacility(state, canvas.height, px, py) : null;
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
    const office = facilityById(state, a.homeFacilityId);
    panel.innerHTML =
      `<h3>Person #${a.id}</h3>` +
      kv('Doing', a.activity + (a.intent !== 'none' ? ` → ${a.intent}` : '')) +
      kv('Floor', String(a.floor)) +
      kv('Stress', `${a.stress.toFixed(1)} / 100`) +
      kv('Waiting', a.activity === 'queuing' ? `${(a.waitTicks / TICKS_PER_SECOND).toFixed(0)}s` : '—') +
      kv('Role', a.role) +
      kv('Home', office ? `${office.kind}, floor ${office.floor}` : 'demolished — departed') +
      kv('Arrives', fmtTod(a.arriveTick)) +
      kv('Lunch', fmtTod(a.lunchTick)) +
      kv('Leaves', fmtTod(a.leaveTick)) +
      `<div class="hint">Click empty space to deselect.</div>`;
    return;
  }

  if (sel.facilityId !== null) {
    const f = facilityById(state, sel.facilityId);
    if (!f) { sel.facilityId = null; renderPanel(); return; }
    const def = CATALOG[f.kind];
    const tenants = state.agents.filter((a) => a.homeFacilityId === f.id).length;
    let html =
      `<h3>${f.kind} (floor ${f.floor})</h3>` +
      kv('Tenants', f.vacant ? 'vacant' : `${tenants}`) +
      kv('Noise', f.noise > 0 ? `${f.noise} (stressing residents)` : '—');
    if (tracksSatisfaction(def)) {
      html += kv('Satisfaction', `${f.satisfaction.toFixed(0)} / 100`);
      const c = unitComplaint(state, f.id);
      if (c) {
        html +=
          c.cause === 'elevator waits'
            ? kv('Complaint', `waits ~${c.waitSec}s at shaft #${c.shaftId}, F${c.floor}, ${c.bucket}`)
            : kv('Complaint', c.cause);
      } else {
        html += kv('Complaint', 'none');
      }
    }
    if (f.kind === 'hotel') html += kv('Room', f.dirty ? 'dirty — needs housekeeping' : 'clean');
    panel.innerHTML = html + `<div class="hint">Click empty space to deselect.</div>`;
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
      `<h3>Shaft #${shaft.id}${shaft.service ? ' (service)' : ''}</h3>` +
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
    `<div class="hint">Click a person, shaft, or unit to inspect it.</div>`;
  const addShaft = document.createElement('button');
  addShaft.textContent = '+ shaft';
  addShaft.onclick = () => { doAction({ type: 'addShaft' }); renderPanel(); };
  panel.append(addShaft);
  const addService = document.createElement('button');
  addService.textContent = '+ service shaft (2★)';
  addService.disabled = state.star < 2;
  addService.onclick = () => { doAction({ type: 'addShaft', service: true }); renderPanel(); };
  panel.append(addService);
  const logInfo = document.createElement('div');
  logInfo.className = 'hint';
  logInfo.textContent = `${actionLog.length} actions logged this session`;
  panel.append(logInfo);
}
renderPanel();

// Keep live numbers fresh while something is selected; re-check star locks.
setInterval(() => {
  refreshBuildLocks();
  if (sel.agentId !== null || sel.shaftId !== null || sel.facilityId !== null) renderPanel();
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
  cashEl.textContent = ` $${state.cash.toLocaleString('en-US')} `;
  statsEl.textContent = ` ${'★'.repeat(s.star)} pop ${s.pop} | in tower: ${s.inTower} | queuing: ${s.queuing} | riding: ${s.riding} | avg wait today: ${s.avgWaitSec}s | worst queue: ${s.maxQueue}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

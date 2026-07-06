# CloudScraper — project context

A web-based spiritual successor to SimTower (working title CloudScraper; folder named SimTower for historical reasons — never use "SimTower" in shipped names/art, it's an EA trademark).

**Read first:** `docs/game-design-document.md` (the spec — §16 has the decisions log) and `docs/simtower-research-brief.md` (why each design decision was made). Developer: Martin (solo, AI-assisted). GitHub: `pixelatedpanda1800/cloudscraper` (private).

## Current status (July 2026)

**M0 (sim core) is functionally complete.** Deterministic fixed-timestep sim + canvas debug renderer + inspector UI. 12 tests passing. Next milestone: M1 vertical slice (GDD §14) — more facility types, stairs/escalators, stress→satisfaction→rent consequences, first pixel-art pass.

## Architecture rules (do not break)

1. **Determinism is sacred.** All sim state is plain JSON data in `SimState`. No `Math.random()`, no `Date`, no wall-clock anywhere in `src/sim/` — randomness via seeded `rng.ts` (`nextFloat`) or order-independent `hashJitter` for per-agent daily values. Fixed iteration order (agents then shafts, by index). The determinism tests (`tests/determinism.test.ts`) must always pass; if a change breaks replay identity, the change is wrong.
2. **All mutations from outside the tick loop go through `applyAction`** (`src/sim/actions.ts`) and get recorded in an action log. Snapshot + action-log replay is the future server-save mechanism (GDD §12) — `runWithLog` proves it.
3. **One timebase:** 20 ticks/sec at 1×; 1 sim-day = 7200 ticks (`constants.ts`). 1 tick = 0.6 sim-seconds. Sim speed multipliers change tick *rate*, never tick *size*.
4. **Sim and render stay separated.** `src/sim/` must never import from `src/render/` or touch the DOM — it will move into a Web Worker (M2) and run on the server for validation (M3).

## Layout

- `src/sim/` — engine: `sim.ts` (tick/run/runWithLog, public API), `agents.ts` (schedules, movement, stress), `elevator.ts` (SCAN control, multi-car shafts, boarding), `actions.ts`, `tower.ts` (scenario builder), `hash.ts` (FNV state hash for replay checks), `clock.ts`, `rng.ts`, `constants.ts`, `types.ts`
- `src/render/debugRenderer.ts` — Canvas2D debug view + hit-testing; `src/main.ts` — harness, HUD, inspector panel
- `tests/` — Vitest; `scripts/bench.ts` — perf check (~120k ticks/sec on 1,008 agents; keep ≥100k)

## Commands

`npm run dev` (Vite), `npm test` (Vitest), `npm run build` (tsc + Vite), `npm run sim:bench`

## Conventions

TypeScript strict; no classes in sim state (plain data + functions); tune gameplay numbers in `constants.ts` with a comment giving the sim-time meaning; every new mechanic gets a determinism-safe test; commit messages describe player-visible behavior, not just code.

## Design guardrails from the GDD

- Stress is the single legibility currency; individual visible sims are the emotional core — never aggregate them away.
- No hard elevator-count caps (economic/spatial limits instead); 8 cars/shaft max is faithful and stays.
- Every complaint/metric must be inspectable to its cause (Inspector pattern).
- Pacing rule: player affords something meaningful every 5–10 min at 1×.

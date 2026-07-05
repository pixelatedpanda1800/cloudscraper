# CLOUDSCRAPER — Game Design Document

*v1.1 · July 2026 · A modern web-based spiritual successor to SimTower*

> **Name:** *CloudScraper* — a skyscraper built to the clouds; logo/key art shows the tower piercing a cloud layer. **Legal note:** "SimTower" is an EA trademark — art and trade dress must be original. A formal trademark search on "CloudScraper" is still required before art lock (note: "cloudscraper" is also the name of a popular Python scraping library — likely fine across trademark classes, but verify).

---

## 1. Vision

**One-liner:** Build a living skyscraper, one floor at a time, and keep thousands of tiny people happy by mastering the flow of the building — in your browser, no install.

**Design pillars:**

1. **The building is alive.** Every person is simulated and visible. You feel success and failure by watching individuals, not reading meters.
2. **Transit is the game.** Elevators, escalators, and stairs are the deep system everything else feeds. Placement is strategy; scheduling is mastery.
3. **Respect the player's time.** The original's biggest flaw was waiting. CloudScraper always shows progress, always explains problems, and never makes you idle.
4. **Legible depth.** Every system can be inspected. No hidden numbers, no unexplained complaints.

**Genre / platform:** Construction & management simulation. Desktop browser (Chrome/Firefox/Safari/Edge), mouse + keyboard first. Single-player. Purchase required (one-time), saves on our servers.

**Audience:** 25–45 management-sim players (Two Point, Project Highrise, Mini Motorways audiences) plus lapsed SimTower nostalgics. Sessions of 20–60 minutes; a full tower takes 15–30 hours.

**What we are NOT building (v1):** multiplayer, mobile touch UI, F2P economy, mod support, 3D.

---

## 2. Core Loop

**Minute loop:** observe traffic and stress → diagnose (heatmaps, complaints) → build or retune (place facility, adjust elevator) → watch the change ripple through the crowd.

**Session loop:** hit a population/income milestone → unlock new facilities → new facilities create new traffic problems → solve them → next milestone.

**Campaign loop:** climb the star ladder 1★ → 5★ → TOWER designation (cathedral, 100 floors). Then: prestige challenges and scenario mode (post-launch).

The tension engine: every facility you add earns money **and** adds bodies to the transit network. Growth is self-sabotaging unless transit grows smarter with it. That's the whole game.

---

## 3. World Structure

- 2D cross-section tower: **100 floors above ground, 10 basement levels**, fixed lot width (~375 tiles).
- Grid-based placement; facilities occupy width × 1 floor (some span 2, e.g. cinema, party hall).
- Time: 1 sim-day ≈ 6 real minutes at 1× (adjustable ×0.5–×8, pause always available). Weekday/weekend cycle; four quarters per year drive rent collection and seasonal events.
- One deterministic timebase: people movement, elevator physics, and clock all tick on the same fixed timestep (fixes the original's night-speed queue bug; required for server validation).

---

## 4. Facilities

Unlocks are gated by star rating (see §6). All numbers are launch targets — tuned in beta; canonical values live in `/design/economy.xlsx` once tuning starts.

| Facility | Star | Size (tiles) | Cost | Income | Population | Notes |
|---|---|---|---|---|---|---|
| Lobby | 1★ | full width | free (F1) | — | — | Required. Sky lobbies every 15 floors |
| Office | 1★ | 9 | $40k | $10k/qtr | 6 workers | Weekday 9–5 traffic |
| Condo | 1★ | 16 | $80k | one-time sale $150k+ | 3 residents | Permanent; picky about noise |
| Fast food | 1★ | 16 | $100k | per customer | staff 2 | Noisy; lunch + evening peaks |
| Stairs / Escalator | 1★/3★ | 8 | $5k/$20k | — | — | Max ±1 floor; escalators move shoppers |
| Hotel single | 2★ | 4 | $20k | per night | 1 guest | Needs housekeeping daily |
| Hotel double | 3★ | 6 | $50k | per night | 2 guests | |
| Hotel suite | 4★ | 10 | $100k | per night | 2 guests | VIPs judge these |
| Housekeeping | 2★ | 15 | $50k | −$10k/qtr | 6 staff | Serves ~12 rooms via service elevator |
| Security office | 2★ | 15 | $100k | −$20k/qtr | 6 staff | Fire/bomb response radius |
| Restaurant | 3★ | 24 | $200k | per customer | staff 3 | Evening traffic magnet |
| Retail shop | 3★ | 12 | $100k | per customer | staff 2 | Needs footfall to survive |
| Cinema | 3★ | 31×2 | $500k | per customer | staff 4 | Weekend anchor |
| Party hall | 4★ | 24×2 | $1M | per event | — | Prestige + cash spikes |
| Medical center | 4★ | 26 | $500k | −$50k/qtr | 10 staff | Reduces stress recovery time |
| Recycling | 4★ | 25 (basement) | $500k | −$30k/qtr | 5 staff | Else garbage trucks = noise |
| Parking (basement) | 3★ | ramp+10/level | $150k | small | — | Reduces lobby congestion |
| Metro station | 5★ | B10, full width | $1M | footfall | — | Second entrance; late-game traffic relief |
| Cathedral | TOWER | top floor | $3M | — | — | Win condition |

**Adjacency rules:** noise sources (fast food, cinema, mechanical) stress residential neighbors within 2 tiles / 1 floor. Condos demand quiet; offices tolerate moderate noise; hotels need quiet at night. This makes floor-plan zoning a real puzzle.

---

## 5. People & Stress Simulation

Every person in the tower is an agent with a schedule (worker, resident, hotel guest, shopper, staff) and a **stress meter (0–100)**, the game's single legibility currency.

**Stress sources:** elevator wait (dominant, ~1 pt per 5 sim-seconds waiting), trip length/transfers, noise exposure, unclean hotel room, failed service (couldn't reach lunch, no parking).
**Stress relief:** fast trips, medical center, weekends, time.

**Visible states:** content (black sprite) → irritated (pink) → angry (red), exactly like the original — this visualization is the emotional core and is non-negotiable.

**Consequences:** offices/condos/shops track rolling tenant satisfaction. Below 50: rent complaints (with **explicit reasons**: "Waits over 3 min at F32 elevator, mornings"). Below 25 for two quarters: tenant leaves. Empty units bleed maintenance cost.

**Modern fix — the Inspector:** click any person to see their day, route, and stress history; click any unit to see its tenants' top three complaints with deep-links to the offending elevator/floor. No more guessing why people are angry.

---

## 6. Progression: The Star Ladder

| Rating | Requirement | Unlocks | New pressure |
|---|---|---|---|
| 1★ | start | offices, condos, fast food, standard elevators, stairs | learn placement |
| 2★ | pop 300 | hotels, housekeeping, security, service elevators | night traffic, cleaning logistics |
| 3★ | pop 1,000 | commercial suite (restaurant/retail/cinema), escalators, express elevators, parking | weekend crowds, sky-lobby design |
| 4★ | pop 5,000 + security & medical coverage | suites, party hall, medical, recycling | service coverage at scale |
| 5★ | pop 10,000 + successful VIP visit | metro station, prestige cosmetics | full-height traffic mastery |
| TOWER | 5★, pop 15,000, 100 floors developed, cathedral built | credits, prestige mode | the victory lap |

**VIP visits** are scheduled (48h sim-hours notice), not random ambushes: the VIP books a suite, samples a restaurant, and rides your elevators; a scored report card follows. Failing gives a retry with the report explaining exactly what to fix.

**Onboarding:** goal-quest chain replaces the 1994 "no documentation" problem — a persistent objectives panel (e.g., "House 100 workers", "Get average morning wait below 90s") that doubles as the tutorial. Skippable for veterans.

---

## 7. Transportation (The Deep System)

**Elevator types:**

- **Standard:** spans ≤ 30 floors, up to 8 cars/shaft. The workhorse.
- **Express:** full height, stops only at ground, sky lobbies (every 15th floor), and basements. High cost, huge capacity.
- **Service:** staff, housekeeping, garbage only. Keeps workers out of guest traffic.

**No hard shaft cap** (the original's 8-shaft limit is replaced): instead, each shaft costs escalating money and floor space, and each additional shaft on a floor consumes rentable width. The constraint is economic and spatial, so big towers stay hard without an arbitrary wall.

**Player controls per shaft:** floors served (with per-floor on/off), car count, standby floors by time-of-day (morning-down, evening-up presets), door/speed upgrades.

**Mastery & automation ladder:** manual tuning → schedule presets → (4★ unlock) **destination dispatch** retrofit — passengers are grouped by destination, raising throughput ~30% — which diegetically solves the late-game micromanagement wall the original was infamous for. Players who love manual tuning can skip it; players drowning in shafts buy their way back to fun.

**Diagnostics (modern, non-negotiable):** live traffic heatmap overlay, per-shaft wait-time graphs, queue-length visualization at lobbies, and a "worst commutes" list. Mini Motorways-style clarity applied to vertical traffic.

---

## 8. Economy

- **Income:** rent collected quarterly (offices, retail leases), nightly (hotels), per-transaction (commercial), one-time (condo sales). A **forecast panel** shows projected next-quarter cashflow so waiting is never blind.
- **Costs:** construction, maintenance per facility, staff wages, elevator power.
- **Loans (new):** up to $2M line of credit at 8%/yr — directly attacks the "standing around waiting for cash" complaint. Bankruptcy = forced facility sales, not game over.
- **Pacing rule:** the player should afford *something meaningful* every 5–10 minutes of play at 1× speed, at every stage. This is the primary tuning target for beta.

**Events (opt-in intensity setting: Calm / Classic / Chaotic):** fires (sprinkler investment pays off; security responds), bomb threat (pay ransom or run the security search minigame; Calm mode disables), buried treasure when excavating basements, quarterly VIP opportunities, Santa in Q4. Events on Classic are scheduled with warnings, never save-ruining.

---

## 9. Modern Sensibilities Checklist

- **Time controls:** pause-and-build, ×0.5–×8. No offline/idle accrual (it's a session game, not an idle game).
- **Transparency:** every complaint names its cause; every meter is clickable to its source.
- **Undo** (last 10 build actions) and demolish-refund (80% within one day of building).
- **Autosave** every sim-day + on close (server-side; see §12). Three tower slots per account.
- **Accessibility:** colorblind-safe stress palette (shape + color), full UI scaling, remappable keys, reduced-motion mode, no reliance on audio cues.
- **No punishing RNG:** disasters telegraphed, difficulty settings honest.
- **Session-friendly:** the game communicates a good stopping point (end of quarter summary).

---

## 10. Art & Audio

**Art direction: modern pixel art.** High-density pixel art at 2× native scale, à la contemporary indies — warm daylight palette shifting through dusk/night, per-window interior scenes, animated micro-stories (office parties, hotel check-ins). Cross-section dollhouse charm is the brand. Deliberate zoom levels: full-tower silhouette → floor detail → person detail.

**Audio:** ambient building hum layered by what's on screen (office chatter, lobby footsteps, elevator chimes), gentle lo-fi score that follows time of day. Sound is informational: distinct chimes for complaint, milestone, event warning.

---

## 11. UX / UI

Single main screen: the tower fills the viewport; edge-docked panels (build palette left, finance/objectives right, time controls bottom). Overlay toggles: traffic heatmap, noise map, satisfaction map, service coverage. Right-click inspects anything. Keyboard: space pause, 1–4 speed, B build, bulldoze X.
Onboarding flows through the objectives panel (§6). Target: a new player places their first office within 60 seconds of first load.

---

## 12. Technical Architecture

**Client:** TypeScript + PixiJS v8 (WebGPU with WebGL fallback). Deterministic fixed-timestep simulation (20 ticks/sec sim core, rendering interpolated at display rate) decoupled from render. Web Worker runs the sim; main thread renders. Target: 10,000 agents at 60fps on a 2020 laptop.

**Server:** Node.js/TypeScript (shares the sim module for validation), PostgreSQL, Redis for sessions. Hosted on managed infra (Fly.io/Render class).

**Save architecture (server-authoritative):**
- Client sends compressed **snapshots** (full sim state, ~100–500KB gzipped) every sim-quarter and on exit, plus a lightweight **action log** between snapshots.
- Server stores last N snapshots per slot (rollback + support debugging). Saves exist **only** server-side — this is what makes the paywall real. IndexedDB holds an emergency local cache for connection-drop recovery, encrypted and reconciled on reconnect (server wins conflicts; client cache only fills gaps).
- Because the sim is deterministic, the server can spot-replay action logs against snapshots to detect tampered saves (cheap anti-cheat, matters if leaderboards arrive later).

**Auth & entitlements:**
- **Purchase-first flow (decided):** the demo requires no account. At purchase, Paddle checkout collects the buyer's email; the webhook auto-creates the account and grants the `entitlement` row; a magic link in the receipt email signs them in. Lowest-friction path from demo to playing. Google/Apple OAuth can be linked afterward. Session JWTs, refresh rotation.
- Payments: **Paddle (decided)** — merchant of record, handles global VAT/sales tax. Every game-session API call checks entitlement.
- Unauthenticated visitors get the marketing page and the **free demo**: a sandboxed 1★ tower, full mechanics, capped at the 2★ threshold, never persists. Demo end-screen is the purchase CTA ("keep this tower" — the demo tower imports into the first save slot on purchase).

**Payments edge cases:** 14-day refund window — refund revokes entitlement and **deletes server saves** (stated clearly in refund policy; saves purged after a 7-day grace buffer for accidental refunds). Chargeback handling, receipt email, tax via Paddle MoR.

---

## 13. Monetization

**Model: one-time purchase, price TBD** (comparable anchor range $10–20: Mad Tower Tycoon ~$10, Project Highrise $19.99; validate during beta). No microtransactions, no ads, no subscription. Post-launch paid DLC possible (scenario packs), free updates for QoL.
**Free demo (decided):** sandboxed 1★ slice, no account needed, no persistence, converts via "keep this tower" import on purchase (§12).
**Why it fits:** premium single-player sim audience is allergic to F2P mechanics; server costs for a snapshot-save single-player game are low (est. <$0.10/user/month at modest scale); the paywall doubles as anti-piracy since saves never exist client-side.
**Known risk** (from research brief): paid browser games are commercially unproven; mitigations are the free demo funnel and a later Steam wrapper (Electron/Tauri, same codebase).

---

## 14. Development Roadmap

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 — Sim core** (8–10 wk) | Deterministic tick engine, agents, pathfinding, one elevator type, debug renderer | 1,000 agents commuting believably; replay determinism verified |
| **M1 — Vertical slice** (8 wk) | 1★→2★ content, pixel-art pass on core set, stress + inspector, save/load local | A stranger plays 30 min unaided and can explain why tenants are angry |
| **M2 — Full ladder** (12 wk) | All facilities, express/service elevators, events, economy tuning, star ladder to TOWER | Full playthrough possible; pacing rule (§8) holds at every star |
| **M3 — Platform** (6 wk) | Accounts, Paddle checkout, server saves, entitlements, demo slice, marketing site | Demo → purchase → play → resume on second device works end-to-end |
| **M4 — Beta & polish** (6–8 wk) | Closed beta via **free comp keys** (entitlement grants, flagged `beta` so they can be expired at launch), economy telemetry tuning, accessibility, performance | 10k agents @60fps; beta retention D7 > 20% |
| **Launch** | — | — |
| Post-launch | Scenario mode, weekly challenge seeds, Steam wrapper, async social | driven by metrics |

**Team (decided): one person, AI-assisted development (Claude).** Milestone durations above assume that reality — sequential, not parallel: expect ~14–18 months to launch rather than 10–12. Art is the biggest solo risk: consider purchased pixel-art bases + AI-assisted iteration for M1, contract polish pass before launch. Cut-line if timeline slips: ship the star ladder to 5★ and patch TOWER-tier content post-launch.

## 15. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Paid-browser conversion unproven | High | Steam wrapper ready; demo-slice decision before launch; low fixed server costs |
| Sim performance at 10k agents in browser | Medium | Worker-thread sim, M0 proves it before art spend |
| Trademark/trade-dress proximity to SimTower | Medium | Original name/art; legal review at M1; homage in mechanics, not assets |
| Elevator sim is the hard 20% (killed prior remakes) | High | M0 is *only* this; no art until it's fun in debug view |
| Scope creep toward Project Highrise breadth | Medium | Pillars doc; anything not serving transit-depth is post-launch |

## 16. Decisions Log & Remaining Open Questions

**Decided (July 2026):**

1. Free demo at launch — sandboxed 1★ slice, no account, imports on purchase.
2. Paddle (merchant of record) for payments.
3. Name: **CloudScraper** — tower-to-the-clouds imagery. Trademark search still to be run before M1 art lock.
4. Offline grace period: 24h local cache, server wins on reconnect.
5. Refunds: 14-day window; entitlement revoked and saves deleted (7-day purge buffer).
6. Account flow: purchase-first — Paddle checkout email auto-creates the account, magic-link sign-in.
7. Beta: free comp keys via `beta`-flagged entitlements.
8. Team: solo developer with Claude support; roadmap re-based to ~14–18 months.

**Still open:**

1. Price — validate in beta (anchor range $10–20).
2. CloudScraper trademark/domain availability check — before M1.
3. Demo cap tuning — does the 1★→2★ slice convert? Measure in beta.

---

*Companion document: [SimTower Deep Research Brief](./simtower-research-brief.md) — history, mechanics reference, successor analysis, and sources behind every design decision above.*

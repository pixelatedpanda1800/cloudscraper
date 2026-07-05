# SimTower: Deep Research Brief

*Prepared July 2026 · Informs the game design document for a modern web-based successor*

## TL;DR

SimTower (1994) was never really a building game — it was an elevator traffic simulator wearing a skyscraper costume, and every design decision flowed from that. Its enduring appeal comes from one deep, legible system (tenant stress driven by transit efficiency) rather than breadth. Its failures are equally clear and fixable: glacial pacing, opaque feedback, hard arbitrary limits (8 elevators), and late-game elevator micromanagement that collapsed into tedium. No successor has fully recaptured it — Project Highrise went broad-but-shallow on transit, Mad Tower Tycoon went arcade — which leaves the core formula genuinely unclaimed 30 years later. A modern web version should keep the stress/transit core, fix pacing and feedback transparency, and must not use the "SimTower" name (EA trademark). The one-time-purchase browser paywall is technically easy (Stripe/Paddle + server-side entitlements) but commercially unusual — that's the biggest business risk, not the design.

## Context & Scope

Researched: the original game's history, mechanics, and reception; its sequels and spiritual successors; what modern players and practitioners say worked and failed; and the technical/commercial landscape for a paywalled browser game with server-side saves in 2026. Frameworks applied: competitive positioning (successor comparison), root-cause analysis on the original's criticisms, and Jobs-to-be-Done for the modern audience. Out of scope: implementation-level code, marketing plan, F2P economy design (ruled out by the chosen one-time-purchase model).

## History and Origins

Yoot Saito, a Waseda University graduate with an architecture background, became fascinated by elevator scheduling after playing SimCity on the Macintosh. When an elevator company refused to explain how their dispatch algorithms worked, he built his own simulation with freelance programmer Takumi Abe. The game began as a monochrome HyperCard prototype titled *The Tower*, released in Japan in 1994 by Saito's company OPeNBooK. Will Wright tipped off Maxis president Jeff Braun, and Maxis licensed it for worldwide release in November 1994, renaming it *SimTower: The Vertical Empire* purely to trade on the Sim brand — Maxis did not develop it. It won the 1995 SIIA Codie for Best Simulation Program.

The lineage continued with *Yoot Tower / The Tower II* (1998), *The Tower SP* for Game Boy Advance (2005–06, published by Nintendo in Japan and Sega in the US), *The Tower DS* (2008), and a Yoot Tower iPad port. None broke out commercially. Notably, the "Sim" name belonged to Maxis (now EA) — the original creator himself had to publish sequels without it, and any modern homage must do the same.

## How the Game Actually Works

**Structure.** A 2D cross-section skyscraper, maximum 100 floors above ground and 9 below. The player places facilities on floors: offices, condos, hotel rooms (single/double/suite), fast food, restaurants, retail, cinemas, party halls, parking, medical centers, security, housekeeping, recycling, a metro station on B10, and finally a cathedral.

**Star progression.** The tower is rated 1–5 stars on population milestones plus condition gates: 2 stars at 300 population, 3 stars at 1,000 (unlocking most commercial facilities), 4 stars at 5,000 (requiring security, medical, recycling), 5 stars at 10,000 population plus a successful VIP visit. The final "Tower" designation requires a fully built-out 5-star tower with a cathedral on top. Each star unlocks new facilities — progression is the content.

**People and stress.** Every tenant and visitor has a stress level fed by elevator wait times, trip length, noise adjacency (fast food next to condos), and dirty hotel rooms. High stress turns sims pink/red, drives complaints, rent-drops, and eventually vacancy. Stress is the single currency that makes the whole simulation legible — you can literally watch a red sim fume in an elevator queue.

**Transportation — the real game.** Standard elevators span at most 30 floors; express elevators span the full height but only stop at lobbies (every 15th floor) and basements; service elevators handle housekeeping and garbage. Hard limits: 8 passenger/express shafts total, 8 cars per shaft, plus escalators/stairs limited to short hops. The player can tune each shaft's floor stops, car counts, standby floors, and schedule by time of day. Traffic peaks at weekday morning rush, lunch, and 5pm; hotels invert the pattern at night; weekends shift load to commercial.

**Economy.** Income arrives quarterly (rent from offices/condos/hotels, sales from commercial). Prices adjust per-unit occupancy and satisfaction; unhappy tenants force rent cuts, then leave. There is no debt/loan system — growth is gated purely by cash accumulation, which is the root of the pacing complaints.

**Events.** Fires (sprinklers or watch it burn), terrorist bomb threats ($300,000 ransom or a security minigame to find the bomb), buried treasure when digging basements, VIP visits that gate star advancement, and Santa flying past every Q4.

## Reception: What Worked, What Failed

Contemporary reviews (AllGame 4/5, Entertainment Weekly B−, Next Generation 2/5) and three decades of retrospectives converge on a consistent picture.

**What worked:** the voyeuristic charm of watching thousands of tiny people live in a dollhouse cross-section ("more interesting than watching cars move" — South China Morning Post); the open-ended sandbox with a clear aspirational goal (the TOWER rating); one deep system that made every layout decision meaningful; noise/adjacency puzzles that made floor planning a spatial puzzle.

**What failed, with root causes:**

| Complaint | Root cause | Modern fix implication |
|---|---|---|
| "Standing around waiting for cash" (Next Gen 2/5) | Quarterly income + no loans + slow game speed | Faster ticks, income smoothing, optional loans, real speed controls |
| Tenants complain but never say why | Stress model hidden; no diagnostics | Explicit complaint reasons, stress heatmaps, transit analytics |
| Late-game elevator micromanagement "a pain above 30 floors" | 8-shaft hard cap + manual per-shaft tuning at scale | Soft economic limits, better defaults, automation upgrades (destination dispatch) |
| No documentation, hard to learn | 1994 manual culture | In-game contextual tutorial, goal quests |
| No scenarios or prebuilt towers | Pure sandbox only | Scenario/challenge modes (Yoot Tower later added per-building scenarios — validated demand) |
| Night-time speed-up broke elevator queues | Transit speed tied to real time while sim time compressed | Deterministic fixed-timestep sim where transit and clock share one timebase |

## The Successor Landscape

**Yoot Tower (1998)** — same designer, added location-specific scenarios (Tokyo, Hawaii, Kegon Falls) and more facility interdependence, but sold poorly; the added fiddliness without fixing pacing didn't expand the audience.

**Project Highrise (2016, SomaSim)** — the most successful modern take (well-reviewed, multiple DLCs). It swapped elevator simulation for utility/supply-chain management (copper wiring, water, phone lines) and contract-based progression. Steam community threads consistently note its elevators are shallow — "not an elevator sim like SimTower" — which is precisely the gap it left open. Lesson: the genre supports a mid-size premium indie, and depth was traded away, not superseded.

**Mad Tower Tycoon (2018)** — closer elevator model, arcade pacing, but jank and shallow charm kept it niche.

**Tiny Tower (2011, NimbleBit)** — proved the fantasy has mass casual appeal (millions of downloads) but F2P-ified it into a timer game; its success is evidence of demand for the *fantasy*, not the simulation.

**OpenSkyscraper** — open-source C++ SimTower clone, development halted; useful as a mechanics reference (its source decodes original game data), not a competitor. No serious browser-native implementation of the formula exists — the niche is empty.

## What Practitioners Actually Experience (Layer 3 insights)

1. **The elevator cap was the difficulty curve.** Veterans' strategies (GameFAQs guides, forum threads) are almost entirely elevator topology: 15-floor "sky lobby" segmentation, express-to-local transfer patterns, standby floor tuning. The 8-shaft limit forced creativity but also created the late-game wall players hated. A modern design can replace the hard cap with escalating costs/space requirements and get the same puzzle without the cliff.

2. **Stress legibility is the killer feature nobody names.** Players describe watching individual pink/red sims and *feeling* the failure. Successors that abstracted people into aggregate meters (Project Highrise) lost emotional grip. The individual-sim visualization is cheap in 2026 and is the moat.

3. **Pacing complaints were really feedback complaints.** Waiting for money felt bad because nothing visibly progressed while waiting. Modern idle-game techniques (visible accrual, micro-goals, forecast panels) fix the *feeling* without changing the economy much.

4. **The real-time/sim-time coupling bug is a warning.** Original transit speed was tied to wall-clock while sim time compressed at night, producing pathological queues — a lesson to build one deterministic timebase from day one, which also matters for server-side save validation.

5. **Every revival attempt died on scope, not demand.** OpenSkyscraper stalled; fan remakes repeatedly restart. The formula looks small but the people-sim plus transit-sim interaction is the hard 20%. Budget accordingly: the elevator/person simulation *is* the project.

## Technical & Commercial Landscape for the Web Build

The 2026 browser stack comfortably handles this game: PixiJS v8 (WebGPU-backed, aggressive draw-call batching — thousands of animated sprites is trivial), TypeScript end-to-end, and a deterministic fixed-timestep simulation that can run identically on client and server. Server-authoritative saves are standard practice: the client streams action logs or periodic snapshots; the server owns truth, enabling cross-device play later and making the paywall meaningful (no save = no game without an account). Stripe Checkout, Paddle, or Polar handle one-time purchases; Paddle/Polar act as merchant of record, which outsources global VAT/sales-tax — significant for a solo/small team selling worldwide.

The commercial caveat: paywalled browser games are rare because buyers congregate on Steam and browser users expect free. Mitigations seen in the wild: a free sandbox slice as marketing, wrapping the same build for Steam via Electron/Tauri later, and treating the browser as the frictionless demo-to-purchase funnel rather than fighting it.

## Adjacent Opportunities

**Steam wrapper release** — the identical TypeScript/PixiJS build ships to Steam via Electron. Why relevant: it's where premium sim buyers are; near-zero marginal cost. Signal: high. Explore: "Electron Steam release PixiJS".

**Cozy-management market wave** — the post-2020 renaissance (Unpacking, Mini Motorways, Two Point) shows premium, charming, single-system sims selling well; a pixel-art tower sim fits it exactly. Signal: high. Explore: Mini Motorways postmortems — its flow-visualization UI is directly stealable for elevator traffic.

**Destination-dispatch as endgame content** — real elevator science (grouping passengers by destination) is a ready-made late-game automation unlock that solves the micromanagement wall *diegetically*. Signal: medium. Explore: "destination dispatch elevator algorithm".

**Async social later** — ghost visits to friends' towers and weekly challenge seeds bolt cleanly onto server-side saves (already required by the paywall). Signal: medium; deliberately deferred from v1 per scope decision.

## Competing Perspectives & Red Team

The strongest case against this project: nostalgia inflates SimTower's reputation — Next Generation scored it 2/5 *at the time* ("not much fun at all"), and the pacing that bored a 1995 reviewer will bore a 2026 player faster. Every faithful successor has been niche; only the ones that abandoned the simulation (Tiny Tower) reached scale. And a paywall in a browser fights 25 years of user expectation — conversion rates for paid web games are unproven, and the same money spent on a Steam-first release would reach a proven premium audience. For the opposite conclusion to hold (build it F2P or Steam-first instead), you'd need evidence that browser purchase friction outweighs browser reach; the honest answer is nobody has good public data. The design mitigations — modern pacing, feedback transparency, a Steam wrapper option, and a free marketing slice — address each point, but the commercial model, not the game design, is where this project could fail. The design conclusion survives red-teaming; the distribution conclusion carries real risk and is flagged as such in the GDD.

## Horizon: Worth Knowing

The Tower SP's GBA-era QoL simplifications are a good reference for a compact facility set. Yoot Saito remains active (Dreamcast's Seaman, Odama) and has spoken about tower design in interviews — worth reading before finalizing tone. EA holds the SimTower trademark: name, logo, and trade dress must be original. Roblox tower tycoons show the fantasy resonates with under-16s, an audience browser distribution reaches naturally. Elevator scheduling is an active CS research area (reinforcement-learning dispatch) if the simulation wants real depth. Grid.js/Chart.js-style web dashboards suggest the analytics-forward UI direction modern players expect from management sims.

## Sources & Confidence

Primary sources: [Wikipedia — SimTower](https://en.wikipedia.org/wiki/SimTower) (history, mechanics, reception — corroborated by cited period reviews), [The Obscuritory](https://obscuritory.com/sim/simtower-the-vertical-empire/), [Everything Is Bad for You retrospective](https://sonatano1.wordpress.com/2014/07/19/retrospective-simtower/), [Sim Tower Wiki — star rating](https://simtower.fandom.com/wiki/Star_rating), [GameFAQs strategy guides](https://gamefaqs.gamespot.com/pc/565191-simtower/faqs/7772), [Steam community comparisons of Project Highrise / Mad Tower Tycoon](https://steamcommunity.com/app/423580/discussions/0/2272575584123433759/), [Mad Tower Tycoon discussions](https://steamcommunity.com/app/910880/discussions/0/1640915206466051341/), [nerdybookahs comparison](https://nerdybookahs.wordpress.com/2019/08/25/mad-tower-tycoon-and-project-highrise-whats-the-difference/), [OpenSkyscraper on GitHub](https://github.com/fabianschuiki/OpenSkyscraper), [OSGC SimTower clones list](https://osgameclones.com/simtower/), [PixiJS architecture docs](https://pixijs.com/8.x/guides/concepts/architecture), [StraySpark on 2026 browser games](https://www.strayspark.studio/blog/webgpu-browser-indie-games-2026), [Colyseus/PixiJS architecture writeup](https://arnauld-alex.com/guiding-the-flock-building-a-realtime-multiplayer-game-architecture-in-typescript).

Confidence: **HIGH** on original-game mechanics, history, and reception (multiple independent corroborating sources). **MEDIUM** on successor sales/retention interpretation (inferred from reviews and community sentiment, not sales data). **LOW-MEDIUM** on paid-browser-game conversion economics (thin public data — flagged in red team). Star thresholds (300 / 1,000 / 5,000 / 10,000, TOWER at 15,000) are corroborated across [multiple strategy guides](https://gamefaqs.gamespot.com/pc/565191-simtower/faqs/7772); treat facility-level economy numbers in the GDD appendix as design targets, not archival fact.

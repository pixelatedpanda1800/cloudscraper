# CloudScraper

A modern web-based spiritual successor to SimTower. Build a living skyscraper to the clouds and keep thousands of simulated people happy by mastering the flow of the building.

- **Platform:** desktop browser (TypeScript + PixiJS v8)
- **Model:** one-time purchase (Paddle), server-authoritative saves
- **Status:** pre-development — design phase complete

## Documentation

- [Game Design Document](docs/game-design-document.md)
- [SimTower Deep Research Brief](docs/simtower-research-brief.md)

## Planned structure

```
client/   TypeScript + PixiJS v8 game client (sim core in a Web Worker)
server/   Node.js/TypeScript API — auth, entitlements, saves (PostgreSQL)
shared/   Deterministic simulation module shared by client and server
docs/     Design documents
```

## Roadmap

M0 sim core → M1 vertical slice → M2 full star ladder → M3 platform (accounts/payments/saves) → M4 beta → launch. See GDD §14.

---

© 2026 Martin Bisiker. All rights reserved. Not affiliated with EA or the SimTower trademark.

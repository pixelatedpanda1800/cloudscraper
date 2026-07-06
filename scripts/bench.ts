import { buildScenario, run } from '../src/sim/sim';
import { TICKS_PER_DAY } from '../src/sim/constants';

/** Perf check: simulate full days of 1,000-agent tower, report ticks/sec.
 *  Budget: 20 tps needed at 1×; we want ≥ 100k tps headroom for 8× + bigger towers. */
const s = buildScenario({ seed: 7, officeFloors: 14, shafts: 6, carsPerShaft: 3, officesPerFloor: 12 });
console.log(`agents: ${s.agents.length}, floors: ${s.floors}, shafts: ${s.shafts.length}`);

const DAYS = 5;
const t0 = performance.now();
run(s, TICKS_PER_DAY * DAYS);
const ms = performance.now() - t0;
const tps = Math.round((TICKS_PER_DAY * DAYS) / (ms / 1000));
console.log(`${DAYS} sim-days (${TICKS_PER_DAY * DAYS} ticks) in ${Math.round(ms)}ms → ${tps.toLocaleString()} ticks/sec`);
console.log(`headroom vs 20 tps realtime: ${Math.round(tps / 20).toLocaleString()}×`);

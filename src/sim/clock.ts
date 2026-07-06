import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_MINUTE } from './constants';
import type { SimClock } from './types';

/** Sim starts at 06:00 on day 0 (a Monday). Days 5,6 of each week are the weekend. */
export const START_OFFSET = 6 * TICKS_PER_HOUR;

export function clockOf(tick: number): SimClock {
  const t = tick + START_OFFSET;
  const day = Math.floor(t / TICKS_PER_DAY);
  const tod = t % TICKS_PER_DAY;
  const hour = Math.floor(tod / TICKS_PER_HOUR);
  const minute = Math.floor((tod % TICKS_PER_HOUR) / TICKS_PER_MINUTE);
  return { day, hour, minute, isWorkday: day % 7 < 5 };
}

/** Day-relative tick (0..TICKS_PER_DAY-1) for the current sim day. */
export function tickOfDay(tick: number): number {
  return (tick + START_OFFSET) % TICKS_PER_DAY;
}

export function dayOf(tick: number): number {
  return Math.floor((tick + START_OFFSET) / TICKS_PER_DAY);
}

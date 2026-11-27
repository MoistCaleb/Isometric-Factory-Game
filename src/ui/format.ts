import { DAY_TICKS, TPS } from '../sim/state';

/** In-game clock: day N, HH:MM (day starts 06:00). */
export function gameClock(tick: number): string {
  const day = Math.floor(tick / DAY_TICKS) + 1;
  const mins = Math.floor(((tick % DAY_TICKS) / DAY_TICKS) * 1440 + 360) % 1440;
  return `Day ${day} ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export function duration(tick: number): string {
  const s = Math.floor(tick / TPS);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

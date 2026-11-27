// Planet weather (DESIGN §3): wind strength + rain, eased toward randomly rolled fronts. Acid rain: P5.
import { next } from './rng';
import { TPS, timeOfDay, type GameState } from './state';

const EASE = 1 / (TPS * 90); // ~90 s to settle

export function stepWeather(s: GameState): void {
  const w = s.weather;
  if (s.tick >= w.next) {
    w.tRain = next(s) < 0.3 ? 0.3 + next(s) * 0.7 : 0;
    w.tWind = Math.min(1, 0.05 + next(s) ** 1.5 * 0.8 + w.tRain * 0.2);
    w.next = s.tick + Math.floor(TPS * 60 * (3 + next(s) * 9));
  }
  w.wind += (w.tWind - w.wind) * EASE * 3;
  w.rain += (w.tRain - w.rain) * EASE * 3;
  if (w.rain < 0.002 && w.tRain === 0) w.rain = 0;
}

/** Sunlight 0–1 (solar, P3d): follows the sun's height (as the renderer lights it), dimmed by rain. */
export function sunlight(s: GameState): number {
  const elev = Math.sin((timeOfDay(s.tick) - 0.25) * Math.PI * 2);
  return Math.min(1, Math.max(0, elev * 1.5)) * (1 - s.weather.rain * 0.7);
}

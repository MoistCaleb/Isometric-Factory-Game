// One deterministic simulation tick. Systems are added here phase by phase.
import { TPS, type GameState } from './state';
import { stepWeather } from './weather';

export function step(s: GameState): void {
  s.tick++;
  s.playSeconds = s.tick / TPS;
  stepWeather(s);
}

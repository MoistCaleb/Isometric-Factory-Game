// One deterministic simulation tick. Systems are added here phase by phase.
import type { WorldGen } from '../world/gen';
import { stepMachines } from './machines';
import { stepPipes } from './pipes';
import { stepQuests } from './quests';
import { TPS, type GameState } from './state';
import { stepWeather } from './weather';

export function step(s: GameState, gen?: WorldGen): void {
  s.tick++;
  s.playSeconds = s.tick / TPS;
  stepWeather(s);
  if (gen) { stepMachines(s, gen); stepPipes(s, gen); }
  stepQuests(s);
}

// One deterministic simulation tick. Systems are added here phase by phase.
import type { WorldGen } from '../world/gen';
import { stepFarm } from './farm';
import { stepMachines } from './machines';
import { stepPipes } from './pipes';
import { stepPollution } from './pollution';
import { stepPower } from './power';
import { stepQuests } from './quests';
import { stepStats } from './stats';
import { TPS, type GameState } from './state';
import { stepWeather } from './weather';

export function step(s: GameState, gen?: WorldGen): void {
  s.tick++;
  s.playSeconds = s.tick / TPS;
  stepWeather(s);
  if (gen) { stepMachines(s, gen); stepFarm(s, gen); stepPipes(s, gen); stepPower(s, gen); stepPollution(s, gen); }
  stepQuests(s);
  stepStats(s);
}

// CONTENT §11g. Map size = real radius relative to Earth (4096×2048). Jupiter/asteroids: later.
import type { TierId } from './tiers';

export interface PlanetDef { id: string; name: string; size: number; w: number; h: number; unlock: TierId | 'start'; traits: string }

export const DEPTH = 26; // layers 0–25
export const PLANETS: PlanetDef[] = [
  { id: 'earth', name: 'Earth', size: 1, w: 4096, h: 2048, unlock: 'start', traits: 'All biomes, oceans' },
  { id: 'moon', name: 'Moon', size: 0.27, w: 1106, h: 553, unlock: 'EHV', traits: 'No atmosphere, low gravity' },
  { id: 'mars', name: 'Mars', size: 0.53, w: 2171, h: 1085, unlock: 'SV', traits: 'Thin CO₂ atmosphere, cold, dust storms' },
  { id: 'mercury', name: 'Mercury', size: 0.38, w: 1556, h: 778, unlock: 'SV', traits: 'No atmosphere, extreme heat swings' },
  { id: 'venus', name: 'Venus', size: 0.95, w: 3891, h: 1946, unlock: 'PV', traits: 'Crushing pressure, ~740 K, H₂SO₄ clouds' },
  { id: 'europa', name: 'Europa', size: 0.25, w: 1024, h: 512, unlock: 'PV', traits: 'Ice shell, subsurface ocean' },
  { id: 'titan', name: 'Titan', size: 0.4, w: 1638, h: 819, unlock: 'PV', traits: 'Dense N₂, methane lakes' },
];
export const planet = (id: string) => PLANETS.find((p) => p.id === id) ?? PLANETS[0];

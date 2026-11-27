// DESIGN §2. Index = ore hardness / tier index.
export const TIERS = ['P', 'S', 'LV', 'MV', 'HV', 'EHV', 'SV', 'PV', 'QV'] as const;
export type TierId = (typeof TIERS)[number];
export const TIER_NAME: Record<TierId, string> = {
  P: 'Primitive', S: 'Steam', LV: 'LV', MV: 'MV', HV: 'HV', EHV: 'EHV', SV: 'SV', PV: 'PV', QV: 'QV',
};
/** Max voltage (V); 0 = non-electric. */
export const TIER_VOLTAGE: Record<TierId, number> = {
  P: 0, S: 0, LV: 32, MV: 128, HV: 512, EHV: 2048, SV: 8192, PV: 32768, QV: 131072,
};
export const tierIndex = (t: TierId): number => TIERS.indexOf(t);

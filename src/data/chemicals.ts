// CONTENT §11a chemicals & fluids. Molten metals are generated separately (`molten:<material>`).
import type { Hazard } from './materials';

export type Phase = 'gas' | 'liquid';
export interface ChemicalDef { id: string; name: string; formula?: string; phase: Phase; hazards: Hazard[]; color: number }

type Row = [id: string, name: string, formula: string, phase: 'g' | 'l', hazards: string, color: number];
const ROWS: Row[] = [
  ['water', 'Water', 'H₂O', 'l', '', 0x3070d0], ['steam', 'Steam', 'H₂O', 'g', '', 0xe0e0e0],
  ['brine', 'Brine', 'NaCl(aq)', 'l', '', 0x5088c0], ['air', 'Air', '', 'g', '', 0xd0e0f0],
  ['oxygen', 'Oxygen', 'O₂', 'g', '', 0x90c0f0], ['nitrogen', 'Nitrogen', 'N₂', 'g', '', 0x80a0d0],
  ['hydrogen', 'Hydrogen', 'H₂', 'g', 'flammable', 0xf0f0ff], ['chlorine', 'Chlorine', 'Cl₂', 'g', 'toxic corrosive', 0xc0e060],
  ['argon', 'Argon', 'Ar', 'g', '', 0xb080e0], ['carbon_dioxide', 'Carbon Dioxide', 'CO₂', 'g', '', 0xa0a0a0],
  ['sulfur_dioxide', 'Sulfur Dioxide', 'SO₂', 'g', 'toxic', 0xd0d090], ['sulfur_trioxide', 'Sulfur Trioxide', 'SO₃', 'g', 'toxic corrosive', 0xc0c070],
  ['sulfuric_acid', 'Sulfuric Acid', 'H₂SO₄', 'l', 'corrosive', 0xd0a030], ['hydrochloric_acid', 'Hydrochloric Acid', 'HCl', 'l', 'corrosive toxic', 0xb0d0a0],
  ['hydrofluoric_acid', 'Hydrofluoric Acid', 'HF', 'l', 'corrosive toxic', 0xa0e0d0], ['nitric_acid', 'Nitric Acid', 'HNO₃', 'l', 'corrosive toxic', 0xe0c080],
  ['sodium_hydroxide', 'Sodium Hydroxide', 'NaOH', 'l', 'corrosive', 0xe0e0f0], ['ammonia', 'Ammonia', 'NH₃', 'g', 'toxic', 0xc0d0e0],
  ['sodium_aluminate', 'Sodium Aluminate', 'NaAlO₂(aq)', 'l', 'corrosive', 0xd0d0c0], ['aluminium_hydroxide', 'Aluminium Hydroxide', 'Al(OH)₃', 'l', '', 0xe8e8e0],
  ['alumina', 'Alumina', 'Al₂O₃', 'l', '', 0xf0f0f0], ['cryolite', 'Cryolite', 'Na₃AlF₆', 'l', 'toxic', 0xd8e8f0],
  ['red_mud', 'Red Mud', '', 'l', 'corrosive', 0xa04030],
  ['creosote', 'Creosote', '', 'l', 'flammable toxic', 0x6a4a20], ['coal_tar', 'Coal Tar', '', 'l', 'flammable toxic', 0x202018],
  ['wood_tar', 'Wood Tar', '', 'l', 'flammable', 0x4a3018], ['methanol', 'Methanol', 'CH₃OH', 'l', 'flammable toxic', 0xd0d8e0],
  ['acetic_acid', 'Acetic Acid', 'CH₃COOH', 'l', 'corrosive', 0xe0e0d0], ['formaldehyde', 'Formaldehyde', 'CH₂O', 'g', 'toxic', 0xe0e0f0],
  ['phenol', 'Phenol', 'C₆H₅OH', 'l', 'toxic corrosive', 0xe0c0b0], ['benzene', 'Benzene', 'C₆H₆', 'l', 'flammable toxic', 0xe0e0b0],
  ['toluene', 'Toluene', 'C₇H₈', 'l', 'flammable toxic', 0xd0d0a0], ['phenolic_resin', 'Phenolic Resin', '', 'l', '', 0x8a5020],
  ['ethanol', 'Ethanol', 'C₂H₅OH', 'l', 'flammable', 0xf0e8c0], ['crude_oil', 'Crude Oil', '', 'l', 'flammable', 0x101010],
  ['natural_gas', 'Natural Gas', '', 'g', 'flammable', 0xe0f0e0], ['methane', 'Methane', 'CH₄', 'g', 'flammable', 0xe8e0f0],
  ['ethane', 'Ethane', 'C₂H₆', 'g', 'flammable', 0xe0d8f0], ['ethylene', 'Ethylene', 'C₂H₄', 'g', 'flammable', 0xf0f0f0],
  ['propane', 'Propane', 'C₃H₈', 'g', 'flammable', 0xf0e0c0], ['naphtha', 'Naphtha', '', 'l', 'flammable', 0xe0c040],
  ['kerosene', 'Kerosene', '', 'l', 'flammable', 0xd0d080], ['diesel', 'Diesel', '', 'l', 'flammable', 0xe0d040],
  ['heavy_fuel_oil', 'Heavy Fuel Oil', '', 'l', 'flammable', 0x302010], ['lubricant', 'Lubricant', '', 'l', '', 0xf0e0a0],
  ['styrene', 'Styrene', 'C₈H₈', 'l', 'flammable toxic', 0xe0e0e8], ['butadiene', 'Butadiene', 'C₄H₆', 'g', 'flammable toxic', 0xd8c8b8],
  ['vinyl_chloride', 'Vinyl Chloride', 'C₂H₃Cl', 'g', 'flammable toxic', 0xe0f0e0], ['epichlorohydrin', 'Epichlorohydrin', 'C₃H₅ClO', 'l', 'toxic', 0xe0d0c0],
  ['bisphenol_a', 'Bisphenol-A', 'C₁₅H₁₆O₂', 'l', 'toxic', 0xe8d8b0],
  ['titanium_tetrachloride', 'Titanium Tetrachloride', 'TiCl₄', 'l', 'corrosive toxic', 0xe0e0c8], ['magnesium_chloride', 'Magnesium Chloride', 'MgCl₂', 'l', '', 0xe0e0e8],
  ['trichlorosilane', 'Trichlorosilane', 'SiHCl₃', 'l', 'flammable toxic corrosive', 0xd8e0e0],
  ['mercury', 'Mercury', 'Hg', 'l', 'toxic', 0xb8c0c8], ['wastewater', 'Wastewater', '', 'l', 'toxic', 0x506040],
];

export const CHEMICALS: ChemicalDef[] = ROWS.map(([id, name, formula, p, hz, color]) => ({
  id, name, color, formula: formula || undefined, phase: p === 'g' ? 'gas' : 'liquid',
  hazards: hz.split(' ').filter(Boolean) as Hazard[],
}));

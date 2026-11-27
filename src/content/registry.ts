import { generate } from './generate';
import type { FluidDef, ItemDef, Recipe } from './types';

export interface Registry {
  items: ItemDef[];
  fluids: FluidDef[];
  recipes: Recipe[];
  item(id: string): ItemDef | undefined;
  fluid(id: string): FluidDef | undefined;
  /** Recipes producing an item/fluid. */
  recipesFor(id: string): Recipe[];
  /** Recipes consuming an item/fluid. */
  usesOf(id: string): Recipe[];
}

let cached: Registry | undefined;

export function buildRegistry(): Registry {
  const { items, fluids, recipes } = generate();
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const fluidMap = new Map(fluids.map((f) => [f.id, f]));
  const byOut = new Map<string, Recipe[]>();
  const byIn = new Map<string, Recipe[]>();
  const push = (m: Map<string, Recipe[]>, k: string, r: Recipe) => (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  for (const r of recipes) {
    for (const o of [...r.outputs, ...(r.fluidsOut ?? [])]) push(byOut, o.id, r);
    for (const i of [...r.inputs, ...(r.fluidsIn ?? [])]) push(byIn, i.id, r);
  }
  return {
    items, fluids, recipes,
    item: (id) => itemMap.get(id),
    fluid: (id) => fluidMap.get(id),
    recipesFor: (id) => byOut.get(id) ?? [],
    usesOf: (id) => byIn.get(id) ?? [],
  };
}

export const registry = (): Registry => (cached ??= buildRegistry());

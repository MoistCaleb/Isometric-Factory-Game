# CLAUDE.md — project index

## Working rules
- Replies: **succinct**. No recaps of known decisions.
- Suggest `/compact` when safe (after a phase/milestone, before a big new task, never mid-edit).
- Token-light: read only the doc section needed; prefer Edit over rewrite; batch tool calls.
- Branch: `claude/festive-carson-4592s2`. Commit + push when work is done. No PRs unless asked.
- Plan before code; follow docs exactly; update docs when a decision changes.

## Docs (source of truth)
| File | Section | Contents |
|---|---|---|
| docs/DESIGN.md | §1 | data-driven materials → items/recipes; real chemistry; painful early; circuit numbers |
| | §2 | tiers P/S/LV32/MV128/HV512/EHV2048/SV/PV/QV; gate rule (2× tier-N hatches); pacing |
| | §3 | finite wrap planets, layers 0–25, buried ores, scan/excavate, hardness, weather, zoom, space, building/modes |
| | §4 | ore yield ladder, pollution, hazards |
| | §5 | machine model, 6 faces, overclock 2×/4×, parts, multiblocks, maintenance |
| | §6 | power: V/A/W/J, steam, cables, fuses/breakers, generators |
| | §7 | pipes only, AE-like net @HV, blueprints |
| | §8 | UI, inventory 27+9 tools, recipe browser, planner, quests, controls, saves |
| | §9 | tech stack + engineering rules |
| | §10 | build phases P0–P7 |
| docs/CONTENT.md | 11a | 61 materials, form flags, heat ladder, chemicals list |
| | 11b | 34 minerals (H, byproducts), 25 veins |
| | 11c | tools, crafting, P/Steam/LV machines & recipes |
| | 11d | circuits per tier |
| | 11e | chemistry lines + waste uses |
| | 11f | quest outline |
| | 11g | planets (real names/radii) |

## Quick facts
- Stack: TS, Vite, Three.js (ortho iso + globe), Preact UI, sim Web Worker 20 TPS, IndexedDB, Vitest, GH Pages PWA. Desktop + mobile, landscape only (no portrait layout).
- Art: voxel (16³/tile), procedural, greedy-meshed. No sound yet.
- Overseer: no avatar, no enemies. Global inventory across planets.
- No belts. No offline progress. Pause only, no fast-forward.
- Overvoltage explodes machines; dry-boiler refill explodes.
- No GTNH-specific names (tiers/materials).

## Code map
| Path | What |
|---|---|
| src/data/ | raw content tables: tiers, forms (flags→forms, tool types), materials, chemicals, minerals, veins, machines (ids only), misc + world sources, planets |
| src/world/ | noise (hash, x-wrapping fbm, sphere `sfbm` for surface fields), blocks (terrain + ORE_BASE+mineral), gen (`WorldGen`: surface/terrain/block/ore/tree/veins/findSpawn), map (planet raster) |
| src/content/generate.ts | items/fluids/templated recipes from data; ore chain; tools |
| src/content/validate.ts | errors (fail build) + coverage warnings; `reachable()` from world sources |
| src/content/registry.ts | `registry()` lookup: item/fluid/recipesFor/usesOf |
| src/sim/player.ts | inventory (give/move, 27+9 tool slots, stack 64), tool wear, mining (`mine`: exposure rule, hits/tool speed, drops, pick reach H≤T+1, tree chop); `Cmd` → worker `apply` → `act` reply |
| src/sim/ | state (GameState v4: inv/tools, spawn, weather, diffs; TPS=20, DAY_TICKS=20 min, `timeOfDay`), step (systems go here), weather, loop (fixed step, max 5 catch-up), rng, worker, client, protocol |
| src/save/ | codec (gzip JSON envelope), migrations (bump STATE_VERSION + add fn), store (IDB: manual + 5 rolling auto) |
| src/game.ts | controller: boot/load latest, autosave 5 min + on hide, pause on hide, export/import |
| src/render/renderer.ts | `Renderer`: modes iso/map/globe, camera pan/zoom/rotate, Z-level, day/night, rain, input, hover text; view saved in localStorage `view:<seed>` |
| src/render/chunks.ts | 32×32 chunk mesh for one layer slice + instanced trees; renderer builds only chunks overlapping the viewport ground quad (`rectInQuad`), frees off-screen ones after ~1.5 s |
| src/ui/ | Preact App (top bar incl. view buttons, menu, modebar left, Z-bar right, feed), Inventory (hotbar + bag), style.css, format |
| tests/ | vitest: content, sim, save, world |
| tools/mapdump.ts | `npm run map -- <seed> <out.png>`: planet PNG with spawn marker |
| .github/workflows/deploy.yml | test+build every push; Pages deploy on `main` |

## Conventions
- Item id `form:material` (e.g. `plate:copper`), ore chain `ore|crushed_ore|purified_ore|refined_ore|impure_mdust|mdust|small_mdust:<mineral>`; pure minerals (coal, salt, graphite) yield `dust:<product>`.
- Tools `tool:<type>:<material>`. Fluids: chemical id or `molten:<material>` (144 L/ingot).
- Hand recipes: machine `hand`, ticks 0, `tools` worn. Machine conflicts need `circuit`. Hand conflicts resolved by grid shape (P2).
- Mineral refs: material id, chemical id, `m:<mineral>`, `later:<x>`.
- World: x wraps (`gen.wrapX`), y = north→south rows, z = depth layer (0 surface … 25 bedrock). Render: X=x, Z=y, Y=−depth. Diff key `x,y,z` (trees `x,y,t`).
- Vein grid: 1 spot per 64×64 cell (±8 jitter), slots soil/stone/deep/abyssal (`VEIN_SLOTS`), radius ≤ 22 → no overlap (~2.7k on Earth); ore per block = richness.
- Scripts: `npm run dev | test | validate | build | map`.

## Status
- **P0 done**. **P1 done** (planet gen, chunk render, camera, Z-slider, day/night, weather, map + globe).
- Validator warnings = content gaps to close in P2–P4 (alloys, bloomery iron, chemistry, primitive kiln items).
- X-ray ore view is a dev toggle; real reveal = scanning (P2+).
- TODO: chunk loader design (keep chunks loaded off-screen for automation); sim will tick loaded chunks only.
- **P2 Primitive** in progress:
  - [x] P2a mining mode, inventory, tool slots/wear, pits render
  - [ ] P2b crafting station (3×3, tools) + recipe browser v1
  - [ ] P2c placeable structures: entities, Machine Build / Base Build / Demolition
  - [ ] P2d primitive machines + multiblocks sim (kiln, charcoal pile, clay furnace, crucible, bloomery, coke oven, PBF, quern, sluice)
  - [ ] P2e quest book v1 + loot crates

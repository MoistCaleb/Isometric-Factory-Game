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
| src/data/ | raw content tables: tiers, forms (flags→forms, tool types), materials, chemicals, minerals, veins, machines (ids only), misc + world sources, structures (`struct:*` models + costs; multiblock patterns, `multiCells(st, r)` rotated cells + hatch slots), planets |
| src/world/ | noise (hash, x-wrapping fbm, sphere `sfbm` for surface fields), blocks (terrain + ORE_BASE+mineral), gen (`WorldGen`: surface/terrain/block/ore/tree/veins/findSpawn), map (planet raster) |
| src/content/generate.ts | items/fluids/templated recipes from data; ore chain; tools |
| src/content/validate.ts | errors (fail build) + coverage warnings; `reachable()` from world sources |
| src/content/registry.ts | `registry()` lookup: item/fluid/recipesFor/usesOf |
| src/sim/player.ts | inventory (give/take/move, 27+9 tool slots, stack 64), tool wear, hand `craft`/`missing`, mining (`mine`: exposure rule, hits/tool speed, drops, pick reach H≤T+1, tree chop); `Cmd` → worker `apply` → `act` reply |
| src/sim/machines.ts | P2d machines: `Mach` per controller ent (recipe, inp/fuel/out bags, `tank` (boiler/pump/barrel) or `fl` fluid bag (recipe machines, P4b: recipe fluids = inputs, rest = outputs; elec machines keep gases), heat, prog, status `MS`), `stepMachines`, `genW` (generator W now, P4d), `machCmd` (mrec/mload/mfuel/mtake/munload/mdump (per fluid, gas/toxic → pollution)/mcell (pour/fill cells)/crank/mfill), multiblock `controllerAt`/`multiCheck` (miss [key, id], blocked, need hatches), `refund` on demolish; boilers incl. solar/large |
| src/sim/pipes.ts | pipes: `networks` (same-kind pipe ents joined on 6 sides → links {ctl, face, via, hatch?}; hatch multiblocks link only via hatches, cached per topology via `topoChanged`), `stepPipes`: fluid (pool → producers push → users pull → storage tops up / soaks leftovers → spread back; a network keeps its fluid once set; boiler dry + water > 400 K → `explode`; unset network takes a machine's largest output; corrosive fluid bursts non-`acid` pipes 1 %/s (P4b)), items every `ITEM_EVERY` ticks (sources → nearest sinks by pipe distance, `accepts`); face modes `Mach.faces` (FACE, SIDES order E W S N up down) |
| src/sim/quests.ts | P2e quest book (tier chapters + topic chapters `TOPICS` power/mining/chem/logistics/space, topic quests carry `tier`; `req` entries may be any-of lists): `checkQuests` (unlocked + tasks met → 1 done; 2 claimed), `taskProgress`, `questCmd` (qclaim, open crate); data in data/quests (QUESTS, action FLAGS) + data/loot (tables, `crate:<tier>`) |
| src/sim/power.ts | P4a electricity: `powerNets` (any cable joins any cable on 6 sides; elec/gen machines link on sides not Off; hatch multiblocks excluded), `stepPower` (roles: gens / users / battery buffers / transformer in-out sides; buffers fill pro rata, batteries charge on surplus + discharge on shortfall, loss = drop × distance to nearest gen, overcurrent burns weakest block — fuse first, overvoltage burns cable / explodes machine; breakers trip (`Ent.trip`) instead of burning), `findNets` (uncached, client overlay), `netLoad`, `powerInfo` per controller for the panel |
| src/sim/hazards.ts | P4e: `contaminate` (`s.haz` tile), `ignite` (fire spreads through flammable pipes/machines after explosions/burnouts), `clean` (quicklime, from demolish) |
| src/sim/pollution.ts | P3e: `stepPollution` (emit/spread/decay once per second), `pollKey`/`pollAt`/`smoggy`, HAZE/SMOG |
| src/render/overlays.ts | P3e: pollution quads + pipe boxes geometry (cables yellow) |
| src/sim/veins.ts | discovery: `pickSample` (hint), `know`, `prospect` (hammer) → `survey(r, depth)` (also thumper); mining ore → exposed |
| src/sim/build.ts | place/addBase/demolish, `edgeKey` (s/e edges stored as neighbour n/w), `nearSide` |
| src/sim/ | weather (`sunlight`), state (GameState v13: inv/tools, ents `x,y,b` (block level), base `x,y,f,p`, veins (id → KNOW 1 hint/2 exposed/3 surveyed), mach (ent key → Mach), quests, flags (tutorial actions), pipes (fluid per pipe block), poll (pollution per chunk), spawn, weather, diffs; TPS=20, DAY_TICKS=20 min, `timeOfDay`), step (systems go here), weather, loop (fixed step, max 5 catch-up), rng, worker, client, protocol |
| src/save/ | codec (gzip JSON envelope), migrations (bump STATE_VERSION + add fn), store (IDB: manual + 5 rolling auto) |
| src/game.ts | controller: boot/load latest, autosave 5 min + on hide, pause on hide, export/import |
| src/render/renderer.ts | `Renderer`: modes iso/map/globe, camera pan/zoom/rotate, Z-level, day/night, rain, input, hover text; view saved in localStorage `view:<seed>` |
| src/render/veins.ts | vein overlay (hint circles / outlines / fills), `knownVeins`, `veinsAtTile` |
| src/render/structures.ts | structures + base parts as one vertex-coloured mesh around the camera; ghost preview |
| src/render/chunks.ts | 32×32 chunk mesh for one layer slice + instanced trees; renderer builds only chunks overlapping the viewport ground quad (`rectInQuad`), frees off-screen ones after ~1.5 s |
| src/ui/ | Preact App (top bar incl. view buttons, menu, modebar left, Z-bar right, feed), Inventory (hotbar + bag), Recipes (browser + hand crafting), Machine (panel, live via `sim.watch`), Quests (book, L), Veins (journal), style.css, format |
| tests/ | vitest: content, sim, save, world |
| tools/mapdump.ts | `npm run map -- <seed> <out.png>`: planet PNG with spawn marker |
| .github/workflows/deploy.yml | test+build every push; Pages deploy on `main` |

## Conventions
- Item id `form:material` (e.g. `plate:copper`), ore chain `ore|crushed_ore|purified_ore|refined_ore|impure_mdust|mdust|small_mdust:<mineral>`; pure minerals (coal, salt, graphite) yield `dust:<product>`.
- Tools `tool:<type>:<material>`. Fluids: chemical id or `molten:<material>` (144 L/ingot).
- Hand recipes: machine `hand`, ticks 0, `tools` worn. Machine conflicts need `circuit`. Hand recipes are picked from a list (no grid), so they never conflict.
- Mineral refs: material id, chemical id, `m:<mineral>`, `later:<x>`.
- Storey f: 0 = ground, 1–8 up (view level > 0); a storey = `STOREY` = 3 blocks. Ents keyed by block level `x,y,b` (storey ⌊b/3⌋), base parts by storey `x,y,f,p`. Render Y = b (storey base = 3f).
- Water: `Surface.depth` = water layers (seabed at z = depth); ocean ≤8, trenches ≤22; no ore in water; under-water blocks unminable (offshore rigs later).
- World: x wraps (`gen.wrapX`), y = north→south rows, z = depth layer (0 surface … 25 bedrock). Render: X=x, Z=y, Y=−depth. Diff key `x,y,z` (trees `x,y,t`, picked samples `x,y,s`). Vein id `cx.cy.slot`.
- Vein grid: 1 spot per 64×64 cell (±8 jitter), slots soil/stone/deep/abyssal (`VEIN_SLOTS`), radius ≤ 22 → no overlap (~2.7k on Earth); ore per block = richness.
- Conduits (pipes + cables): `Ent.ch` channel, `Ent.cut` side bitmask (E W S N up down); joins via `conduitsJoin`/`sideOpen` (data/structures) in pipes, power and render; `conduit` cmd; panel ui/Conduit.
- Machines: `StructDef.machine` → `MachineDef.run` fuel|self|crank|boiler|steam|pump|elec|gen (`steam` L/tick if set)|store (chest: items in `out`)|tank (barrel)|thump|dig (P3c; sim-made world changes/veins go out as `simEvents` with `sim: true`); steam machines use `power × STEAM_PER_POWER` L/tick from `Mach.steam`; sim-made changes (explosions) go out via `simEvents` as `act` messages; recipe `minHeatK` (else machine `heatK`). Multiblock = `StructDef.multi {casing, pattern}`. Worker streams statuses in `stats.ms` and the watched machine as `{t:'mach'}`. `player.ts` ↔ `machines.ts` import each other: no top-level use of imports.
- Scripts: `npm run dev | test | validate | build | map`. Dev: `?seed=N` starts a fresh game on that seed when there's no save.

## Status
- **P0 done**. **P1 done** (planet gen, chunk render, camera, Z-slider, day/night, weather, map + globe).
- Validator warnings = content gaps to close in P2–P4 (alloys, bloomery iron, chemistry, primitive kiln items).
- X-ray ore view is a dev toggle; real reveal = samples/outcrops/digging/prospecting (P2f).
- TODO: offshore mining rig (tier + recipe) to reach seabed/trench ores.
- TODO: machine art pass — current P2d voxel models look poor; redo models (detail, per-state visuals e.g. fire/smoke when working).
- TODO: chunk loader design (keep chunks loaded off-screen for automation); sim will tick loaded chunks only.
- **P2 Primitive** in progress:
  - [x] P2a mining mode, inventory, tool slots/wear, pits render
  - [x] P2b crafting panel + recipe browser v1 (search, R/U, long-press/double-tap, bookmarks, history)
  - [x] P2c placeable structures (`struct:*`), Machine Build / Base Build / Demolition, storeys, foundations
  - [x] P2f vein discovery: ore samples, outcrops, true-block reveal, prospector's hammer, vein overlay (O) + journal (J)
  - [x] P2d primitive machines + multiblocks: fuel/heat, crank, self-burning; pit kiln, clay furnace, crucible hearth, lime kiln, quern, sluice, anvil; charcoal pile, bloomery, coke oven, PBF (ring/plus casings, ghost + auto-fill); machine panel; status icons
  - [x] P2e quest book v1 (Primitive chapter = full tutorial, action flags) + loot crates
- **P3 Steam** done:
  - [x] P3a steam core: bronze hull/piston/grinder head, water pump, bronze fluid pipes (single-fluid networks), small bronze boiler (heat → steam, dry-boiler explosion), steam furnace/macerator/forge hammer/ore washer/alloy smelter drawing steam from pipes; Steam quest chapter start
  - [x] P3b tin item pipes (nearest-sink routing), 6-face config (auto/in/out/off, fluid + item), chest (27 slots) / barrel (16 kL buffer) as machines, lead fluid pipes; quests s_items, s_barrel
  - [x] P3c steam compressor / extractor / pump (40 L/t), thumper (survey r48 to layer 16, once), excavator (ore only, 9×9 below, layers 1–16, H≤1, → out bag); steam ore ladder (crushed/purified → dust, impure wash, furnace smelts crushed/purified); rubber trees (jungle + some swamp) + treetap tapping, extractor + alloy vulcanising; quests s_ladder s_compressor s_rubber s_extractor s_pump s_thumper s_excavator
  - [x] P3d multiblock framework: patterns rotate with the controller (build ghost shows the footprint), several casing kinds per pattern (cell part), hatches (fluid in/out, item bus) replace outer casings, `need` hatches, pipes connect only through hatches; Large Boiler (120 L/t, fuel 8×), steel hull + high-pressure boiler (30 L/t, fuel 2×), solar boiler (daylight, `sunlight`); quests s_steel_hull s_hp_boiler s_solar s_large_boiler
  - [x] P3e pollution v1 (`s.poll` per 32×32 chunk, machine `smoke`/s, spread 3 %/decay 1 % per s, haze 300 / smog 1500 = −25 % speed), alerts (stuck ≥ 3 s + explosions, tap → fly + open), overlays menu (veins O, pipes H, pollution K); quest s_smoke
- **P4 LV** done (DESIGN §10 P4a–e):
  - [x] P4e gate: EBF multiblock (`ebf` pattern, heat-proof casing + cupronickel coils `solid`, `coilK`), hatches energy (`Node.hatch`, ≤ HATCH_W per hatch incl. loss, `Mach.eh`) / maintenance (`maint`, `Mach.mt` issues, `mfix`) / output bus (`item_out`); hazards v1 (sim/hazards, save v13 `haz`, decals); assembler circuit boards; quests l_assembly l_hazards l_ebf l_maint l_ebf_mv
  - [x] P4d generators + tools: combustion generator (`burns` J/L, fuel tank in/out via pipes + cells), selenium solar, wind (× height), water turbine (river/lake) — `genW` + `ambient`; electric drill / chainsaw / handheld scanner (`tool.elec`/`also`, `Slot.e`, battery swap in `wear`); scanner block (`survey` params on `thump`), mining rig (`dig` params); quests l_combustion l_solar l_wind l_water_turbine l_etools l_scanner l_scanner_block l_mining_rig
  - [x] P4c grid: lead-acid battery (`battery:lead_acid` / `charged_battery:`), battery buffer (`run: batt`, `mbat`), transformer (`run: xfmr`, front = 128 V, `Mach.up`, `mxf`), breaker (`Ent.trip`, conduit panel), power load overlay (T, `findNets` + `netLoad` in stats `pn`); quests l_battery l_battery_buffer l_breaker l_transformer
  - [x] P4b chemistry I: multi-fluid machines (`Mach.fl`, save v12), tin cells (`cell:<fluid>`, panel Pour/Fill, canner), mixer, electrolyzer, chemical reactor, chemical bath, roaster (sulfides → calcine + SO₂ → EF reduction), electric pump (`MachineDef.elec`), corrosion (lead pipes acid-proof), dump pollution; quests l_cells l_brine l_chloralkali l_hcl l_roast l_acid + l_<machine>
  - [x] P4a power core (W/J, tin/copper wire + cable, fuse, network solve, loss, overcurrent burn, overvoltage), steam turbine, lodestone magnet, LV parts, basic circuit (soldering iron), solder/cupronickel/nickel, LV hull, 12 LV machines + polarizer; LV quest chapter (l_*), LV crates
- **P5 MV** in progress (DESIGN §10 P5a–f):
  - [x] P5a aluminium: Bayer (reactor/mixer/roaster), red mud (centrifuge tank), HF + cryolite (dust items), graphite anode, Hall–Héroult Cell (`pot` pattern, carbon casing + cathode `solid`, `MachineDef.ehatch` = energy-hatch power), MV hull, MV crates; quests m_bayer m_cryolite m_hall m_hull + chem m_red_mud
  - [x] P5b MV electric: MV parts (assembler; magnetic steel rod), 19 MV machine variants (`MachineDef.base`, `MV_BASE`; 4 basic circuits until P5c), overclock (`overclock()`, `OC_SPEED`/`OC_POWER`, flag `overclock`), MV energy hatch (`StructDef.tier`, `hatchW`, `Mach.ehw/eht`), MV steam turbine + combustion gen, lithium (spodumene → Li₂SO₄ → electrolysis), lithium battery + MV battery buffer (`BATTERIES`, `battOf`); quests m_motor m_overclock m_ehatch + power m_turbine m_combustion m_battery + chem m_lithium
  - [x] P5c organic chem + discrete circuit: Pyrolyse Oven (`retort` pattern, methanol / coal tar), Coal Tar Distillery (MV only), recipe tier above machine tier (`MS.tier`), catalysts = `keep` + `wear` (silver → formaldehyde, V₂O₅ contact process on the MV reactor), phenolic resin/board, paper, EBF silicon, transistor/diode/capacitor → discrete circuit (MV machines + MV buffer now cost 2); quests m_pyrolyse m_distill m_phenolic m_silicon m_components m_discrete (→ m_overclock) + chem m_formaldehyde m_contact
  - [ ] P5d Kanthal/chromium · [ ] P5e environment · [ ] P5f planner/blueprints/stats
- TODO: ethanol source (fermentation); radiation hazard; battery buffer refunds batteries empty on demolish.
- New mechanic ⇒ add/extend the quest that teaches it (data/quests.ts); UI-only actions go in `UI_FLAGS`. Main-path machines/gates go in the tier chapter; generators, grid, mining, chemistry, logistics in their topic chapter. A tier's spine needs **any one** generator of that tier (any-of `req`), never all.

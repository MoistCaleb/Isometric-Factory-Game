# Design Document (locked decisions, Sections 1–10)

Deep, GT-style isometric voxel factory game. Real chemistry, painful early game, tier-gated progression.
Content details live in [CONTENT.md](CONTENT.md).

---

## 1. Core idea: depth from data
- Materials are data entries (color, tier, melting point, forms, byproducts, composition). Items + templated recipes are **generated** from them.
- Hand-written: machines, multiblocks, circuits, chemistry, quests, overrides.
- Target: **60 solid materials** (clustered in early tiers) + a separate list of chemicals/fluids. Later tiers added in updates.
- **Real chemistry** (real minerals/formulas/processes, simplified only where needed for play).
- **Early is painful by design**: hand recipes are wasteful (e.g. 2 ingots + hammer → 1 plate); machines make it efficient.
- Recipe conflicts resolved with **GT-style programmed circuit numbers**.

## 2. Tiers
| Tier | Voltage | Gate material | Gate circuit | Gate multiblock |
|---|---|---|---|---|
| Primitive | none (hand crank) | Bronze | — | Bloomery, Coke Oven, Primitive Blast Furnace |
| Steam | steam | Steel (PBF) | — | Large Boiler |
| LV | 32 V | Steel | Basic (vacuum tube) | EBF (built at LV, runs on 2× LV hatches) |
| MV | 128 V | Aluminium | Discrete (transistor) | Hall–Héroult Cell, Pyrolyse Oven |
| HV | 512 V | Stainless Steel | Integrated | Cleanroom, Distillation Tower |
| EHV | 2,048 V | Titanium | Microprocessor | Launch Pad, Nuclear |
| SV | 8,192 V | outline | outline | outline |
| PV | 32,768 V | outline | | |
| QV | 131,072 V | outline | | |
- Names: LV/MV/HV/EHV are real grid terms; SV/PV/QV are ours. No GTNH tier/material names.
- **Gating rule:** the multiblock that unlocks tier N+1 is built from tier N parts and reaches tier N+1 power by taking **2 energy hatches of tier N**.
- Pacing target: Primitive 1–2h, Steam 2–4h, LV 4–6h, MV ~8h, HV ~10h (~15–25h to finish EHV basics).
- Overvoltage = machine **explodes and is destroyed**. Fuses/breakers protect (see §6).
- Primitive tech feeds into later tech (primitive steel, coke, creosote, bricks stay relevant).

## 3. World
- **Finite planets.** Surface = rectangle that **wraps east–west**; north/south edges are **polar ice caps** (unbuildable).
- Home planet **Earth**: **4096 × 2048 tiles**; other bodies use real names and real relative radii (see CONTENT §11g), ~26 depth layers. Other bodies sized relative to it.
- Surface fields (continents, climate, rivers, lakes) are sampled from 3D noise on the sphere so the globe is undistorted; the flat map stretches east–west near the poles like a real equirectangular map. Rivers thin by cos(lat) and stop beyond ~76° lat. Underground detail uses flat tile-space noise.
- Saved as **seed + diffs** (only player changes stored).
- **Chunk loading:** only chunks in the viewport are loaded (meshed, and — once machines exist — simulated). Off-screen chunks unload after a short grace. A **chunk loader** (to be designed: item/machine, tier, area, cost) keeps chunks loaded off-screen so automation keeps running.
- Layers: Surface 0 · Soil 1–2 · Stone 3–8 · Deep 9–16 · Abyssal 17–24 · Bedrock 25.
- **Flat terrain** (no hills). Rivers, lakes, oceans. Biomes: plains, forest, swamp, desert, tundra, jungle, ocean.
- **Oceans/lakes are buildable with foundations** (placed on water tiles; machines then sit on them normally). Enables offshore pumps.
- **Water has depth** (water blocks fill layers 0…d−1, seabed silt at d): rivers 1–2, lakes 1–3, ocean 1–8 (shelf → open sea), **trenches** 9–22 (narrow ridges in deep ocean). Water can't be dug, nor can a block directly under water. Under open ocean/trenches the deep + abyssal vein slots fill more often and are larger/richer — reached only by **offshore mining rigs** (later tier; on foundations). Render: seabed drawn below a translucent surface, tint by depth.
- **Ores are buried.** Must **scan** (prospector's hammer → steam thumper → electric scanners → survey drones) and **excavate** (hand shovel/pick → steam excavator → electric rigs → large mining multiblock → deep core drill).
- **Discovery (P2f):** veins in the soil/stone slots (top ≤ 8) scatter **ore samples** on dry treeless land above them (denser when shallower); picking one up gives 1 ore + a **hint** (vein type, ~12-tile circle around a jittered centre). **Outcrop** veins (Copper Outcrop) show their core at layer 0. Mining any ore block **exposes** its vein (outline + depth). The **prospector's hammer** (bronze) **surveys** every vein reaching within 24 tiles down to layer 8 (outline, mix, size). Deeper/seabed veins need later scanners. Unseen blocks render as plain strata; a block shows its true contents once at the surface or next to/under a dug-out block (no free x-ray by sliding Z).
- **Vein journal + overlay:** known veins persist in the save; overlay (O) draws hints as dashed circles, exposed as outlines, surveyed as tinted fills (iso at the viewed layer, region map with dots); journal (J / ◎ Veins) lists them with search (vein or, when surveyed, mineral), status filter, distance sort, tap to fly there.
- Overburden (dirt/stone/gravel) is a resource.
- Veins: GT-style mixed deposits (3–4 minerals), depth band + biome bias + rarity, **finite**.
- **Vein grid** (GT-style, seeded): one vein spot per 64×64 cell (center ±8 tiles), with 4 depth slots — soil 1–2, stone 3–8, deep 9–16, abyssal 17–24 — each holding one weighted-random vein or empty. Veins never overlap; learning the spacing makes prospecting systematic.
- Ore **hardness** = tier index (Primitive 0 … EHV 5). A drill of tier T mines hardness ≤ T. A **hand pickaxe** reaches one tier higher (first samples of each tier's ores are always hand-mined). Hand mining also has a small chance of **rich ore / gem / lodestone** drops machines never give.
- **Day/night** (affects solar) and **weather** (wind strength, rain, acid rain from pollution).
- **Zoom:** surface → region map → **3D globe** → star system (pick planets, send ships).
- **Space** (EHV+): probes scan planets' veins/atmosphere; **auto-miner capsules** mine into their own storage, which the player must physically visit and ship home.

### Building
- **Surface-only machines**, but you can **build upward** (multiple floors; machines allowed on upper floors). World gen never generates above ground.
- **Z-level slider** shared between underground viewing (mining) and building floors.
- Decorative/base blocks are **free**: **edge walls**, floors, windows, doors, roofs, lights. Purely visual.
- Near-side walls always rendered **low**, except in Base Build mode. Roofs/walls go see-through when zoomed in and opaque when zoomed out.
- Modes: **View · Machine Build · Base Build · Demolition · Mining**.
  - **Machine Build:** pick a structure item, tap a tile at the viewed storey (Z-slider ≥ 0), rotate 4 ways. **A storey is 3 blocks tall**; a structure is 1 block, so tapping the same tile again stacks up to 3 per storey. Ground needs dry, treeless, unpitted land, or a **foundation** on water; a block above ground needs a floor (at a storey base), a block below it, or a block beside it (bridging). Demolition takes the top block first; a block holding one up can't be removed. Built-on tiles can't be mined.
  - **Base Build:** floor/foundation, roof and light per tile; wall/window/door on the **nearest tile edge**. Free, no inventory.
  - **Demolition:** structure first (refunded to inventory); else the edge under the pointer if near one, then roof → light → walls → floor.
  - Walls are drawn low when the tile behind them (away from the camera) is in use; roofs on the viewed storey are see-through when zoomed in.

## 4. Ore processing (see CONTENT.md §11e for chemistry)
- Smelt raw = 1× · crush route = 2× · full wash/centrifuge route ≈ 2.3× + 3 byproducts · chemical routes give specific byproducts.
- Each mineral lists 3 byproducts. **Every byproduct has a use.**
- **Closed loops** (Cl₂, Mg, acids). Outputs that back up stop machines.
- **Real melting points** decide smelting routes (clay furnace → bloomery → PBF → EBF coils).
- **Pollution:** per-chunk value, spreads + decays. Thresholds: haze → plants die → machine efficiency loss → acid rain damages unroofed machines and uninsulated cables. Fixed with **scrubber multiblocks**, gas capture, trees.
  - **v1 (P3e):** one value per 32×32 chunk; burning machines emit `smoke`/s (kilns 1, bloomery/lime kiln 2, PBF 4, charcoal pile 2, coke oven 3, boilers 2/4/16, solar 0); every second each chunk leaks 3 % to each of 4 neighbours (x wraps) and decays 1 %. **Haze ≥ 300** (sky/light tint, top-bar ☁ readout), **smog ≥ 1500** (recipe machines −25 % speed). Plants dying, acid rain, scrubbers, tree absorption later (P5).
- **Hazards:** fluids are tagged toxic / corrosive / flammable / radioactive. Wrong pipe material corrodes → **leaks** → pollution spike + **contaminated tiles** (must be cleaned before building). Flammable leaks near heat start fires. Radiation lowers nearby machine efficiency.

## 5. Machines
- Tier sets max voltage, slots, overclock headroom. **Tier is everything** (no upgrade cards).
- **6 faces** (incl. top/bottom); each set to input/output/energy/off; auto-output face.
- Programmed circuit slot for recipe selection.
- Overclock: per tier above recipe → **2× speed, 4× power** (some machines "perfect": 4×/4×).
- Status icons over machines (working, idle, no power, output full, missing input, too cold, incomplete).
- Machine **parts** per tier: motor, pump, piston, conveyor module, robot arm, (MV+) sensor/emitter, (HV+) field generator.
- **Multiblocks:** pattern of casings + hatches; controller shows ghost; player chooses **auto-fill or manual placing**.
- **Primitive machines (P2d):** tap a machine in View mode to open its panel: pick a recipe, load inputs/fuel from the global inventory, collect outputs. Run modes: **fuel** (burns items; heat eases toward the flame temperature, capped by the machine's max; a recipe runs only at ≥ its min heat), **self** (charcoal pile, coke oven burn their own charge), **crank** (quern, sluice, anvil advance only when the player cranks/strikes; anvil wears the hammer). Liquid byproducts fill the machine's tank (dump it until pipes/barrels arrive); gases vent. Sluice needs water on an adjacent tile. Until chunk loaders exist, every machine ticks.
- **Primitive multiblocks:** controller (bottom centre) + casing blocks on a 3D pattern, some with a hollow chamber that must stay empty. A 3-high multiblock fills one storey; taller ones reach into the next. They always render full height, whatever the view level. Missing casings show as ghosts while the panel is open; **Auto-fill** places them bottom-up from the inventory. Tapping a casing opens its controller. Patterns **rotate** with the controller (built behind its front; the build ghost shows the footprint) and may mix casing kinds. **Hatches** (fluid input, fluid output, item input bus) replace any outer casing; big multiblocks name the hatches they need and take pipes only through them (P3d). **Planned:** machine art pass.
- **Maintenance hatch** on multiblocks (random issues fixed with tools); **auto-maintenance hatch** later (consumes duct tape/lubricant).

## 6. Power
- **Real units:** V, A, W (= V×A), J. Display auto-scales (kJ, MJ, GJ).
- **Steam:** boilers heat up over time; **dry boiler + water = explosion**. No exhaust-vent mechanic.
  - Small boiler (P3a): burns fuel items; temperature eases toward the flame (capped 500 K); above 373 K it turns water into steam (1 L water → 160 L steam), output scaling with temperature up to its rate. Water tank empty while hot = **dry**; water arriving while dry and still > 400 K = **explosion** (boiler and its contents lost). Let it cool below 373 K to clear.
  - Steam machines draw steam from their own buffer (filled by pipes): 2 L/tick per recipe power unit; no steam = status "No steam".
  - Water pump (P3a): on a tile next to water, fills its tank 10 L/tick; pipes carry it away.
- **Fluid pipes (P3a):** pipe blocks join with neighbours on all 6 sides into a network that holds one fluid at a time (cap per pipe); once a fluid has entered, the network keeps that fluid even when empty (demolish a pipe to reset it). Each tick every attached machine pushes what it makes (boiler steam, pump water) and pulls what it uses (boiler water, steam, recipe fluids), limited by the pipe's rate.
- **Item pipes + faces (P3b):** tin item pipes join like fluid pipes (kinds never join each other). Every 10 ticks each source (machine outputs; chests only on Out sides) sends up to 4 items to the nearest sink by pipe distance (recipe inputs/keeps, fuel, chests). Each machine side (E W S N up down) is Auto (in + out; chests in only) / In / Out / Off, for item and fluid pipes alike. Wooden chest = 27-slot inventory; wooden barrel = 16000 L one-fluid buffer (no steam/molten): gives only when a user runs short, takes leftovers. Lead fluid pipes: 80 L/tick, acid-proof (matters once corrosion exists).
- **Electric:** per-network solve once per tick. Cables: material → max voltage, amps/thickness, loss per tile. Insulation halves loss and protects from acid rain. Superconductors later.
- Transformers (±1 tier), batteries, battery buffers, large storage multiblock.
- **Fuses** (burn out, cheap) and **breakers** (trip, resettable) placed after generators/batteries or before machines.
- Overamped cable burns. Overvoltage explodes machine.
- Primitive power: **hand crank** only.
- **Electric tools** (drill, chainsaw, scanner) use battery charge.
- Diverse generators that improve with tier: Solar (day only), Wind (stronger higher up), Water turbine (river/lake), Geothermal (must drill deep), Combustion/Gas (fuel), Steam turbines, Nuclear (EHV), Fusion (later).

## 7. Logistics
- **Pipes only** (no belts): item pipes (material → items/sec, route to nearest, restrictive variants), **single-fluid** pipes (material → throughput, max temp, hazard resistance).
- Robotic arms, filters, vertical pipes. Chests by tier, super chest (MV).
- Gas leaks into air from broken pipes. Fluid cells/capsules as items.
- **AE-like network at HV**: storage drives, channel-limited cables, buses, terminal, autocrafting patterns, **circuit swap card**, wireless access (also from global inventory).
- Mobile placing: drag-lay lines/L-shapes. **Blueprints** (copy/paste/save; pulls from inventory, later network).

## 8. UI & player systems
- **Overseer** (no avatar, no enemies). Global inventory **27 slots + 9 tool slots**. Inventory is global across planets.
- Click-gather in Mining mode; tools wear.
- **Recipe browser**: search with `#tag $material @machine t:tier -exclude`; recipes/uses; long-press = recipes, double-tap = uses (R/U on desktop); bookmarks; history.
- **Planner/ratio calculator** → can emit a blueprint sketch.
- **Quest book** (visual tree per tier chapter, **L**) with **loot crate** rewards; it **is the tutorial**: every mechanic (controls, mining, inventory, recipe book, building modes, machines, fuel/heat, crank, multiblocks, storeys, veins, saves) is explained by the quest that first needs it. Tasks: hold items, build structures, or do an action once (action flags, tracked in the save). Quests unlock when their prerequisites are done; completion is checked every second and after each command; rewards are claimed by hand.
- **Loot crates** per tier: open from the bag; 3 weighted rolls, 5% chance a roll uses the next tier's table; deterministic from the save RNG.
- HUD: top (power, pollution, time/weather, alerts) · bottom (mode bar, 9 tools, inventory) · right (Z-slider). Alerts fly camera to source (P3e: machine stuck ≥ 3 s in a bad status — no fuel/water/steam, output full (not boilers), dry, mined out — plus explosions; tap → fly + open panel). Overlays menu in the top bar (P3e: veins O, pipes H = every pipe near the camera on all storeys drawn through walls, fluid blue / item orange; pollution K = chunk tint yellow→red, iso + map). Overlays: pollution, power, pipes, veins, hazards. Statistics graphs.
- Controls: pinch/scroll zoom, drag/WASD pan, **4-way rotation**, long-press/right-click info.
- **Pause** + real-time only (no fast-forward). **No offline progress** (game stops when closed).
- Autosave with rolling **backups** + manual save in settings + export/import.

## 9. Tech
- TypeScript · Vite · **Three.js** (orthographic iso + perspective globe/space) · **Preact** HTML UI overlay · sim in **Web Worker** at 20 TPS · IndexedDB + compression · Vitest · GitHub Pages **PWA** · desktop + mobile, **landscape only** (no portrait layout; portrait touch shows a rotate prompt).
- Art: **voxel** models (e.g. 16³ per tile) defined in code with palettes, greedy-meshed; tier color stripe. Sound later.
- Rules: deterministic sim separate from render; sleeping idle machines; pooled networks; world = seed + diffs; chunk meshes + instancing, viewport-culled (loaded set = viewport ∪ chunk loaders); **content validator** (every item obtainable, every byproduct used, no unresolved conflicts, tier reachability); versioned saves with migrations.
- Layout: `src/{data,content,sim,world,render,ui,save}`, `tools/`.

## 10. Build phases
| Phase | Contents |
|---|---|
| P0 Foundation | Scaffold, PWA, worker tick loop, saves/backups, content pipeline + validator |
| P1 World | Planet gen (wrap, poles, biomes, layers, veins), chunk render, camera (pan/zoom/rotate), Z-slider, day/night, weather, zoom to globe |
| P2 Primitive | Mining mode, inventory/tools/wear, crafting station, primitive materials & multiblocks, base build, demolition, recipe browser v1, quest book v1, loot crates |
| P3 Steam | Boilers, fluid & item pipes, 6-face config, steam machines, ore ladder, multiblock framework, pollution v1, alerts, overlays |
| P4 LV | Electricity (all of §6), LV machines/parts/circuits, rubber, acids, roasting, LV generators, electric tools, scanners, maintenance, hazards |
| P5 MV | EBF coils/heat, Bayer + Hall–Héroult, chemistry, scrubbers, acid rain, geothermal, planner, blueprints, statistics |
| P6 HV | AE network, petrochem/plastics, cleanroom, large turbines, auto-maintenance, vacuum freezer |
| P7 EHV + Space | System view, probes, auto-miners, rockets, moon, nuclear |
| Later | SV+, more planets, fusion, sound |

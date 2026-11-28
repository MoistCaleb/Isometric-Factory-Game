# Content Spec (Section 11)

Tier codes: **P** Primitive · **S** Steam · **LV** · **MV** · **HV** · **EHV**. Temperatures in **K**.
Items marked `(?)` are open for review.

---

## 11a. Materials (60 solid materials)

### Form groups (generator flags)
| Flag | Forms generated |
|---|---|
| `B` basic metal | dust, small dust, nugget, ingot, plate, double plate, rod, bolt, screw, ring, molten fluid |
| `G` | gear, small gear |
| `W` | wire, fine wire, cable (insulated) |
| `F` | foil |
| `S` | spring |
| `R` | rotor |
| `X` | frame |
| `PF` | fluid pipe (small/normal/large) |
| `PI` | item pipe |
| `T` | tool heads (pick, shovel, axe, hammer, file, saw, knife, drill head) |
| `D` | dust only (+ small dust) |
| `C` | ceramic/other special forms (listed per row) |

### Melting / heat ladder
| Heat source | Max K | Tier |
|---|---|---|
| Pit kiln | 1100 | P |
| Clay furnace (+ crucible & molds) | 1400 | P |
| Bloomery (makes bloom, does not melt iron) | 1500 | P |
| Primitive Blast Furnace | 1900 | P |
| Steam furnace / Steam alloy smelter | 1400 | S |
| Electric furnace | 1750 | LV |
| EBF — Cupronickel coil | 2000 | LV |
| EBF — Kanthal coil | 2600 | MV |
| EBF — Nichrome coil | 3300 | HV |
| EBF — Tungsten Steel coil | 4200 | EHV |
- Dust → ingot for materials melting above 1750 K needs the EBF at heat ≥ melting point.
- Above 2200 K the EBF outputs a **hot ingot** → needs the Vacuum Freezer (HV).

### The 60
| # | Material | Formula | Melt K | Tier | Flags | Notes |
|---|---|---|---|---|---|---|
| 1 | Stone | — | — | P | D, C: cobble, gravel, brick | overburden |
| 2 | Clay | — | — | P | D, C: ball, unfired brick, molds | riverbanks |
| 3 | Fireclay | — | — | P | D, C: unfired/fired fire brick | clay + brick dust |
| 4 | Brick | — | — | P | D, C: brick, block | |
| 5 | Wood | — | — | P | C: log, plank, stick, pulp | |
| 6 | Charcoal | C | — | P | D, C: lump | charcoal pile |
| 7 | Coal | C (+S) | — | P | D, C: lump | burning emits SO₂ |
| 8 | Coke | C | — | P | D, C: lump | coke oven |
| 9 | Flint | SiO₂ | — | P | C: shard, T | surface pickup |
| 10 | Sand | SiO₂ | — | P | D | |
| 11 | Glass | — | ~1400 | P | D, C: pane, tube, lens | sand + ash flux |
| 12 | Ash | K₂CO₃ (mix) | — | P | D | from burning; glass flux, potash |
| 13 | Copper | Cu | 1358 | P | B G W F PF T | |
| 14 | Tin | Sn | 505 | P | B W F PI | |
| 15 | Bronze | Cu₃Sn | ~1200 | P | B G R X PF T | gate material |
| 16 | Iron | Fe | 1811 | P | B G S R X | bloomery / EBF |
| 17 | Wrought Iron | Fe | 1811 | P | B G X T | hammered bloom |
| 18 | Steel | Fe+C | 1700 | P | B G S R X PF T | PBF early, EBF later |
| 19 | Lead | Pb | 601 | P | B F PF | acid-proof pipes (real) |
| 20 | Gold | Au | 1337 | P | B W F | placer gold |
| 21 | Silver | Ag | 1235 | P | B W F | galena byproduct; formaldehyde catalyst |
| 22 | Zinc | Zn | 693 | P | B F | |
| 23 | Brass | Cu₃Zn | ~1200 | P | B G R X PF | steam alt |
| 24 | Sulfur | S | 388 | P | D | |
| 25 | Salt | NaCl | 1074 | P | D | evaporation / rock salt |
| 26 | Quicklime | CaO | — | P | D | calcined calcite; mortar, flux |
| 27 | Rubber | (C₅H₈)ₙ | — | P | C: raw, sheet, ring, plate | resin + sulfur |
| 28 | Nickel | Ni | 1728 | S | B W F | |
| 29 | Antimony | Sb | 904 | S | B | |
| 30 | Lead-Antimony | Pb₄Sb | ~600 | S | B | battery plates |
| 31 | Solder | Sn₆₃Pb₃₇ | 456 | S | B W | circuits |
| 32 | Cupronickel | CuNi | ~1500 | S | B W F | first coil |
| 33 | Silicon | Si | 1687 | LV | B, C: boule, wafer | metallurgical (LV) → pure (HV) |
| 34 | Graphite | C | — | LV | D, rod, C: electrode | electrodes, anodes |
| 35 | Magnesium | Mg | 923 | LV | B | Kroll reductant |
| 36 | Aluminium | Al | 933 | LV/MV | B G S R X PF PI W F | MV gate |
| 37 | Gallium | Ga | 303 | LV | B | Bayer & sphalerite byproduct |
| 38 | Cadmium | Cd | 594 | LV | B | toxic |
| 39 | Cobalt | Co | 1768 | LV | B | |
| 40 | Manganese | Mn | 1519 | LV | B | |
| 41 | Vanadium | V | 2183 | LV | B | contact-process catalyst, tool steel |
| 42 | Selenium | Se | 494 | LV | D, ingot | copper anode slime; first solar cell |
| 43 | Phosphorus | P | 317 | LV | D | doping, fertilizer |
| 44 | Calcium | Ca | 1115 | LV | D | |
| 45 | Potassium | K | 337 | LV | D | |
| 46 | Sodium | Na | 371 | LV | D | |
| 47 | Lithium | Li | 454 | MV | B | batteries |
| 48 | Vanadium Steel | Fe+V+C | ~1700 | LV | B G T | LV tool steel (historically real, pre-chromium) |
| 49 | Chromium | Cr | 2180 | MV | B | |
| 50 | Kanthal | FeCrAl | ~1800 | MV | B W | MV coil |
| 51 | Chrome-Vanadium Steel | Fe+Cr+V | ~1700 | MV | B G T | MV tool steel |
| 52 | Nichrome | Ni₄Cr | 1673 | HV | B W | HV coil |
| 53 | Stainless Steel | Fe₆CrMnNi | ~1700 | HV | B G S R X PF PI T | HV gate |
| 54 | Polyethylene | (C₂H₄)ₙ | — | HV | C: sheet, foil, plate | |
| 55 | Epoxy | — | — | HV | C: resin, sheet | FR-4 boards |
| 56 | Tungsten Carbide | WC | 3058 | HV | B T | sintered (no melting) |
| 57 | Titanium | Ti | 1941 | EHV | B G S R X PF PI W F T | EHV gate |
| 58 | Tungsten | W | 3695 | EHV | B W | |
| 59 | Tungsten Steel | Fe+W | ~3000 | EHV | B X PF | EHV coil/casing |
| 60 | Platinum | Pt | 2041 | EHV | B W F | catalysts |

| 61 | Arsenic | As | 887 (sublimes) | LV | D | toxic; waste from cobaltite/sperrylite, used for **GaAs** (HV high-efficiency solar, LEDs) |

Later (outlined): Uranium, Thorium, Diamond (synthetic), rare earths, superconductors.

### Chemicals & fluids (separate list, ~45)
- **Basic:** Water, Steam, Brine, Air, O₂, N₂, H₂, Cl₂, Ar (HV), CO₂, SO₂, SO₃.
- **Acids & bases:** H₂SO₄, HCl, HF, HNO₃ (HV), NaOH, NH₃ (HV).
- **Aluminium line:** Sodium aluminate, Al(OH)₃, Alumina (Al₂O₃), Cryolite (Na₃AlF₆), Red mud.
- **Wood & coal:** Creosote, Coal tar, Wood tar, Methanol, Acetic acid, Formaldehyde, Phenol, Benzene, Toluene, Phenolic resin.
- **Fuels:** Ethanol, Crude oil, Natural gas, Methane, Ethane, Ethylene, Propane, Naphtha, Kerosene, Diesel, Heavy fuel oil, Lubricant.
- **Polymers:** Styrene, Butadiene, Vinyl chloride, Epichlorohydrin, Bisphenol-A.
- **Titanium & silicon:** TiCl₄, MgCl₂, Trichlorosilane (SiHCl₃).
- **Other:** Mercury, Wastewater. Solid wastes: slag, stone dust.

---

## 11b. Minerals & veins

### Minerals (hardness H = tier index: P0 S1 LV2 MV3 HV4 EHV5)
| Mineral | Formula | H | Main product | Byproducts (wash / thermal / centrifuge) |
|---|---|---|---|---|
| Native Copper | Cu | 0 | Copper | Silver, Gold, Copper |
| Malachite | Cu₂CO₃(OH)₂ | 0 | Copper (+CO₂) | Copper, Calcite, Iron |
| Cassiterite | SnO₂ | 0 | Tin | Iron, Tin, Tungsten (teaser) |
| Limonite (bog iron) | FeO(OH) | 0 | Iron | Manganese, Phosphorus, Iron |
| Native Gold (placer) | Au | 0 | Gold | Silver, Copper, Gold |
| Coal | C | 0 | Coal | Sulfur, Ash, Coal |
| Calcite | CaCO₃ | 0 | Quicklime/Ca | Magnesium, Calcite, Iron |
| Dolomite | CaMg(CO₃)₂ | 0 | Magnesium/Ca | Calcite, Magnesium, Iron |
| Rock Salt | NaCl | 0 | Salt | Potassium (sylvite), Salt, Calcium |
| Sylvite | KCl | 0 | Potassium | Salt, Potassium, Magnesium |
| Magnetite | Fe₃O₄ | 1 | Iron | Vanadium, Gold, Iron · **lodestone** hand-drop |
| Hematite | Fe₂O₃ | 1 | Iron | Manganese, Silicon(sand), Iron |
| Pyrite | FeS₂ | 1 | Iron + Sulfur | Sulfur, Gold, Copper |
| Chalcopyrite | CuFeS₂ | 1 | Copper + Iron | Pyrite, Cobalt, Selenium (+Cadmium, Gold) |
| Galena | PbS | 1 | Lead | Silver, Sulfur, Antimony |
| Sphalerite | ZnS | 1 | Zinc | Gallium, Cadmium, Sulfur |
| Stibnite | Sb₂S₃ | 1 | Antimony | Sulfur, Lead, Antimony |
| Pyrolusite | MnO₂ | 1 | Manganese | Iron, Manganese, Cobalt |
| Quartz | SiO₂ | 1 | Silicon | Sand, Quartz, Gold |
| Fluorite | CaF₂ | 1 | Fluorine (HF) | Calcite, Fluorite, Lead |
| Bauxite | Al(OH)₃ + Fe/Ti | 1 | Aluminium (Bayer) | Gallium, Rutile, Iron (via red mud) |
| Cinnabar | HgS | 1 | Mercury | Sulfur, Mercury, Antimony |
| Apatite | Ca₅(PO₄)₃F | 1 | Phosphorus | Calcium, Fluorine, Phosphorus |
| Pentlandite | (Fe,Ni)₉S₈ | 2 | Nickel | Iron, Cobalt, Platinum (teaser) |
| Cobaltite | CoAsS | 2 | Cobalt | Arsenic waste (toxic), Nickel, Sulfur |
| Graphite | C | 2 | Graphite | Carbon, Quartz, Graphite |
| Chromite | FeCr₂O₄ | 3 | Chromium | Iron, Magnesium, Chromium |
| Ilmenite | FeTiO₃ | 3 | Titanium | Iron, Rutile, Manganese |
| Rutile | TiO₂ | 3 | Titanium | Iron, Titanium, Vanadium |
| Spodumene | LiAlSi₂O₆ | 3 | Lithium | Aluminium, Silicon, Lithium |
| Wolframite | (Fe,Mn)WO₄ | 4 | Tungsten | Iron, Manganese, Tin |
| Scheelite | CaWO₄ | 4 | Tungsten | Calcium, Tungsten, Molybdenum(later) |
| Sperrylite | PtAs₂ | 5 | Platinum | Arsenic waste, Nickel, Platinum |
| Uraninite | UO₂ | 5 | Uranium (later) | Lead, Radium(later), Thorium(later) |

Arsenic is a full material (#61): toxic dust, hazardous to store, but useful in **gallium arsenide** wafers at HV. Excess must be stabilized.

### Veins (25)
Depth: Soil 1–2 · Stone 3–8 · Deep 9–16 · Abyssal 17–24.
Rarity: C common · U uncommon · R rare · VR very rare.
Distance: rare veins are weighted away from spawn.

| # | Vein | Minerals (ratio) | Depth | Biome bias | Rarity |
|---|---|---|---|---|---|
| 1 | Bog Iron | Limonite 70, Pyrolusite 15, Clay 15 | 1–2 | swamp | C |
| 2 | Placer Gravel | Cassiterite 35, Magnetite 30, Native Gold 15, Quartz 20 | 1–2 | rivers | C |
| 3 | Copper Outcrop | Native Copper 40, Malachite 40, Chalcopyrite 20 | 3–6 | forest, plains | C |
| 4 | Tin Greisen | Cassiterite 60, Quartz 30, Wolframite 10 | 3–8 | tundra, plains | U |
| 5 | Coal Seam | Coal 80, Pyrite 20 | 3–8 | forest, swamp | C |
| 6 | Limestone | Calcite 70, Dolomite 30 | 3–6 | plains, ocean edge | C |
| 7 | Evaporite | Rock Salt 60, Sylvite 25, Calcite 15 | 1–4 | desert | C |
| 8 | Banded Iron | Hematite 50, Magnetite 35, Quartz 15 | 4–10 | any | C |
| 9 | Copper Sulfide | Chalcopyrite 50, Pyrite 30, Sphalerite 20 | 6–12 | any | U |
| 10 | Galena | Galena 50, Sphalerite 30, Stibnite 20 | 6–12 | desert, plains | U |
| 11 | Manganese | Pyrolusite 60, Hematite 40 | 4–10 | desert, jungle | U |
| 12 | Fluorite | Fluorite 50, Calcite 30, Galena 20 | 6–12 | plains, tundra | U |
| 13 | Cinnabar | Cinnabar 60, Stibnite 25, Pyrite 15 | 6–10 | volcanic patches in desert | R |
| 14 | Apatite | Apatite 70, Calcite 30 | 4–10 | jungle, forest | U |
| 15 | Bauxite Laterite | Bauxite 70, Limonite 20, Ilmenite 10 | 1–6 | jungle | U |
| 16 | Nickel Sulfide | Pentlandite 50, Chalcopyrite 30, Pyrite 20 | 9–14 | tundra | U |
| 17 | Graphite | Graphite 70, Quartz 30 | 8–14 | forest, tundra | U |
| 18 | Cobalt Arsenide | Cobaltite 50, Pentlandite 30, Native Copper 20 | 10–16 | tundra | R |
| 19 | Pegmatite | Quartz 40, Spodumene 35, Cassiterite 25 | 8–14 | desert, tundra | R |
| 20 | Chromite | Chromite 60, Magnetite 25, Pentlandite 15 | 10–16 | ocean edge, plains | U |
| 21 | Heavy Mineral | Ilmenite 50, Rutile 30, Magnetite 20 | 9–14 | ocean edge, desert | U |
| 22 | Tungsten Skarn | Scheelite 50, Wolframite 35, Calcite 15 | 12–18 | any | R |
| 23 | Deep Banded Iron | Magnetite 60, Hematite 40 | 9–16 | any | C (big) |
| 24 | Uranium | Uraninite 60, Galena 40 | 17–22 | any | VR |
| 25 | Platinum Reef | Sperrylite 40, Pentlandite 40, Chromite 20 | 18–24 | any | VR |

### Scale and other features
- **Vein sizes:** C 4–8k ore · U 3–6k · R 2–4k · VR 1–3k. About 2–4k veins planet-wide (tunable); placed on the vein grid (DESIGN §3).
- **Non-vein features:**
  - clay soil along rivers
  - surface flint and loose stone
  - sand in deserts and beaches
  - trees by biome (rubber trees in jungle and swamp)
  - brine pools and oil/gas wells (found by scanning)
  - geothermal hotspots (deep)

---

## 11c. Recipes by tier (Primitive → LV in detail)

### Tools (in the 9 tool slots; wear per use)
| Tool | Recipe | Use |
|---|---|---|
| Flint Knife | flint shard + stick | fiber from grass, cutting |
| Flint Pick / Shovel / Axe | flint shards + stick + plant fiber | H0 mining, dig soil, chop |
| Stone Hammer | stone + stick + fiber | crush ore (hand), early plates |
| Mortar | stone + flint | grind to dust (wasteful) |
| Treetap | planks + stick | sticky resin from rubber trees |
| Prospector's Hammer | bronze hammer head + bronze plate + stick (file) | survey veins within 24 tiles, to layer 8 (64 uses) |
| Bronze Pick / Hammer / Saw / File / Wrench / Knife / Shovel | bronze tool head + stick (heads cast in molds or filed) | Pick: **H1** |
| Steel tools (+ Screwdriver, Wire Cutter) | steel heads (PBF steel) | Pick: **H2** |
| Vanadium Steel tools | LV | Pick: **H3** |
| Chrome-Vanadium Steel tools | MV | Pick: **H4** |
| Tungsten Carbide tools | HV | Pick: **H5** |
| Electric Drill / Chainsaw / Scanner | LV+ (battery) | P4d: steel drill head / saw blade + LV motor + basic circuit + 2 steel plates + empty battery (screwdriver, wrench); scanner: 4 copper wire + glass lens + 2 circuits + 2 steel plates + battery. Drill = pick + shovel, chainsaw = axe, level 2, 2× speed, 200 J/use; scanner r32 / layer 16, 4 kJ. Flat → swaps a charged battery from the bag |

**Hand-pick reach rule:** a pick made of a tier-T material mines hardness ≤ T+1. Bronze (P) → H1 · Steel (S) → H2 · Vanadium Steel (LV) → H3 · Cr-V Steel (MV) → H4 · WC (HV) → H5.

### Crafting Station (P, placeable)
- Crafting panel (recipe browser): pick a hand recipe and craft ×1/×4/×16 from the global inventory (no grid; the player picks the recipe, so hand recipes never conflict). Recipes use tools from **your 9 tool slots**, and those tools wear down. Missing inputs/tools are highlighted in the recipe.
- Hand recipes:
  - log → 2 planks (4 with saw)
  - plank → 2 sticks (4 with saw)
  - 2 ingots + hammer → 1 plate
  - plate + file → rod
  - rod + saw → 2 bolts
  - plate + wire cutter → wire
  - etc.

### Primitive structures & machines
Placeable items are `struct:<id>` (table + voxel models + hand-craft costs in `src/data/structures.ts`).
| Thing | Build | Does |
|---|---|---|
| Pit Kiln | clay + sticks + straw (place on tile) | Fire bricks, molds, crucibles, pottery (≤1100 K) |
| Charcoal Pile (multiblock) | stacked logs covered in soil | Logs → charcoal + wood tar + ash. Pollution |
| Clay Furnace | bricks + clay | Smelt ≤1400 K with charcoal; crucible melting |
| Crucible + Molds | fired clay | Melt metal, **cast** into ingot / plate / tool-head molds. Alloy in crucible (3 Cu + 1 Sn → 4 Bronze) |
| Stone Anvil → Bronze Anvil | stone / bronze | Hammering (bloom → wrought iron, plates) |
| Quern (hand crank) | stone + wood | Crushed ore → dust (better than the mortar) |
| Sluice Box (hand crank) | planks + bronze plate | Wash crushed ore / placer gravel with water |
| Siphon Pump | planks + clay pipe | Pulls water from adjacent river or lake |
| Wooden Fluid Pipe, Barrel | planks | Cold water only, ≤350 K, low throughput |
| Bloomery (multiblock) | clay + bricks | Iron ore + charcoal → iron bloom + slag (≤1500 K) |
| Coke Oven (multiblock) | fire bricks | Coal → coke + creosote / coal tar |
| Primitive Blast Furnace (multiblock) | fire bricks + wrought iron | Wrought iron + coke (+ quicklime flux) → **steel** + slag (slow) |
| Lime Kiln | bricks | Calcite → quicklime + CO₂ |
| Evaporation Pan | clay | Brine → salt (slow, daylight only) |
| Rubber (primitive) | — | Sticky resin + sulfur in clay furnace → rubber sheet (vulcanization) |
| Glass | — | Sand + ash in clay furnace → glass |
| Chests | wood, then bronze | Storage |

**P2d implementation:**
- **Fuels** (flame K, burn s): straw 800/3 · stick 900/5 · plank 1000/15 · log 1000/60 · charcoal 1500/80 · coal 1600/80 · coke 2000/160. Machine max heat caps it.
- **Clay (hand):** clay ball → unfired brick; 5 balls → unfired crucible; 2 balls + knife → unfired ingot/plate/head mold; 2 balls + brick dust → 2 unfired fire bricks. **Pit kiln** fires them (≥900 K; fire brick ≥1050 K → needs charcoal).
- **Quern** (crank): brick → brick dust, cobble → gravel → sand, crushed ore → impure dust.
- **Charcoal Pile** (3×3×2 mound: controller + 17 Soil Covers, 2 dirt each): 8 logs → 4 charcoal + ash (50%) + 200 L wood tar, 120 s.
- **Coal:** coal ore + hammer → 2 coal lumps (hand). **Coke Oven** (3×3×3, hollow centre: controller + 25 Fire Brick Walls, 2 fire bricks each): coal → coke + 250 L creosote, 45 s.
- **Clay Furnace:** dust/ore → ingot at ≥ the metal's melting point (copper needs charcoal; tin works on wood); 2 sand + ash → glass pane (1300 K); 3 resin + small sulfur dust → rubber sheet.
- **Crucible Hearth** (clay crucible + 4 bricks, tank 1152 L): melt ingots, alloy 3 copper + 1 tin → 576 L molten bronze, cast with a kept mold (ingot, plate, any tool head ≤1400 K).
- **Bloomery** (plus-shaped base + 2-block chimney: controller + 6 Bloomery Walls): 2 iron ore (hematite/magnetite/limonite, raw or crushed) + 2 charcoal → iron bloom + slag, ≥1300 K, 60 s. **Stone Anvil** (strike ×10, hammer): bloom → wrought iron ingot (+50% slag).
- **Lime Kiln:** crushed/dust calcite → quicklime (CO₂ vents), ≥1100 K.
- **Primitive Blast Furnace** (3×3×4 open-top shaft, reaches storey 1: controller + 32 Fire Brick Walls, ≥1800 K → coke fuel): wrought iron + 2 coke → steel + slag (120 s), or + 1 coke + quicklime (60 s).

### Steam age
**Hulls:**
- **Bronze Hull** = 8 bronze plates + wrench + bricks
- **Steel Hull** = 8 steel plates + 4 fire bricks (hammer + wrench): high-pressure versions, faster, more steam

**Boilers:**

| Machine | Key parts | Notes |
|---|---|---|
| Small Bronze Boiler | bronze hull + 8 bricks + clay furnace | burns fuel items; 12 L/tick steam at 500 K |
| Solar Boiler | bronze hull + 4 glass + 2 silver plates | ≤6 L/tick by daylight (450 K), less in rain, none at night; no fuel |
| High-Pressure Steel Boiler | steel hull + 8 fire bricks + 2 bronze pipes | 600 K, 30 L/tick (2.5×), fuel 2× as fast |
| Large Boiler (multiblock) | controller: steel hull + 8 fire bricks + 4 bronze pipes; 3×3×3 behind it: 8 steel firebox casings (2 steel plates + 4 fire bricks), 16 bronze plated bricks (4 bronze plates + 4 bricks) around 2 bronze pipe casings; input + output hatch required, input bus optional | Steam gate multiblock: 800 K, 120 L/tick, fuel 8× as fast |

**Steam machines:**

| Machine | Key parts |
|---|---|
| Steam Macerator | hull + **steel grinder head** + piston |
| Steam Ore Washer | hull + bronze rotor + bronze pipe |
| Water Pump (P3a) | 4 bronze plates + 2 bronze pipes + bronze rotor + 4 planks (next to water, 10 L/tick) |
| Steam Furnace | hull + bricks + furnace |
| Steam Alloy Smelter | hull + bricks + crucible |
| Steam Compressor | hull + 2 pistons |
| Steam Forge Hammer | hull + piston + bronze anvil |
| Steam Extractor | hull + piston + glass |
| Steam Thumper (prospecting) | hull + 2 pistons + steel rod |
| Steam Excavator (mining) | hull + steel drill head + bronze gears |
| Steam Pump | hull + bronze pipes + rotor |

**Pipes and parts:**
- Bronze fluid pipes (steam, ≤ 1000 K), lead fluid pipes (acid-proof).
- Bronze Fluid Pipe block (P3a) = 1 small bronze pipe; 120 L/tick per link, 1000 L per block.
- Lead Fluid Pipe block (P3b) = 1 small lead pipe; 80 L/tick, 800 L per block. Tin Item Pipe block = 1 tin item pipe (3 tin plates + tin ring); 4 items per 10 ticks per source.
- Wooden Chest (8 planks): 27 slots. Wooden Barrel (7 planks): 16000 L, cold fluids only.
- **P3c:**
  - Steam Compressor (hull + 2 pistons): 2 plates → double plate, 2 rubber sheets → rubber plate, coal/charcoal/coke dust → lump.
  - Steam Extractor (hull + piston + glass): sticky resin → raw rubber; Steam Alloy Smelter: 2 raw rubber + small sulfur → 2 rubber sheets (3× the clay furnace).
  - Steam Pump (hull + 2 bronze pipes + bronze rotor): next to water, 40 L/tick for 4 L/tick steam.
  - Steam Thumper (hull + 2 pistons + steel rod): 16 L/tick steam for 20 s, then surveys veins within 48 tiles down to layer 16; once per placement.
  - Steam Excavator (hull + steel drill head + 2 bronze gears): 16 L/tick steam; mines only ore blocks (H ≤ 1, not under water) in the 9×9 below it, layer 1 → 16, 2 s per block × (1 + H); ore (× richness) into its output for item pipes; exposes veins.
  - Steam ore ladder: macerator crushed → impure dust (+bp1 10%), purified → dust (+bp2 20%); ore washer impure dust + 100 L water → dust; steam furnace smelts ore/crushed/purified (≤ 1400 K) → 1 ingot.
  - Rubber trees = jungle trees (+ 5% of swamp tiles). Treetap in tool slots: 3 taps → 1–2 resin, tree stays. Felling one: +50% resin. Sulfur: wash crushed coal / pyrite.
- **Mechanical parts:** piston = bronze plate + rod + small gear. Steel grinder head = 3 steel plates + steel ingot. Bronze/steel gears via file + hammer, or a forge hammer.

### LV
**Basics:**
- **LV Hull** = 8 steel plates + wrench + 2 tin cables.
- **Magnetization bootstrap:** iron rod + **lodestone** (a hand-mined magnetite drop, used like a tool with durability) → magnetic iron rod. The Polarizer replaces this.
- **Tin cable** = tin wire + rubber sheet.
- **Circuit board** (LV) = wood pulp + sticky resin pressed (Steam Compressor) → **resin board** + copper foil.

**Parts:**

| Part | Recipe |
|---|---|
| LV Motor | 2 tin cable + 4 fine copper wire + 2 iron rod + 1 magnetic iron rod |
| LV Pump | motor + steel rotor + 2 rubber rings + tin pipe + screw |
| LV Piston | motor + 2 steel rod + steel gear + 2 steel plate |
| LV Conveyor Module | 2 motors + 6 rubber plate + tin cable |
| LV Robot Arm | 2 motors + piston + circuit + 2 tin cable + 2 steel rod |

**Circuits:** see §11d.

**Machine template:** LV Hull + parts + 2 LV circuits + 2 tin cables + a machine-specific part.

| LV Machine | Specific parts |
|---|---|
| Macerator | piston, motor, steel grinder head |
| Ore Washer | motor, steel rotor, glass |
| Thermal Centrifuge | 2 motors, cupronickel coil wire |
| Centrifuge | 2 motors |
| Electrolyzer | 4 silver wire, glass |
| Chemical Reactor | motor, steel rotor, glass |
| Chemical Bath | 2 pumps, conveyor module, glass |
| Mixer | motor, steel rotor, glass |
| Bender | 2 pistons, 2 motors |
| Wiremill | 4 motors |
| Lathe | piston, motor, diamond `(?)`/WC tip → LV uses **steel cutter** |
| Cutter | motor, conveyor module, steel saw blade |
| Assembler | 2 robot arms, 2 conveyor modules |
| Fluid Extractor / Solidifier | pump, piston, glass |
| Electric Furnace / Arc Furnace | 4 copper cable / graphite electrodes |
| Polarizer | 2 tin cables, iron rods (coiled) |
| Roaster | clay furnace, pump, 4 fire bricks |
| Canner | pump, conveyor module |
| Electric Pump | pump, steel rotor (60 L/t water, 16 W) |
| Mining Rig | 2 motors, steel drill head, steel pipe (13×13, layers 1–24, H ≤ 2, 32 W) |
| Scanner (block) | 8 copper wire (coil), glass lens (lathe: glass pane) — 32 W, 30 s, surveys r64 at every depth, once |
| Battery Buffer | chest, 2 tin cables (4 battery slots) |
| Transformer | LV hull, 2 copper cable + 1 tin cable + 8 copper wire (coil); front = 128 V side |

**LV generators:**

| Generator | Fuel / source |
|---|---|
| Steam Turbine | steam (from boilers) |
| Combustion Generator | hull + motor + 2 pistons + steel pipe + 2 tin cables: 32 W; creosote 8 J/L, wood tar 6, ethanol 60, (later) diesel |
| Selenium Solar Panel | 2 selenium ingots (furnace: Se dust from chalcopyrite) + 2 glass panes + 2 steel plates + tin cable: 8 W × daylight |
| Wind Turbine | hull + motor + 2 steel rotors + 4 steel rods: 32 W × wind × height (0.3 ground → 1 at block 12) |
| Water Turbine | hull + motor + 2 steel rotors: 24 W beside a river (rain ↑), 35 % beside a lake |

**Fuses & breakers:**
- **Fuse:** tin wire in a glass tube. Burns out.
- **Breaker:** LV, 4 A: tin cable + basic circuit + steel plate. Trips open (reset or switch in its panel).

**Tin cell:** 2 tin plates + rubber ring (hammer) or bender; holds 1000 L of one fluid.

**Lead-acid battery (LV):** lead-antimony (4 Pb + 1 Sb, alloy smelter / mixer) → case (2 plates + 2 rubber sheets + tin cable) → canner + 1000 L sulfuric acid → battery (36 kJ).

**LV gate multiblock:** **EBF** (P4e)
- controller: LV hull + 2 electric furnaces + 3 basic circuits + 2 tin cables
- 17 **Heat-Proof Casings** (6 steel plates + steel frame; hammer, wrench) + 16 **Cupronickel Coils** (8 cupronickel wire + cupronickel foil; wire cutter) — 2000 K
- **Maintenance Hatch** (LV hull + 2 steel plates + 4 steel screws; screwdriver)
- **LV Energy Hatch** (LV hull + 2 tin cables): 2 A = 64 W each; 2 → 128 W = MV power
- I/O: bronze input bus / hatches, **Steel Output Bus** (4 steel plates + chest)
- Recipes: dust → ingot for 1750–2000 K metals (iron, cobalt, kanthal, titanium; 120 W = 2 hatches); iron dust + 1000 L O₂ → steel (1000 K, 60 W = 1 hatch)

**Assembler circuits (P4e):** circuit sets → 2 basic circuits; resin board + 2 copper foil → circuit board (16 W).

---

## 11d. Circuit chain

| Tier | Circuit | Board | Key components |
|---|---|---|---|
| LV | **Basic Circuit** | Resin board (wood pulp + resin) + copper foil | Vacuum tube (glass tube + fine copper wire + steel bolt), carbon resistor (coal dust + fine copper wire + resin), solder |
| MV | **Discrete Circuit** | **Phenolic board** (paper + phenolic resin; phenol from coal tar + formaldehyde from methanol on a silver catalyst) | Transistor (silicon + fine gold wire + plastic case `(?)` → MV case = phenolic), diode, capacitor (foil + paper/oil), resistor |
| HV | **Integrated Circuit** | **FR-4** (fiberglass + epoxy) | Wafers: pure Si boule → cut → engrave (laser engraver + lens) → chips. Needs **Cleanroom** multiblock |
| EHV | **Microprocessor** | Multilayer FR-4 | Doped wafers (phosphorus/boron), photolithography steps, SMD parts |
| SV+ | outline | | Later |

- Each tier's circuit is built from the previous tier's components plus the new tech.
- Once a tier's tech is unlocked, it brings **cheaper recipes for older circuits**. For example, an IC-based recipe for the Basic Circuit.
- The first Basic Circuits are **hand-crafted** at the crafting station (soldering iron tool). The Assembler makes them cheaper.

---

## 11e. Chemistry lines

1. **Wood & coal (P → MV)**
   - Charcoal pile: wood → charcoal + wood tar + ash.
   - Coke oven: coal → coke + coal tar.
   - **Pyrolyse Oven (MV):** wood → charcoal + **methanol** + **acetic acid** + wood tar.
   - **Coal tar distillation (MV):** → **phenol**, benzene, toluene, naphthalene, creosote.
2. **Ceramics & lime (P)**
   - clay → bricks
   - clay + brick dust → fireclay → fire bricks
   - calcite → quicklime + CO₂
   - quicklime + sand + water → mortar `(?)` used for casings
3. **Salt & chlor-alkali (P → LV)**
   - Brine → salt (pan).
   - **Electrolysis (LV):** brine → **NaOH + Cl₂ + H₂**.
   - H₂ + Cl₂ → **HCl**.
   - Water electrolysis → H₂ + O₂.
4. **Sulfuric acid (LV → MV)**
   - Roast sulfides (Roaster, LV): e.g. 2 ZnS + 3 O₂ → 2 ZnO + 2 SO₂. Vented SO₂ = pollution, captured SO₂ = feedstock.
   - **LV:** SO₂ + O₂ + H₂O → H₂SO₄ uncatalyzed (slow, low yield).
   - **MV contact process:** V₂O₅ catalyst (reusable, wears) → SO₃ → H₂SO₄, 4× faster.
5. **Aluminium (MV gate)**
   - **Bayer:** bauxite + NaOH (heat, pressure) → sodium aluminate + **red mud** → seed + cool → Al(OH)₃ → calcine → **Al₂O₃**. NaOH is recycled.
   - **Red mud** → iron, rutile and **gallium** recovery.
   - **Cryolite:** fluorite + H₂SO₄ → HF; HF + NaOH + Al(OH)₃ → Na₃AlF₆.
   - **Hall–Héroult Cell (multiblock, built at LV, takes many LV amps):** Al₂O₃ in molten cryolite + graphite anodes (consumed) + huge current → **Al + CO₂**.
6. **Silicon (LV → HV)**
   - SiO₂ + 2 C → Si + 2 CO in the EBF at ~2000 K → metallurgical silicon (LV/MV).
   - **HV:** Si + HCl → SiHCl₃ → distill → H₂ reduction → polysilicon → **Czochralski boule** (crystal puller) → wafers.
7. **Rubber**
   - **P:** resin + sulfur → rubber.
   - **LV:** extractor resin → raw rubber, then chemical reactor vulcanization (better yield).
   - **HV:** styrene + butadiene → **SBR**.
8. **Chromium (MV → HV)**
   - Chromite + Na₂CO₃ + O₂ roast → sodium chromate → (H₂SO₄) sodium dichromate → Cr₂O₃.
   - **Aluminothermic reduction:** Cr₂O₃ + 2 Al → 2 Cr + Al₂O₃. Uses aluminium, and the alumina is recycled.
   - Na₂CO₃ (soda ash) comes from the **Solvay process**: brine + NH₃ + CO₂. That needs HV ammonia. MV alternative: NaOH + CO₂.
9. **Nitrogen (HV)**
   - Air separation (Distillation Tower) → N₂, O₂, Ar.
   - **Haber:** N₂ + 3 H₂ → 2 NH₃ (iron catalyst).
   - **Ostwald:** NH₃ → HNO₃ (platinum catalyst, late).
10. **Petrochemicals (HV)**
    - Crude distillation → gas, naphtha, kerosene, diesel, heavy fuel.
    - Steam cracking → ethylene, propylene, butadiene.
    - Ethylene → **polyethylene**.
    - Benzene + ethylene → **styrene**.
    - Ethylene + Cl₂ → vinyl chloride → PVC `(?)` later.
    - Epoxy: phenol + acetone → bisphenol-A; + epichlorohydrin → **epoxy**.
11. **Titanium (EHV gate)**
    - **Chlorination:** TiO₂ + 2 Cl₂ + C → TiCl₄ + CO₂.
    - **Kroll:** TiCl₄ + 2 Mg → Ti sponge + 2 MgCl₂ (EBF).
    - MgCl₂ electrolysis → Mg + Cl₂, recycled. **Closed loop.**
12. **Tungsten (HV → EHV)**
    - Scheelite/wolframite + HCl → tungstic acid → APT → WO₃.
    - H₂ reduction → W powder.
    - W powder + C, sintered (HV) → **WC** (no melting needed).
    - Tungsten ingots need 3695 K, so a Tungsten Steel coil (EHV).

### Wastes, and where they go
| Waste | Use |
|---|---|
| Slag | Cement / casings, fertilizer (phosphate slag) |
| Stone dust | Sand → glass |
| Red mud | Fe / Ti / Ga recovery |
| CO₂ | Pollution unless captured; Solvay / Sabatier (HV: CO₂ + H₂ → CH₄) |
| SO₂ | → H₂SO₄ |
| Arsenic waste | Stabilize into storage blocks (toxic) |
| Wastewater | Treatment plant (MV) → water |

---

## 11f. Quest book outline (chapters → key milestones)
1. **Primitive** (implemented, `src/data/quests.ts`, 34 quests). Tutorial branch first: overseer (pan/zoom) → loot crates, camera (rotate, levels), maps, time/pause/saves; then hands (gather, pockets, recipe book), then:
   - gather flint/sticks/fiber
   - flint tools
   - crafting station
   - clay & pit kiln
   - charcoal pile
   - clay furnace
   - first copper & tin (placer + outcrop)
   - crucible bronze
   - bronze tools
   - prospector's hammer
   - bog iron → bloomery
   - wrought iron
   - fire bricks
   - coke oven
   - PBF steel
   - quern & sluice
   - glass
2. **Steam** (P3a implemented: hull → pump + pipes → boiler (explosion warning) → steam furnace / alloy smelter / forge hammer / macerator → ore washer):
   - first boiler (explosion warning quest)
   - bronze/lead pipes; P3b: item pipes + chest + sides (s_items), barrel + lead pipes (s_barrel)
   - each steam machine
   - ore washing & 2× processing
   - P3c: ore ladder (s_ladder), compressor, rubber (treetap + sulfur), extractor, steam pump
   - steam thumper (s_thumper)
   - steam excavator (s_excavator)
   - P3e: pollution, overlays, alerts (s_smoke, flags poll_overlay / pipe_overlay / alerts)
   - P3d: steel hull (s_steel_hull), high-pressure boiler (s_hp_boiler), solar boiler (s_solar), Large Boiler: rotation + hatches (s_large_boiler)
3. **LV:** (P4a done: l_magnet, l_motor, l_turbine, l_circuit, l_cables, l_fuse, one per LV machine; P4b done: l_cells, l_brine, l_chloralkali, l_hcl, l_roast, l_acid; P4c done: l_battery, l_battery_buffer, l_breaker, l_transformer; P4d done: l_combustion, l_solar, l_wind, l_water_turbine, l_etools, l_scanner, l_scanner_block, l_mining_rig; P4e done: l_assembly, l_hazards, l_ebf, l_maint, l_ebf_mv)
   - lodestone magnet
   - first motor
   - hand-made basic circuit
   - LV hull
   - steam turbine generator
   - cables & loss
   - fuses
   - first explosion (lesson)
   - each LV machine
   - salt electrolysis
   - roasting & sulfuric acid
   - lead-acid battery
   - electric tools
   - scanner
   - pollution & hazards
   - EBF + cupronickel coils
4. **MV:**
   - Bayer
   - cryolite
   - Hall–Héroult
   - aluminium hull
   - pyrolyse oven
   - coal tar distillation
   - phenolic board
   - transistors
   - discrete circuit
   - Kanthal coils
   - contact process
   - scrubber
   - geothermal
   - planner & blueprints
5. **HV:**
   - chromium (aluminothermic)
   - stainless steel
   - distillation tower & oil
   - plastics
   - cleanroom
   - wafers
   - integrated circuit
   - AE network
   - autocrafting
   - nichrome coils
   - vacuum freezer
   - large turbines
   - WC tools
6. **EHV:**
   - Kroll titanium
   - microprocessor
   - tungsten steel coil
   - nuclear
   - probes
   - launch pad
   - rocket
   - moon landing
   - auto-miner retrieval
7. **Space** (outline).

**Loot crates:** tiered (P / S / LV / MV / HV / EHV), with random useful items. Rare chance of a "lucky" item one tier up.

---

## 11g. Planets (starting system, real names; size = real radius relative to Earth)
| Body | Size | Map (tiles) | Unlock | Traits | Signature resources |
|---|---|---|---|---|---|
| **Earth** (home) | 1.0× | 4096×2048 | start | All biomes, oceans | Everything above |
| **Moon** | 0.27× | 1106×553 | EHV | No atmosphere (sealed machines), low gravity | Ilmenite regolith, anorthite (Al), **helium-3** |
| **Mars** | 0.53× | 2171×1085 | SV | Thin CO₂ atmosphere, cold, dust storms | Iron oxides, perchlorates, water ice, deuterium |
| **Mercury** | 0.38× | 1556×778 | SV | No atmosphere, extreme day/night heat | Sulfur, iron-rich core ores, tungsten |
| **Venus** | 0.95× | 3891×1946 | PV | Crushing pressure, ~740 K surface, H₂SO₄ clouds | Sulfuric acid (free), platinum group, tungsten |
| **Europa** | 0.25× | 1024×512 | PV | Ice shell, subsurface ocean, radiation | Deuterium/tritium sources, water, salts |
| **Titan** | 0.40× | 1638×819 | PV | Dense N₂ atmosphere, methane lakes | Methane/ethane lakes (free hydrocarbons), N₂ |
| **Jupiter** | — (no surface) | orbital | PV | Orbital harvesting only | H₂, He, He-3 |
| **Asteroid Belt** | many tiny | small fixed maps | QV | Mining stations | Platinum group, exotic late materials |

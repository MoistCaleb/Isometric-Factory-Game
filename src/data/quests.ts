// Quest book (DESIGN §8, CONTENT §11f). Hand-written; doubles as the tutorial: every mechanic is explained by the quest
// that first needs it. Quests unlock when all `req` are done.
// Tasks: `have` = hold n (summed over ids, inventory + tool slots) · `build` = n placed structures · `flag` = an action
// done at least once (FLAGS; set by the sim for commands, by the UI for camera/panels).
import { MINERALS } from './minerals';
import type { TierId } from './tiers';

/** Action flags. Sim-set: mine chop sample craft move place stack upper base demolish prospect mload mfuel mtake crank mfill
 * mdump open claim mface cput tap thump lboiler powered cell corrode + chemistry outputs (brine chlorine hydrochloric_acid
 * sulfur_dioxide sulfuric_acid). UI-set (`UI_FLAGS`, via the `flag` command): the rest. */
export const UI_FLAGS = ['pan', 'zoom', 'rotate', 'level_down', 'level_up', 'map', 'globe', 'pause', 'bag', 'search', 'uses',
  'bookmark', 'journal', 'overlay', 'machine', 'pipe_overlay', 'poll_overlay', 'alerts', 'power_overlay', 'planner', 'stats'] as const;

export const SIM_FLAGS = ['mine', 'chop', 'sample', 'craft', 'move', 'place', 'stack', 'upper', 'base', 'demolish', 'prospect', 'mload',
  'mfuel', 'mtake', 'crank', 'mfill', 'mdump', 'open', 'qclaim', 'mface', 'cput', 'tap', 'thump', 'lboiler', 'powered',
  'cell', 'corrode', 'brine', 'chlorine', 'hydrochloric_acid', 'sulfur_dioxide', 'sulfuric_acid',
  'discharge', 'xfmr', 'xfmr_up', 'overvolt', 'trip', 'breaker', 'battery',
  'combustion_generator', 'solar_panel', 'wind_turbine', 'water_turbine', 'etool', 'escan', 'scan', 'rig',
  'acirc', 'ebf', 'ebf_mv', 'maint', 'clean', 'fire', 'sodium_aluminate', 'hydrofluoric_acid', 'aluminium',
  'overclock', 'steam_turbine_mv', 'combustion_generator_mv',
  'methanol', 'coal_tar', 'phenol', 'formaldehyde', 'phenolic_resin', 'sulfur_trioxide', 'ebf_hot',
  'roof', 'acid_rain', 'scrub', 'treat', 'hotspot', 'geothermal_generator', 'bp_copy', 'bp_paste', 'bp_sketch',
  'sapling', 'tree_farm', 'forage', 'plant_crop', 'cross', 'compost', 'harvest', 'harvester', 'crop_manager'] as const;

export type QuestTask =
  | { k: 'have'; ids: string[]; n: number; label?: string }
  | { k: 'build'; id: string; n: number }
  | { k: 'flag'; id: string; label: string };
/** Topic chapters (GT-style side books) next to the tier chapters: a topic quest still has a tier (layout, rewards). */
export const TOPICS = [['power', '⚡ Power'], ['mining', '⛏ Mining'], ['chem', '⚗ Chemistry'], ['logistics', '🔧 Logistics'], ['farm', '🌱 Farming'], ['space', '🚀 Space Race']] as const;
export type TopicId = (typeof TOPICS)[number][0];
export type ChapterId = TierId | TopicId;
export interface QuestDef {
  id: string; chapter: ChapterId; title: string;
  /** Tier of a topic-chapter quest (tier chapters: the chapter itself). */
  tier?: TierId;
  /** Paragraphs; **bold** marks controls and key terms. */
  text: string[];
  /** All must be done; an inner list needs any one of its quests (e.g. any generator of a tier, DESIGN §8). */
  req: (string | string[])[];
  tasks: QuestTask[];
  /** Loot crates by tier + direct items. */
  reward: { crates?: [TierId, number][]; items?: [string, number][] };
}

const have = (id: string, n = 1): QuestTask => ({ k: 'have', ids: [id], n });
const any = (ids: string[], n: number, label: string): QuestTask => ({ k: 'have', ids, n, label });
const build = (id: string, n = 1): QuestTask => ({ k: 'build', id, n });
const flag = (id: string, label: string): QuestTask => ({ k: 'flag', id, label });
const P1: QuestDef['reward'] = { crates: [['P', 1]] }, P2: QuestDef['reward'] = { crates: [['P', 2]] };
const S1: QuestDef['reward'] = { crates: [['S', 1]] }, S2: QuestDef['reward'] = { crates: [['S', 2]] };
const L1: QuestDef['reward'] = { crates: [['LV', 1]] }, L2: QuestDef['reward'] = { crates: [['LV', 2]] };
const M1: QuestDef['reward'] = { crates: [['MV', 1]] }, M2: QuestDef['reward'] = { crates: [['MV', 2]] };
const ores = (form: string) => MINERALS.map((m) => `${form}:${m.id}`);

export const QUESTS: QuestDef[] = [
  // ---- Getting started ----
  { id: 'welcome', chapter: 'P', title: 'Overseer', req: [], reward: P1,
    text: [
      'You are the **overseer**: no body, no enemies — just a planet and your hands. Start with sticks and stones; finish among the stars.',
      '**Pan** by dragging (or **WASD** / arrow keys). **Zoom** with the mouse wheel, a pinch, or **+ / −**.',
      'This book is your guide. Each quest explains what it needs the first time you need it. Finished quests glow — tap them and **Claim** the reward.',
    ],
    tasks: [flag('pan', 'Pan the camera'), flag('zoom', 'Zoom in or out')] },
  { id: 'crates', chapter: 'P', title: 'Loot Crates', req: ['welcome'], reward: { items: [['log:wood', 8]] },
    text: [
      'Quest rewards come as **loot crates**. Open your bag (🎒, **I** or **Tab**), tap a crate, then **🎁 Open**. Each holds three random useful stacks for its tier — and rarely a lucky item from the next tier.',
      'Crates need a few free slots to open.',
    ],
    tasks: [flag('open', 'Open a loot crate')] },
  { id: 'camera', chapter: 'P', title: 'Turn the World', req: ['welcome'], reward: P1,
    text: [
      '**Rotate** the view in 90° steps with **Q / E** or the ⟲ ⟳ buttons.',
      'The slider on the right is the **level bar**. Down (▼, **[** or **PgDn**) slices into the ground layer by layer — layer 0 is the surface, bedrock is layer 25. Up (▲, **]** or **PgUp**) shows your building storeys. ⌂ returns to the surface.',
      'On desktop, hovering a tile names what is there.',
    ],
    tasks: [flag('rotate', 'Rotate the view'), flag('level_down', 'Look below ground'), flag('level_up', 'Look at an upper storey')] },
  { id: 'maps', chapter: 'P', title: 'The Big Picture', req: ['camera'], reward: P1,
    text: [
      '**Map** (**M**) shows the whole planet flat; **Globe** (**G**) shows it as a sphere. Tap anywhere to fly there.',
      'Planets are finite: walk east long enough and you are back where you started. The poles are ice and cannot be built on. Deep ocean hides ores you cannot reach yet.',
    ],
    tasks: [flag('map', 'Open the map'), flag('globe', 'Open the globe')] },
  { id: 'time', chapter: 'P', title: 'Day, Night and Weather', req: ['camera'], reward: P1,
    text: [
      'A day lasts 20 minutes; nights are dark. Weather shifts between calm, wind and rain (top bar).',
      '**Pause** with **Space** or ❚❚. There is no fast-forward and nothing runs while the game is closed.',
      'The game **autosaves** every 5 minutes and when you leave, keeping rolling backups. The ☰ menu saves manually and exports/imports save files.',
    ],
    tasks: [flag('pause', 'Pause the game')] },

  // ---- Hands and tools ----
  { id: 'gather', chapter: 'P', title: 'Sticks and Stones', req: ['welcome'], reward: P1,
    text: [
      'Switch to **Mining** (⛏ on the left, or **X**) and tap the ground. Each tap is one hit; tougher blocks take several (the counter shows progress).',
      'By hand you dig soil slowly. **Grass** drops dirt and sometimes **plant fiber** or **straw**. **Gravel** is the best place to find **flint shards**; dirt, silt and sand give them rarely.',
      'Tapping a tree with bare hands snaps off **sticks** (and fiber) — felling it needs an axe.',
    ],
    tasks: [flag('mine', 'Dig a block'), have('shard:flint', 3), have('stick:wood', 4), have('fiber', 4)] },
  { id: 'inventory', chapter: 'P', title: 'Pockets', req: ['gather'], reward: P1,
    text: [
      'Your inventory is **global**: 27 bag slots plus 9 **tool slots** (the bar at the bottom). Stacks hold 64.',
      'Open the bag with 🎒, **I** or **Tab**. Tap an item to pick it up, tap another slot to move, swap or merge. Tool slots hold tools only. 🗑 destroys the picked stack.',
    ],
    tasks: [flag('bag', 'Open the bag'), flag('move', 'Move an item')] },
  { id: 'recipes', chapter: 'P', title: 'The Recipe Book', req: ['gather'], reward: P1,
    text: [
      'Open it with 📖 or **C**. Search by name, or filter: **#form** (#plate), **$material** ($copper), **@machine** (@pit_kiln), **t:tier**, **-word** to exclude.',
      'Tap an item to see how it is **made**; double-tap for what it is **used in**. Anywhere in the game: **long-press** an item for recipes, **double-tap** for uses — or hover it and press **R / U** on desktop.',
      '★ bookmarks an item; recent lookups are kept as history. Hand recipes have **Craft** buttons — tools listed on a recipe are worn, not used up.',
    ],
    tasks: [flag('search', 'Search for something'), flag('uses', 'Look up what an item is used in'), flag('craft', 'Craft anything by hand')] },
  { id: 'flint_tools', chapter: 'P', title: 'Knapping', req: ['recipes', 'inventory'], reward: P2,
    text: [
      'Knap 3 flint shards into a pickaxe or axe head (1 for a knife), then bind it to a stick with fiber.',
      'Tools land in the tool slots and **wear** with use (the bar under the slot); at zero they break. The best tool of the right kind is used automatically, and better tools work faster.',
      '**Shovels** speed up soil, **pickaxes** break stone, **axes** fell trees, **knives** cut clay shapes.',
    ],
    tasks: [any(['tool:pickaxe:flint', 'tool:axe:flint', 'tool:shovel:flint', 'tool:knife:flint'], 3, 'Any 3 flint tools')] },
  { id: 'stone', chapter: 'P', title: 'Into the Rock', req: ['flint_tools'], reward: P1,
    text: [
      'With a pickaxe, stone breaks into **cobblestone**. You can only dig a block that is open from **above or beside** — dig down, then outward.',
      'Use the level bar to look into your pit. Rock gets harder with depth: a pick mines **hardness up to its level + 1** (flint is level 0). Water-covered ground cannot be dug.',
    ],
    tasks: [have('cobble:stone', 12)] },
  { id: 'timber', chapter: 'P', title: 'Timber', req: ['flint_tools'], reward: P1,
    text: [
      'An axe fells a whole tree for **logs** and some sticks. Turn logs into **planks** by hand (a saw doubles the yield later).',
      'Wood is also your first fuel.',
    ],
    tasks: [flag('chop', 'Fell a tree'), have('log:wood', 8), have('plank:wood', 8)] },
  { id: 'hammer', chapter: 'P', title: 'Stone Hammer', req: ['stone'], reward: P1,
    text: [
      'Cobblestone + stick + fiber makes a **stone hammer**. It crushes ore by hand (ore → crushed ore), flattens ingots into plates, and is needed to build querns and anvils.',
    ],
    tasks: [have('tool:hammer:stone')] },
  { id: 'clay', chapter: 'P', title: 'Mud Between the Toes', req: ['gather'], reward: P1,
    text: [
      '**Clay** sits beside rivers, lakes and coasts. Each clay block gives 2 balls. A shovel makes it quick.',
      'Every primitive machine starts as shaped clay.',
    ],
    tasks: [have('ball:clay', 16)] },
  { id: 'samples', chapter: 'P', title: 'Shiny Rocks', req: ['gather'], reward: P1,
    text: [
      'Coloured pebbles on the ground are **ore samples**. Tap one in Mining to pick it up — it means a **vein** lies nearby underground. Bare rock showing ore colour is an **outcrop**.',
      'The **vein overlay** (◎ **O**) draws what you know on the world: a circle for a hint, an outline once you have mined into it. The **vein journal** (◎ Veins, **J**) lists them and flies you there.',
    ],
    tasks: [flag('sample', 'Pick up an ore sample'), flag('overlay', 'Toggle the vein overlay'), flag('journal', 'Open the vein journal')] },

  // ---- Building ----
  { id: 'pit_kiln', chapter: 'P', title: 'Placing Things', req: ['clay', 'timber'], reward: P1,
    text: [
      'Machines are crafted as items first, then placed. Craft a **Pit Kiln**, switch to **Machine Build** (🏭, **B**), pick it on the bar and tap a tile. **F** rotates. The white ghost shows where it goes.',
      'Ground must be dry and clear — fell trees first. On water, lay a **foundation** (Base Build) before building.',
    ],
    tasks: [build('pit_kiln')] },
  { id: 'fire', chapter: 'P', title: 'Fire!', req: ['pit_kiln'], reward: P2,
    text: [
      'In **View** mode (👁, **V**) tap a machine to open its panel. **Pick a recipe**, **Load** inputs from your inventory, and add **fuel**.',
      'Fuel sets the flame: straw 800 K · sticks 900 K · planks and logs 1000 K · charcoal 1500 K · coal 1600 K · coke 2000 K. A machine heats up to the lesser of its fuel and its own limit, and only burns fuel while it has work. The marker on the heat bar is what the recipe needs.',
      'The light above a machine: **green** working, **yellow** waiting (input, fuel, heat), **red** a problem, **blue** needs your hand. **Collect** the output when done.',
      'Shape clay into unfired bricks and fire them.',
    ],
    tasks: [flag('machine', 'Open a machine'), flag('mfuel', 'Add fuel'), flag('mtake', 'Collect output'), have('brick:brick', 12)] },
  { id: 'base_build', chapter: 'P', title: 'A Roof Overhead', req: ['pit_kiln'], reward: P1,
    text: [
      '**Base Build** (🧱, **N**) is free and cosmetic: floors and foundations, walls, windows and doors, roofs and lights. Walls snap to the tile edge nearest your tap.',
      'Walls on the side facing you drop low so you can see inside; zoomed in, the roof of the level you view turns see-through.',
    ],
    tasks: [flag('base', 'Place a base part')] },
  { id: 'demolish', chapter: 'P', title: 'Second Thoughts', req: ['pit_kiln'], reward: P1,
    text: [
      '**Demolition** (💥, **Z**) removes the top structure on a tile and refunds it — with anything still inside a machine. With no structure it removes base parts; tap near an edge to target a wall.',
      'You cannot remove a block that holds something up.',
    ],
    tasks: [flag('demolish', 'Demolish something')] },
  { id: 'storeys', chapter: 'P', title: 'Going Up', req: ['base_build'], reward: P1,
    text: [
      'A **storey** is 3 blocks tall. Small machines are one block; tap the same tile again to **stack** another on top (up to 3 per storey).',
      'To build on an upper storey, raise the level bar first. A block up high needs support: a **floor** at that storey, a block **below** it, or a block **beside** it at the same height (bridging).',
    ],
    tasks: [flag('stack', 'Stack a block on another'), flag('upper', 'Build on an upper storey')] },

  // ---- Fire and metal ----
  { id: 'charcoal', chapter: 'P', title: 'Smoulder', req: ['fire'], reward: P2,
    text: [
      'The **Charcoal Pile** is a **multiblock**: a controller plus casing blocks in a set shape — here a 3×3 mound, 2 high, of **soil covers**. Open the controller: missing casings show as ghosts, and **Auto-fill** places them from your inventory, bottom up.',
      'Multiblocks always show at full height and can be tapped on any visible part. If the shape breaks, the machine stops.',
      'It burns its own load: 8 logs → 4 charcoal, sometimes ash, plus **wood tar** in its tank. Tanks fill up and stall the machine — **Dump** pours them out for now.',
    ],
    tasks: [build('charcoal_pit'), flag('mfill', 'Auto-fill a multiblock'), have('lump:charcoal', 16)] },
  { id: 'clay_furnace', chapter: 'P', title: 'Hotter', req: ['fire'], reward: P1,
    text: [
      'The **Clay Furnace** reaches 1400 K. Copper melts at 1358 K — wood (1000 K) cannot get there; charcoal can. Tin melts at just 505 K.',
      'A yellow **too cold** status means: better fuel.',
    ],
    tasks: [build('clay_furnace')] },
  { id: 'ore', chapter: 'P', title: 'Red and White Metal', req: ['clay_furnace', 'charcoal', 'samples', 'hammer'], reward: P2,
    text: [
      'Copper: **native copper** and green **malachite**. Tin: dark **cassiterite**. Follow samples to their veins and dig in.',
      'Ore smelts straight into ingots in the clay furnace if the metal melts low enough. Crushing ore with the hammer first and washing it later gives purer material.',
    ],
    tasks: [have('ingot:copper', 6), have('ingot:tin', 2)] },
  { id: 'molds', chapter: 'P', title: 'Molds', req: ['fire', 'flint_tools'], reward: P1,
    text: [
      'Cut clay into **molds** with a knife: ingot, plate and tool-head molds. Fire them in the pit kiln. Shape 5 clay into an unfired **crucible** too.',
      'Molds are kept when you cast — one mold lasts forever.',
    ],
    tasks: [have('mold_ingot:clay'), have('crucible:clay')] },
  { id: 'bronze', chapter: 'P', title: 'The Bronze Age', req: ['ore', 'molds'], reward: P2,
    text: [
      'The **Crucible Hearth** melts metal into its tank. Load 3 copper + 1 tin to alloy 576 L of molten **bronze** (144 L = one ingot).',
      'Then pick a casting recipe: with an ingot mold loaded, the tank pours into ingots. Plate and head molds cast plates and tool heads directly.',
    ],
    tasks: [build('crucible'), have('ingot:bronze', 4)] },
  { id: 'bronze_tools', chapter: 'P', title: 'Sharper', req: ['bronze'], reward: P1,
    text: [
      'Bronze tools are level 1: faster and longer-lasting, and a bronze pick reaches deeper rock. Hammer ingots into **plates**; plates + hammer + file make heads — or cast heads in the crucible.',
    ],
    tasks: [any(['tool:pickaxe:bronze', 'tool:axe:bronze', 'tool:shovel:bronze', 'tool:hammer:bronze', 'tool:file:bronze'], 2, 'Any 2 bronze tools')] },
  { id: 'prospector', chapter: 'P', title: 'Listening to Rock', req: ['bronze_tools'], reward: P1,
    text: [
      'The **prospector\'s hammer** surveys every vein within 24 tiles, down to layer 8. In Mining, switch to 🔍 (**P**) and tap. Surveyed veins are filled in on the overlay with their full extent.',
    ],
    tasks: [have('tool:prospector:bronze'), flag('prospect', 'Prospect')] },
  { id: 'quern_sluice', chapter: 'P', title: 'Grind and Wash', req: ['bronze', 'hammer'], reward: P1,
    text: [
      'Some machines run on muscle. The **Quern** grinds (gravel → sand, brick → brick dust); the **Sluice Box** washes crushed ore into purified ore and must sit **next to water**.',
      'Load them and press **⟳ Crank** — each press is one second of work.',
    ],
    tasks: [build('quern'), build('sluice'), flag('crank', 'Crank a machine')] },
  { id: 'lime', chapter: 'P', title: 'Quicklime', req: ['clay_furnace', 'hammer'], reward: P1,
    text: [
      'Crushed **calcite** burns into **quicklime** in a **Lime Kiln** (needs 1100 K — charcoal). Carbon dioxide vents to the air.',
      'Quicklime is a flux: it makes steel faster later.',
    ],
    tasks: [build('lime_kiln'), have('dust:quicklime', 4)] },
  { id: 'glass', chapter: 'P', title: 'Clear as Sand', req: ['clay_furnace', 'charcoal'], reward: P1,
    text: [
      'Sand and wood ash melt into **glass** at 1300 K in the clay furnace. Ash comes from the charcoal pile.',
    ],
    tasks: [have('pane:glass', 4)] },
  { id: 'bloomery', chapter: 'P', title: 'Bog Iron', req: ['bronze'], reward: P2,
    text: [
      'Iron melts at 1811 K — far beyond any clay furnace. Instead, a **Bloomery** reduces iron ore with charcoal into a spongy **bloom**. Iron ores: limonite (bog iron), hematite, magnetite.',
      'It is a multiblock: a plus-shaped base of **bloomery walls** around the controller, plus a 2-block chimney.',
    ],
    tasks: [build('bloomery'), have('iron_bloom', 2)] },
  { id: 'wrought_iron', chapter: 'P', title: 'Hammer Time', req: ['bloomery'], reward: P2,
    text: [
      'Beat the slag out of a bloom on a **Stone Anvil**: load it and press **🔨 Strike**. You need a hammer, and each finished piece wears it.',
    ],
    tasks: [build('stone_anvil'), have('ingot:wrought_iron', 4)] },
  { id: 'fire_bricks', chapter: 'P', title: 'Refractory', req: ['quern_sluice'], reward: P1,
    text: [
      'Grind bricks to dust in the quern, mix with clay into unfired **fire bricks**, and fire them at 1050 K — wood is not hot enough, charcoal is.',
      'Fire bricks survive the heat that cracks ordinary brick.',
    ],
    tasks: [have('fire_brick:fireclay', 24)] },
  { id: 'coke_oven', chapter: 'P', title: 'Coke', req: ['fire_bricks', 'ore'], reward: P2,
    text: [
      'Coal ore cracks into coal lumps under the hammer. A **Coke Oven** bakes coal into **coke** (2000 K fuel) and creosote.',
      'It is a full storey: 3×3×3 of fire brick walls with an **empty chamber** in the middle. Anything inside the chamber stops it.',
    ],
    tasks: [build('coke_oven'), have('lump:coke', 8)] },
  { id: 'steel', chapter: 'P', title: 'Steel', req: ['coke_oven', 'wrought_iron', 'storeys'], reward: { crates: [['P', 2], ['S', 1]] },
    text: [
      'The **Primitive Blast Furnace** is a 3×3 shaft of fire brick walls, 4 blocks tall — it reaches into the storey above — with an open top. It needs 1800 K: only coke burns hot enough.',
      'Feed it wrought iron and coke (quicklime halves the time) for **steel** — the gate to the Steam age.',
    ],
    tasks: [build('primitive_blast_furnace'), have('ingot:steel', 4)] },

  // ======== Steam (P3a) ========
  { id: 's_hull', chapter: 'S', title: 'Bronze Hull', req: ['steel'], reward: S1,
    text: [
      'Welcome to the **Steam age**. Every steam machine is built around a **Bronze Hull**: 8 bronze plates and 4 bricks, shaped with a hammer and a **wrench**.',
      'A wrench is 4 plates of any metal, hammered. You also need it to assemble every steam machine.',
    ],
    tasks: [have('hull:bronze')] },
  { id: 's_pipes', chapter: 'S', title: 'Running Water', req: ['s_hull'], reward: S1,
    text: [
      'A **Water Pump** next to a river, lake or sea fills its tank with 10 L of water every tick.',
      '**Bronze Fluid Pipes** carry it away. Place them like any block: a pipe joins other pipes of its kind and every machine on all **6 sides**, including above and below.',
      'All the pipes joined together form one **network** that holds **one fluid at a time**. Each machine pushes out what it makes and pulls in what it uses, up to 120 L per tick per connection. Keep water and steam on separate networks.',
      '**Separate lines side by side:** pick a **channel** colour in the build bar before placing — pipes only join pipes on the same channel. Or tap a pipe in View mode to change its channel or **cut** single sides (a cut side joins nothing, machines included).',
    ],
    tasks: [build('water_pump'), build('bronze_pipe', 6)] },
  { id: 's_boiler', chapter: 'S', title: 'Under Pressure', req: ['s_pipes'], reward: S2,
    text: [
      'A **Small Bronze Boiler** burns fuel to boil piped water into steam (1 L water → 160 L steam). It heats up slowly; above **373 K** it starts making steam, more the hotter it gets (up to 12 L per tick at 500 K).',
      '**⚠ Never let a hot boiler run dry.** If it runs out of water while hot, it goes **DRY**. If water then reaches it while it is still above 400 K, it **explodes** and everything in it is lost. If a boiler goes dry, stop the fuel and let it cool below 373 K before sending water again.',
      'Connect the pump\'s water pipe to the boiler first, then add fuel.',
    ],
    tasks: [build('small_boiler')] },
  { id: 's_smoke', chapter: 'S', title: 'Smoke and Signals', req: ['s_boiler'], reward: S1,
    text: [
      '**Pollution:** everything that burns makes smoke — kilns and furnaces a little, coke ovens and blast furnaces more, boilers the most (a Large Boiler 16 per second). Smoke collects over each **32×32 area**, drifts to neighbouring areas and slowly fades. The top bar shows **☁** the pollution where you are looking.',
      'Above **300** the sky turns to **haze**. Above **1500** it is **smog**: machines in that area run **25 % slower**. Spread your furnaces and boilers out instead of packing them together. (Later, smog will kill plants and bring acid rain; scrubbers will clean it.)',
      '**Overlays (top bar):** **Pollution (K)** tints each area from yellow to red. **Pipes (H)** shows every pipe nearby on all storeys, through walls and floors — blue for fluid, orange for item pipes. **Veins (O)** you already know.',
      '**Alerts (⚠ in the top bar):** a machine stuck for a few seconds (no fuel, no water, no steam, output full…) or a boiler explosion shows up there. Tap an alert to fly to the machine and open it.',
    ],
    tasks: [flag('poll_overlay', 'Turn on the pollution overlay (K)'), flag('pipe_overlay', 'Turn on the pipe overlay (H)'), flag('alerts', 'Open the alerts list (⚠)')] },
  { id: 's_furnace', chapter: 'S', title: 'Steam Furnace', req: ['s_boiler'], reward: S1,
    text: [
      'Steam machines take steam from a pipe into their own buffer and use **2 L per tick for each unit of recipe power** (most use 8 L per tick). Without steam they stop with status **No steam**.',
      'The **Steam Furnace** smelts dusts that melt below 1400 K, with no fuel and no waiting for heat.',
    ],
    tasks: [build('steam_furnace')] },
  { id: 's_alloy', chapter: 'S', title: 'Alloy Smelter', req: ['s_boiler'], reward: S1,
    text: [
      'The **Steam Alloy Smelter** makes bronze ingots directly (3 copper + 1 tin), with no crucible and no molds. It also makes glass twice as fast.',
    ],
    tasks: [build('steam_alloy_smelter'), have('ingot:bronze', 16)] },
  { id: 's_hammer', chapter: 'S', title: 'Forge Hammer', req: ['s_boiler'], reward: S1,
    text: [
      'Hammering plates by hand costs 2 ingots per plate. The **Steam Forge Hammer** makes 2 plates from 3 ingots.',
    ],
    tasks: [build('steam_forge_hammer'), have('plate:bronze', 16)] },
  { id: 's_macerator', chapter: 'S', title: 'Double Yield', req: ['s_boiler'], reward: S2,
    text: [
      'The **Steam Macerator** crushes each ore into **2 crushed ores**, double what the hammer gets. Its grinder head is made of steel.',
      'Crushed ore can be ground to dust in the quern, washed, or smelted.',
    ],
    tasks: [build('steam_macerator'), any(ores('crushed_ore'), 16, 'Any crushed ore')] },
  { id: 's_washer', chapter: 'S', title: 'Ore Washing', req: ['s_macerator', 's_pipes'], reward: S2,
    text: [
      'The **Steam Ore Washer** needs **steam and water** (1000 L of water per ore). Connect two separate networks to it: one carrying steam and one carrying water.',
      'Washing turns crushed ore into purified ore, often with a **byproduct**. Every byproduct has a use somewhere.',
      'A machine with a liquid byproduct, such as a coke oven making creosote, pushes it into any pipe connected to it, so you no longer have to dump it.',
    ],
    tasks: [build('steam_ore_washer'), any(ores('purified_ore'), 8, 'Any purified ore')] },
  // ---- P3b logistics ----
  { id: 's_items', chapter: 'logistics', tier: 'S', title: 'Item Pipes', req: ['s_furnace'], reward: S2,
    text: [
      '**Tin Item Pipes** (3 tin plates + a tin ring) move items between machines. Like fluid pipes they join on all 6 sides; item and fluid pipes never join each other.',
      'Twice a second every machine on the network sends what it has made (up to 4 items each time) to the **nearest** machine that wants it: a recipe input, fuel for a furnace or boiler, or a **chest**. No more collecting by hand — chain a macerator into a furnace into a chest.',
      'A **Wooden Chest** (27 slots) is now a real inventory: tap it to look inside, put stacks in or take everything out.',
      'Every machine has **6 sides** (east, west, south, north, up, down). Open **Sides** in its panel and tap a side to cycle it: **Auto** (takes what it needs, sends what it makes), **In**, **Out** or **Off**. Chests only take items on Auto; set a chest side to **Out** to empty it down a pipe. Sides also apply to fluid pipes.',
    ],
    tasks: [build('tin_item_pipe', 4), build('chest'), flag('mface', 'Set a machine side')] },
  { id: 's_barrel', chapter: 'logistics', tier: 'S', title: 'Buffers', req: ['s_boiler'], reward: S1,
    text: [
      'A **Wooden Barrel** holds 16000 L of one fluid. On a network it soaks up whatever nobody needs and gives it back when a machine runs short — a reservoir for your pump, or for creosote. Wood can\'t hold steam or molten metal.',
      '**Lead Fluid Pipes** carry less (80 L per tick) but resist acids, which the chemistry of later ages needs. Different pipe kinds never join, so you can run a lead line right beside a bronze one.',
    ],
    tasks: [build('barrel'), build('lead_pipe', 4)] },
  // ---- P3c ----
  { id: 's_ladder', chapter: 'S', title: 'The Ore Ladder', req: ['s_washer'], reward: S2,
    text: [
      'Each step up the **ore ladder** gets more out of an ore:',
      '**Smelt it raw**: 1 ingot. **Macerate** it: 2 crushed ores, so 2 ingots. **Wash** the crushed ore: purified ore plus a chance of a byproduct. **Macerate** the purified ore into dust, with another byproduct chance. Then smelt the dust.',
      'The Steam Macerator now also grinds crushed and purified ore, and the Steam Ore Washer rinses **impure dust** clean (100 L of water). The Steam Furnace smelts crushed and purified ore directly too.',
      'Chain it with item pipes: macerator → washer → macerator → furnace → chest.',
    ],
    tasks: [any([...ores('mdust').filter((id) => !/:(coal|rock_salt|graphite)$/.test(id)), 'dust:copper', 'dust:gold', 'dust:silver'], 16, 'Any ore dust')] },
  { id: 's_compressor', chapter: 'S', title: 'Compressor', req: ['s_boiler'], reward: S1,
    text: [
      'The **Steam Compressor** (hull + 2 pistons) presses 2 plates into a **double plate**, rubber sheets into **rubber plates**, and coal, charcoal or coke dust back into burnable lumps.',
    ],
    tasks: [build('steam_compressor')] },
  { id: 's_rubber', chapter: 'S', title: 'Rubber', req: ['s_washer', 's_alloy'], reward: S2,
    text: [
      '**Rubber trees** grow in jungles, and a few in swamps. With a **Treetap** (a plank and a stick) in your tool slots, tapping a rubber tree gives **sticky resin** and leaves the tree standing. Felling one with an axe gives some resin too.',
      'Rubber also needs **sulfur**. Washing crushed **coal** or **pyrite** in the ore washer often leaves small piles of sulfur dust as a byproduct.',
      'Vulcanise it: the clay furnace turns 3 resin + a small pile of sulfur into 1 rubber sheet. Electric cables will need lots of it.',
    ],
    tasks: [flag('tap', 'Tap a rubber tree'), have('sheet:rubber', 8)] },
  { id: 's_extractor', chapter: 'S', title: 'Extractor', req: ['s_rubber'], reward: S1,
    text: [
      'The **Steam Extractor** (hull + piston + glass) squeezes each sticky resin into a **raw rubber**. The alloy smelter vulcanises 2 raw rubber + a small pile of sulfur into 2 sheets: **three times** the clay furnace\'s yield.',
    ],
    tasks: [build('steam_extractor'), have('raw:rubber', 8)] },
  { id: 's_pump', chapter: 'logistics', tier: 'S', title: 'Steam Pump', req: ['s_boiler'], reward: S1,
    text: [
      'The **Steam Pump** draws 40 L of water per tick, four times the water pump, for 4 L of steam per tick. Like the water pump it must stand next to water. Connect a steam pipe and a water pipe to different sides.',
    ],
    tasks: [build('steam_pump')] },
  { id: 's_thumper', chapter: 'mining', tier: 'S', title: 'Deep Survey', req: ['s_boiler'], reward: S2,
    text: [
      'The prospector\'s hammer only hears veins down to layer 8. The **Steam Thumper** (hull + 2 pistons + steel rod) pounds the ground for 20 seconds on 16 L of steam per tick, then surveys every vein within **48 tiles** down to **layer 16** — the deep slot.',
      'It surveys once. Demolish it and build it somewhere else to survey there.',
    ],
    tasks: [build('steam_thumper'), flag('thump', 'Finish a thumper survey')] },
  { id: 's_excavator', chapter: 'mining', tier: 'S', title: 'Steam Excavator', req: ['s_thumper', 's_items'], reward: S2,
    text: [
      'The **Steam Excavator** (hull + steel drill head + 2 bronze gears) mines **ore** in the 9×9 square below it, layer by layer from layer 1 down to layer 16. It takes only the ore and leaves the rock, which exposes any vein it reaches.',
      'It mines hardness ≤ 1 (2 s per block, 4 s for hardness 1) on 16 L of steam per tick, but nothing under water. Ore collects inside it: connect an item pipe to carry it away. When nothing is left in reach, move it.',
      'Build it over a surveyed vein (the overlay, **O**, shows where).',
    ],
    tasks: [build('steam_excavator'), any(ores('ore'), 64, 'Any ore')] },
  // ---- P3d: high pressure, sunshine, the Large Boiler ----
  { id: 's_steel_hull', chapter: 'S', title: 'Steel Hull', req: ['s_boiler'], reward: S1,
    text: [
      'Bronze is soft. A **Steel Hull** (8 steel plates + 4 fire bricks, hammer + wrench) holds far more pressure — the base of every high-pressure machine and of the Large Boiler.',
      'Steel comes from the primitive blast furnace. It is slow: start stockpiling now.',
    ],
    tasks: [have('hull:steel')] },
  { id: 's_hp_boiler', chapter: 'power', tier: 'S', title: 'High Pressure', req: ['s_steel_hull'], reward: S1,
    text: [
      'The **High-Pressure Steel Boiler** (steel hull + 8 fire bricks + 2 bronze pipes) runs hotter (600 K) and makes **2.5×** the steam of the small boiler — 30 L/tick — but burns fuel twice as fast.',
      'Everything else is the same: water in, steam out, and never let it run dry while hot.',
    ],
    tasks: [build('hp_boiler')] },
  { id: 's_solar', chapter: 'power', tier: 'S', title: 'Sunshine', req: ['s_boiler'], reward: S1,
    text: [
      'The **Solar Boiler** (bronze hull + 4 glass panes + 2 silver plates) burns nothing: sunlight heats it. It is weak (6 L/tick at most), makes nothing at night and less in rain, but it never needs feeding.',
      'It still boils water, so it still explodes if water hits it while it is dry and hot.',
    ],
    tasks: [build('solar_boiler')] },
  { id: 's_large_boiler', chapter: 'power', tier: 'S', title: 'Large Boiler', req: ['s_hp_boiler', 's_items'], reward: S2,
    text: [
      'The **Large Boiler** is the steam age\'s great machine: **120 L/tick** of steam at 800 K, burning fuel 8× as fast as a small boiler. Its controller (steel hull + 8 fire bricks + 4 bronze pipes) sits at the **front** of a 3×3×3 block: a floor of 8 **Steel Firebox Casings**, then two layers of **Bronze Plated Bricks** around a **Bronze Pipe Casing** core.',
      '**Rotation:** press **F** (or ↻ in the build bar) before placing — the ghost shows the whole footprint and which way the front faces. The structure is built **behind** the controller.',
      '**Hatches:** big multiblocks don\'t take pipes on just any casing. Any **outer** casing can be swapped for a hatch: a **Bronze Input Hatch** (water in), a **Bronze Output Hatch** (steam out) and, if you like, a **Bronze Input Bus** (fuel by item pipe). It needs at least one input and one output hatch. Place the hatches first, then **Auto-fill** the rest.',
    ],
    tasks: [build('large_boiler'), flag('lboiler', 'Run a complete Large Boiler')] },
  // ---- LV (P4a): electricity ----
  { id: 'l_magnet', chapter: 'LV', title: 'Lodestone', req: ['s_steel_hull'], reward: L1,
    text: [
      'Electricity starts with a magnet. Mine **magnetite** ore by hand and it sometimes drops a **lodestone** — a natural magnet. File it into a **Lodestone Magnet** (a tool, it wears out).',
      'Stroke an **iron rod** with it to make a **Magnetic Iron Rod**: the heart of every motor. Later the **Polarizer** does this with power.',
    ],
    tasks: [have('tool:magnet:lodestone'), have('magnetic_rod:iron')] },
  { id: 'l_motor', chapter: 'LV', title: 'Electric Motor', req: ['l_magnet', 's_rubber'], reward: L1,
    text: [
      'An **LV Motor** = 2 tin cables + 4 fine copper wires + 2 iron rods + 1 magnetic iron rod (wrench + screwdriver). Every LV part and machine is built from motors.',
      '**Wire** is cut from a plate with a **wire cutter**; cut a wire again for **fine wire**. A **cable** is a wire wrapped in a rubber sheet — insulation.',
    ],
    tasks: [have('motor:lv')] },
  { id: 'l_turbine', chapter: 'power', tier: 'LV', title: 'Spinning Up', req: ['l_motor', 's_boiler'], reward: L2,
    text: [
      'The **Steam Turbine** (LV hull + 2 motors + 2 steel rotors + 2 bronze pipes + 2 tin cables) turns steam from a pipe into up to **32 W** (1 A at 32 V), using 16 L/tick at full output. It only spins as fast as the cables draw, so idle machines cost no steam.',
      'An **LV Hull** is 8 steel plates + 2 tin cables (wrench). Cable it up: see **Live Wire** (LV).',
    ],
    tasks: [have('hull:lv'), build('steam_turbine')] },
  { id: 'l_circuit', chapter: 'LV', title: 'Basic Circuit', req: ['l_motor'], reward: L2,
    text: [
      'LV machines need **Basic Circuits**, soldered by hand with a **Soldering Iron** (copper rod + iron rod + stick, file):',
      '**Board:** macerate logs into **wood pulp** (or grind with the mortar), press 2 pulp + sticky resin in the steam compressor → **resin board**; add 2 **copper foil** (knife) → circuit board.',
      '**Vacuum tube:** the alloy smelter blows a glass pane into 2 **glass tubes**; + 2 fine copper wire + steel bolt. **Carbon resistors:** coal dust + 2 fine copper wire + sticky resin. **Solder:** 2 tin + 1 lead in the alloy smelter → 3 solder; cut a wire.',
      'Circuit = board + 2 tubes + 2 resistors + 1 solder wire. The **Assembler** makes two at once.',
    ],
    tasks: [have('circuit:basic', 2)] },
  { id: 'l_cables', chapter: 'LV', title: 'Live Wire', req: ['l_circuit', ['l_turbine', 'l_combustion', 'l_solar', 'l_wind', 'l_water_turbine']], reward: L2,
    text: [
      'Real units: **voltage** (V) pushes, **current** (A) flows, **power** (W = V × A) is energy per second, energy is counted in **joules** (J). LV is **32 V**. Any **one** generator from the **⚡ Power** chapter opens this quest — steam turbine, combustion, solar, wind or water: pick the one that suits your base and scale it.',
      'LV machines follow a template: **LV hull + 2 basic circuits + 2 tin cables** + their own parts. Each has a small **energy buffer** (1 s of input, 32 W max at LV) and draws its recipe\'s power every tick — "No power" when the buffer runs dry.',
      '**Cables** join every cable they touch on all 6 sides, any material, into one network; machines and generators touching it connect (set a side **Off** in the machine\'s Sides to cut it). Bare **wire** works too but loses twice as much.',
      '**Loss:** every tile of cable between a machine and the nearest generator costs a little (tin cable 0.4 V per tile of 32 V). Keep generators close. The machine panel shows the network: volts, watts, amps and loss. The pipe overlay (**H**) shows cables in yellow. Channels and cut sides work for cables exactly like pipes.',
    ],
    tasks: [build('tin_cable', 4), flag('powered', 'Power an LV machine')] },
  { id: 'l_fuse', chapter: 'power', tier: 'LV', title: 'Blow a Fuse', req: ['l_cables'], reward: L1,
    text: [
      '**Current** on a network = watts delivered ÷ volts. **Tin** cable carries **2 A** (64 W at LV), **copper** 4 A. More than that and the weakest block **burns out** — two turbines are the most one tin line can take.',
      'A **Fuse** (tin wire in a glass tube) is a 2 A cable block that always burns first: a cheap, deliberate weak spot. When it blows, the line is cut until you place a new one.',
      'Voltage matters too: anything rated below its network\'s voltage burns (cables) or **explodes** (machines). Nothing at LV goes higher — until transformers.',
    ],
    tasks: [build('fuse')] },
  ...([
    ['macerator', 'Macerator', 'LV crushing: ore → 2 crushed, then purified → dust with better byproduct odds than steam. Also logs → 6 wood pulp.'],
    ['electric_furnace', 'Electric Furnace', 'Smelts dusts up to 1750 K — steel included, no fuel, no smoke. Iron (1811 K) still needs a blast furnace. Also smelts pentlandite into nickel (matte smelting).'],
    ['bender', 'Bender', 'Ingot → plate 1:1 (no waste), plates → foil ×4, rods → springs. The programmed circuit number picks plate vs double plate.'],
    ['wiremill', 'Wiremill', 'Ingot → 2 wires, wire → 4 fine wires: far cheaper than the wire cutter.'],
    ['lathe', 'Lathe', 'Ingot → 2 rods, bolts → screws, rods → 2 rings.'],
    ['cutter', 'Cutter', 'Rod → 4 bolts (the saw gives 2).'],
    ['assembler', 'Assembler', 'Builds parts, gears, cables and circuits from components — 2 circuits per set, 2 vacuum tubes, 4 resistors.'],
    ['ore_washer', 'Ore Washer', 'Crushed ore + 1000 L water → purified ore with its first byproduct guaranteed.'],
    ['centrifuge', 'Centrifuge', 'Impure dust → clean dust, half the time with a byproduct.'],
    ['thermal_centrifuge', 'Thermal Centrifuge', 'Purified → refined ore (+ the second byproduct); refined ore macerates to dust plus extra. Its coil is cupronickel wire: nickel from pentlandite (electric furnace) + copper in the alloy smelter.'],
    ['fluid_extractor', 'Fluid Extractor', 'Melts ingots into 144 L of molten metal; the Fluid Solidifier casts it back into ingots and plates with clay molds.'],
    ['polarizer', 'Polarizer', 'Magnetises iron rods with power — retire the lodestone.'],
    ['mixer', 'Mixer', 'Stirs dusts and fluids together: salt + 1000 L water → 1000 L brine; copper + tin dust → bronze dust (solder and cupronickel too).'],
    ['electrolyzer', 'Electrolyzer', 'Splits fluids with current: brine → sodium hydroxide + chlorine + hydrogen; water → hydrogen + oxygen. Its electrodes are 4 silver wires.'],
    ['chemical_reactor', 'Chemical Reactor', 'Reacts fluids: hydrogen + chlorine → hydrochloric acid; SO₂ + oxygen + water → sulfuric acid (slowly); also vulcanises raw rubber better than the alloy smelter (3 sheets per 2).'],
    ['roaster', 'Roaster', 'Roasts sulfide mineral dust (pyrite, chalcopyrite, galena, sphalerite, stibnite, pentlandite, cobaltite) in air → calcine + sulfur dioxide. Cinnabar gives mercury. Calcine + coal dust → metal in the electric furnace.'],
    ['chemical_bath', 'Chemical Bath', 'Leaches crushed ore in acid: sulfuric acid frees its third byproduct, hydrochloric acid its second (70 %). Mercury pulls extra gold out of crushed native gold.'],
    ['canner', 'Canner', 'Fills empty tin cells from piped fluid and empties full cells back into pipes — cells by automation.'],
    ['electric_pump', 'Electric Pump', 'Like the steam pump, by power: 60 L/tick of water for 16 W from a tile next to water.'],
  ] as const).map(([id, name, what]): QuestDef => ({
    id: `l_${id}`, chapter: 'LV', title: name, req: ['l_cables'], reward: L1,
    text: [`**${name}:** ${what}`, 'Build it (LV template + its parts, see its recipe) and cable it to a generator.'],
    tasks: [build(id)],
  })),
  // ---- LV (P4b): chemistry I ----
  { id: 'l_cells', chapter: 'chem', tier: 'LV', title: 'Fluid Cells', req: ['l_cables'], reward: L1,
    text: [
      'A **Tin Cell** (2 tin plates + a rubber ring, hammer) carries **1000 L** of one fluid as an item. In a machine panel, **Fill** turns what a machine holds into full cells; **Pour** empties your cells into a machine that wants that fluid (a recipe input, a barrel, a boiler\'s water).',
      'Cells are the quick way to move chemicals before your pipes are laid. The **Canner** does it by recipe.',
    ],
    tasks: [have('cell:empty', 4), flag('cell', 'Fill or pour a cell')] },
  { id: 'l_brine', chapter: 'chem', tier: 'LV', title: 'Brine', req: ['l_mixer'], reward: L1,
    text: [
      'Chemistry runs on fluids. LV machines hold **several fluids at once**: the ones their recipe uses are **inputs** (pipes fill them), everything else is **output** (pipes take it away). Gases stay inside electric machines — unlike kilns, they don\'t vent — so a full gas tank stops the machine.',
      'Mix **salt** (rock salt dust) with water into **brine**. Pipe water in, or pour water cells.',
    ],
    tasks: [flag('brine', 'Make brine in the Mixer')] },
  { id: 'l_chloralkali', chapter: 'chem', tier: 'LV', title: 'Chlor-Alkali', req: ['l_brine', 'l_electrolyzer'], reward: L2,
    text: [
      'Electrolysis of brine: 2000 L brine → **1000 L sodium hydroxide + 1000 L chlorine + 1000 L hydrogen**. Three outputs — and a pipe network holds **one fluid**. A fresh network takes whichever output the machine holds most of and keeps it, so run a separate line from a different side for each, keeping them apart with **channels** or **cut sides**. Or fill cells.',
      '**Dump** in the panel pours a fluid away; toxic fluids and gases (chlorine!) add pollution where you dump them.',
    ],
    tasks: [flag('chlorine', 'Electrolyse brine')] },
  { id: 'l_hcl', chapter: 'chem', tier: 'LV', title: 'Hydrochloric Acid', req: ['l_chloralkali', 'l_chemical_reactor'], reward: L2,
    text: [
      'Burn hydrogen in chlorine: **H₂ + Cl₂ → HCl**. The Chemical Reactor takes both gases (two input lines, or cells) and makes **hydrochloric acid**.',
      '**Acids are corrosive.** In a bronze pipe they eat through: every second each non-acid-proof pipe block holding acid has a small chance to **burst** — the pipe and its acid are lost and the spill pollutes. **Lead pipes are acid-proof.** NaOH + HCl neutralise back to brine if you make too much.',
    ],
    tasks: [flag('hydrochloric_acid', 'Make hydrochloric acid'), build('lead_pipe', 4)] },
  { id: 'l_roast', chapter: 'chem', tier: 'LV', title: 'Roasting', req: ['l_roaster'], reward: L1,
    text: [
      'Sulfide ores don\'t smelt directly. The **Roaster** burns their sulfur off in air: 2 ZnS + 3 O₂ → 2 ZnO + 2 SO₂. You get **calcine** (the oxide) and **sulfur dioxide**.',
      'The electric furnace reduces calcine with **coal dust** into metal: galena → lead, sphalerite → zinc, pentlandite → nickel (one ingot per dust, twice the matte route). SO₂ is toxic — dumping it pollutes. Capture it instead.',
    ],
    tasks: [flag('sulfur_dioxide', 'Roast a sulfide')] },
  { id: 'l_acid', chapter: 'chem', tier: 'LV', title: 'Sulfuric Acid', req: ['l_roast', 'l_chemical_reactor'], reward: L2,
    text: [
      'The king of chemicals: **SO₂ + O₂ + H₂O → H₂SO₄**. Without a catalyst it is slow (a minute per batch) and wasteful — the MV contact process will fix that. Oxygen comes from splitting water in the electrolyzer; burning plain sulfur dust in the roaster gives SO₂ too.',
      'Sulfuric acid feeds the **Chemical Bath** (acid leaching frees specific byproducts) and, soon, lead-acid batteries. Keep it in lead pipes.',
    ],
    tasks: [flag('sulfuric_acid', 'Make sulfuric acid')] },
  // ---- LV (P4c): grid ----
  { id: 'l_battery', chapter: 'power', tier: 'LV', title: 'Lead-Acid Battery', req: ['l_acid', 'l_canner'], reward: L2,
    text: [
      '**Lead-antimony** (4 lead + 1 antimony in the alloy smelter or mixer; antimony from roasted stibnite) makes stiff battery plates. Two plates, rubber sheets and a tin cable make a **battery case**.',
      'The **Canner** fills the case with 1000 L of sulfuric acid: a **Lead-Acid Battery** holding 36 kJ.',
    ],
    tasks: [have('battery:lead_acid')] },
  { id: 'l_battery_buffer', chapter: 'power', tier: 'LV', title: 'Battery Buffer', req: ['l_battery'], reward: L2,
    text: [
      'A **Battery Buffer** holds 4 batteries. It charges from whatever its generators make beyond what the machines use, and supplies the network when they fall short (32 W per battery) — a turbine\'s spare steam becomes power for later.',
      'Take a battery out once a full one\'s worth is stored and it comes out **charged** — electric tools will run on those.',
    ],
    tasks: [build('battery_buffer'), flag('discharge', 'Run machines from batteries')] },
  { id: 'l_breaker', chapter: 'power', tier: 'LV', title: 'Breakers', req: ['l_fuse'], reward: L1,
    text: [
      'A **Breaker** (4 A) trips open on overcurrent instead of burning: open its panel and **Reset** it. It is also a switch — open it to cut a line by hand.',
      'The **Power load** overlay (T) colours every cable by its network\'s load: green is easy, orange near the limit, red over it, grey has no source. Tripped breakers glow magenta.',
    ],
    tasks: [build('breaker'), flag('breaker', 'Switch or reset a breaker'), flag('power_overlay', 'Open the power load overlay (T)')] },
  { id: 'l_transformer', chapter: 'power', tier: 'LV', title: 'Transformers', req: ['l_breaker'], reward: L2,
    text: [
      'A **Transformer** links two voltages. Its **front** (the way you placed it) is the 128 V side; every other face is 32 V. Step-down: 128 V in at the front, 32 V out of the sides. Step-up: the reverse.',
      'Careful: 128 V on a network **melts tin cable** and **explodes** any 32 V machine on it. Run copper cable on the high side. A transformer passes 128 W — 4 A on its low side, more than a tin cable carries.',
      'Long lines lose less at a higher voltage (same power, a quarter of the current): step up at the generators, step down near the machines.',
    ],
    tasks: [build('transformer'), flag('xfmr', 'Pass power through a transformer')] },
  // ---- P4d: generators, electric tools, scanning, the mining rig ----
  { id: 'l_combustion', chapter: 'power', tier: 'LV', title: 'Combustion Generator', req: ['l_motor'], reward: L2,
    text: [
      'The **Combustion Generator** (LV hull + motor + 2 pistons + steel pipe + 2 tin cables) burns liquid fuel for up to **32 W**: **creosote** from the coke oven (8 J/L — 4 L/s at full output) or **wood tar** from the charcoal pile (6 J/L). Pipe it in, or pour cells.',
      'Like the turbine it only burns what the cables draw. It smokes a little while running.',
    ],
    tasks: [build('combustion_generator')] },
  { id: 'l_solar', chapter: 'power', tier: 'LV', title: 'Selenium Sun', req: ['s_steel_hull'], reward: L1,
    text: [
      'Selenium was the first photovoltaic material: weak, but free. A **Selenium Solar Panel** (2 selenium ingots + 2 glass panes + 2 steel plates + tin cable) gives up to **8 W** in full sun, less in rain, nothing at night.',
      'Selenium comes as a byproduct of **chalcopyrite** ore processing.',
    ],
    tasks: [build('solar_panel')] },
  { id: 'l_wind', chapter: 'power', tier: 'LV', title: 'Wind Turbine', req: ['l_motor'], reward: L1,
    text: [
      'The **Wind Turbine** (LV hull + motor + 2 steel rotors + 4 steel rods) follows the weather: up to **32 W** in a gale. Height matters — on the ground it gets 30 %, and it reaches full strength **12 blocks up** (storey 4). Build a tower.',
    ],
    tasks: [build('wind_turbine')] },
  { id: 'l_water_turbine', chapter: 'power', tier: 'LV', title: 'Water Turbine', req: ['l_motor'], reward: L1,
    text: [
      'The **Water Turbine** (LV hull + motor + 2 steel rotors) sits beside moving water: next to a **river** it makes 24 W (more in rain), next to a **lake** about a third of that. The sea doesn\'t turn it.',
    ],
    tasks: [build('water_turbine')] },
  { id: 'l_etools', chapter: 'mining', tier: 'LV', title: 'Electric Tools', req: ['l_battery_buffer'], reward: L2,
    text: [
      'The **Electric Drill** (steel drill head) digs rock and soil, the **Electric Chainsaw** (steel saw blade) fells trees — twice as fast as steel hand tools, 200 J per block. Each is a motor, a basic circuit, 2 steel plates and an empty battery (screwdriver, wrench).',
      'When its battery runs flat it swaps in a **charged battery** from your bag and hands back the empty one. Charge batteries in a battery buffer, take them out charged. A flat tool with no charged battery to swap is skipped for your hand tools.',
    ],
    tasks: [any(['tool:drill:steel', 'tool:chainsaw:steel'], 1, 'An electric drill or chainsaw'), flag('etool', 'Use an electric tool')] },
  { id: 'l_scanner', chapter: 'mining', tier: 'LV', title: 'Handheld Scanner', req: ['l_etools'], reward: L2,
    text: [
      'The **Handheld Scanner** (copper coil, glass lens, 2 basic circuits) replaces the prospector\'s hammer in **🔍 prospect** mode: it surveys every vein within **32 tiles** down to **layer 16**, for 4 kJ of battery each time.',
    ],
    tasks: [have('tool:scanner:steel'), flag('escan', 'Scan for veins')] },
  { id: 'l_scanner_block', chapter: 'mining', tier: 'LV', title: 'Scanner', req: ['l_scanner'], reward: L2,
    text: [
      'The **Scanner** block (LV machine template + 8 copper wire + glass lens) listens for 30 s on 32 W, then surveys every vein within **64 tiles**, at **every depth** — the abyssal slot and the seabed included. Once per spot, like the thumper.',
    ],
    tasks: [build('scanner'), flag('scan', 'Finish a scanner survey')] },
  { id: 'l_mining_rig', chapter: 'mining', tier: 'LV', title: 'Mining Rig', req: ['l_scanner_block', 's_excavator'], reward: L2,
    text: [
      'The **Mining Rig** (LV machine template + 2 motors + steel drill head + steel pipe) is the electric excavator: ore in the **13×13** square below it, from layer 1 down to **layer 24**, hardness ≤ **2**, 1 s per block × (1 + hardness), on 32 W. Nothing under water.',
    ],
    tasks: [build('mining_rig'), flag('rig', 'Mine ore with a rig')] },
  // ---- LV (P4e): the gate ----
  { id: 'l_assembly', chapter: 'LV', title: 'Mass Production', req: ['l_assembler', 'l_circuit'], reward: L2,
    text: [
      'Hand-soldering every circuit will not scale. The **Assembler** makes **2 basic circuits** per set of parts with no soldering iron, presses copper foil onto resin boards, and doubles vacuum tubes and resistors.',
      'The EBF alone needs 3 circuits, and every LV machine 2 more. Pipe the parts in and let it run.',
    ],
    tasks: [flag('acirc', 'Assemble basic circuits'), have('circuit:basic', 8)] },
  { id: 'l_hazards', chapter: 'chem', tier: 'LV', title: 'Contamination', req: ['l_acid'], reward: L1,
    text: [
      'Chemistry leaves a mark. A corroded pipe, or **dumping** 100 L or more of a toxic or corrosive fluid, **contaminates** the ground under it (sickly green): nothing can be built there until it is neutralised.',
      'In **💥 Demolition** mode, tap a bare contaminated tile with **quicklime dust** in your bag (lime kiln: calcite) — 1 dust per tile.',
      '**Fire:** an explosion or a burned-out cable ignites flammable fluid next to it — hydrogen, creosote, wood tar — and every pipe and tank of it in reach burns too. Keep fuel lines away from boilers and cables.',
    ],
    tasks: [flag('clean', 'Neutralise a contaminated tile')] },
  { id: 'l_ebf', chapter: 'LV', title: 'Electric Blast Furnace', req: ['l_assembly'], reward: L2,
    text: [
      'The **gate to MV.** The **Electric Blast Furnace** controller (LV hull + 2 electric furnaces + 3 circuits) stands at the front of a 3×3, 4-block stack: a floor and roof of **Heat-Proof Casing** (6 steel plates + steel frame) around two rings of **Cupronickel Coils** (8 cupronickel wire + foil) — 2000 K.',
      'It takes power only through **LV Energy Hatches** (LV hull + 2 tin cables) and needs a **Maintenance Hatch**; buses and fluid hatches carry items and fluids. Hatches replace casings on the floor or roof, never coils.',
    ],
    tasks: [build('ebf'), have('struct:heat_casing', 17), have('struct:cupronickel_coil', 16), have('struct:energy_hatch'), have('struct:maintenance_hatch')] },
  { id: 'l_maint', chapter: 'LV', title: 'Maintenance', req: ['l_ebf'], reward: L1,
    text: [
      'A new multiblock comes with **every issue**: loose bolts (wrench), loose screws (screwdriver), a dented casing (hammer), burnt wiring (soldering iron), frayed cables (wire cutter), burred gears (file). Each costs **10 % speed**.',
      'Fix them in its panel with the tool in your tool slots. New issues turn up now and then while it works — keep the toolbox handy.',
    ],
    tasks: [flag('maint', 'Fix a maintenance issue')] },
  { id: 'l_ebf_mv', chapter: 'LV', title: 'Two Hatches', req: ['l_maint'], reward: L2,
    text: [
      'One LV energy hatch takes **2 A (64 W)** — enough to blow **oxygen** through iron dust into steel. **Two hatches** give **128 W**: MV-level power from LV parts, the gate rule.',
      'That smelts metals that melt between 1750 K and the coils\' 2000 K: **iron**, **cobalt**, **kanthal** (next tier\'s coils), **titanium**. Each hatch draws 2 A on its own line — one tin cable each, or a copper cable for both.',
    ],
    tasks: [flag('ebf', 'Smelt in the EBF'), flag('ebf_mv', 'Run a 128 W recipe on two energy hatches')] },
  // ---- MV (P5a): aluminium, the gate material ----
  { id: 'm_bayer', chapter: 'MV', title: 'The Bayer Process', req: ['l_ebf_mv', 'l_chloralkali'], reward: M1,
    text: [
      '**Aluminium** opens MV, and it never comes out of a furnace: bauxite has to be turned into pure **alumina** first.',
      '**Chemical reactor:** bauxite dust + 1000 L **sodium hydroxide** (electrolyzer: brine) → **sodium aluminate** + red mud. **Mixer:** the aluminate precipitates **aluminium hydroxide** and gives most of the NaOH back — pipe it round again. **Roaster:** calcine 2 hydroxide → 1 **alumina**.',
      'Bauxite lies in laterites under the jungle.',
    ],
    tasks: [flag('sodium_aluminate', 'Digest bauxite'), have('dust:alumina', 4)] },
  { id: 'm_red_mud', chapter: 'chem', tier: 'MV', title: 'Red Mud', req: ['m_bayer'], reward: M1,
    text: [
      'Every batch of bauxite leaves **red mud** — corrosive slurry. Dumping it contaminates the ground.',
      'Spin it in the **centrifuge** instead: iron, rutile (titanium, later) and a little **gallium** come out, and the water goes back.',
    ],
    tasks: [have('small_dust:gallium')] },
  { id: 'm_cryolite', chapter: 'MV', title: 'Cryolite', req: ['m_bayer', 'l_acid'], reward: M1,
    text: [
      'Alumina melts at 2300 K — too hot to electrolyse. Dissolved in molten **cryolite** it melts near 1250 K.',
      '**Chemical reactor:** fluorite dust + 1000 L **sulfuric acid** → **hydrofluoric acid** (corrosive, toxic: lead pipes). Then aluminium hydroxide + 1000 L HF + 1000 L NaOH → **cryolite**.',
    ],
    tasks: [flag('hydrofluoric_acid', 'Make hydrofluoric acid'), have('dust:cryolite', 2)] },
  { id: 'm_hall', chapter: 'MV', title: 'Hall–Héroult Cell', req: ['m_cryolite'], reward: M2,
    text: [
      'The **gate to MV.** The **Hall–Héroult Cell** controller stands in front of a 3×3 pot: a floor of **Carbon-Lined Casing** around a **Cathode Block** in the middle, one ring of casing above around the open bath.',
      'Like the EBF it runs on **two LV energy hatches** (128 W) and needs a **maintenance hatch**. Each run eats a **graphite anode** (steam compressor: 4 graphite dust) and a little cryolite, and gives off CO₂ — take it out through an output hatch or dump it.',
      '4 alumina → 4 **aluminium ingots**.',
    ],
    tasks: [build('hall_heroult'), have('struct:carbon_casing', 15), have('struct:cathode_block'), flag('aluminium', 'Smelt aluminium')] },
  { id: 'm_hull', chapter: 'MV', title: 'MV Hull', req: ['m_hall'], reward: M2,
    text: [
      '8 **aluminium plates** + 2 **copper cables** (128 V) → the **MV Hull**, the frame of every MV machine.',
    ],
    tasks: [have('hull:mv')] },
  // ---- MV (P5b): parts, generators, overclocking, MV hatches, lithium battery ----
  { id: 'm_motor', chapter: 'MV', title: 'MV Motor', req: ['m_hull'], reward: M1,
    text: [
      'MV parts come from the **assembler** only. The MV motor wants a **magnetic steel rod** — the **Polarizer** magnetises a steel rod — plus aluminium rods, copper wire and copper cable.',
      'Pumps, pistons, conveyor modules and robot arms follow the LV recipes in aluminium.',
    ],
    tasks: [have('magnetic_rod:steel'), have('motor:mv')] },
  { id: 'm_turbine', chapter: 'power', tier: 'MV', title: 'MV Steam Turbine', req: ['m_motor'], reward: M1,
    text: [
      'The **MV Steam Turbine** (MV hull + 2 MV motors + 2 aluminium rotors + 2 steel pipes + 2 copper cables) gives **128 W at 128 V** from up to 64 L/tick of steam — a large boiler feeds two.',
      '128 V **melts tin cable** and **explodes** LV machines: run copper cable, and step down through a transformer for the LV side of the base.',
    ],
    tasks: [build('steam_turbine_mv'), flag('steam_turbine_mv', 'Feed power at 128 V')] },
  { id: 'm_combustion', chapter: 'power', tier: 'MV', title: 'MV Combustion Generator', req: ['m_motor'], reward: M1,
    text: [
      'The **MV Combustion Generator** burns the same liquid fuels as the LV one, four times as fast, for **128 W at 128 V**. Copper cable only.',
    ],
    tasks: [build('combustion_generator_mv'), flag('combustion_generator_mv', 'Feed power at 128 V')] },
  // ---- MV (P5c): organic chemistry → discrete circuit ----
  { id: 'm_pyrolyse', chapter: 'MV', title: 'Pyrolyse Oven', req: ['m_motor', ['m_turbine', 'm_combustion', 'm_geothermal']], reward: M2,
    text: [
      'The **Pyrolyse Oven** bakes wood and coal without air. Its controller stands in front of a closed 3×3×3 retort: **heat-proof casing** floor and roof, a ring of **cupronickel coils** around the hollow middle. Hatches as the EBF.',
      'It needs **96 W**: two LV energy hatches, or one MV hatch. 16 logs → 12 charcoal + **methanol**, acetic acid and wood tar. 16 coal → 16 coke + **coal tar** and hydrogen.',
    ],
    tasks: [build('pyrolyse_oven'), flag('methanol', 'Make methanol'), flag('coal_tar', 'Make coal tar')] },
  { id: 'm_distill', chapter: 'MV', title: 'Coal Tar Distillery', req: ['m_pyrolyse'], reward: M1,
    text: [
      'The **Coal Tar Distillery** is an MV machine with no LV version: it needs **128 V** — copper cable from an MV generator, or a transformer stepping up.',
      'Coal tar → **phenol**, benzene, toluene and creosote. Benzene and toluene keep for HV; creosote burns in a combustion generator.',
    ],
    tasks: [build('distillery'), flag('phenol', 'Distil phenol')] },
  { id: 'm_formaldehyde', chapter: 'chem', tier: 'MV', title: 'Formaldehyde', req: ['m_pyrolyse'], reward: M1,
    text: [
      'Methanol + oxygen over hot **silver** → **formaldehyde**. The **Silver Catalyst Mesh** (assembler: 8 fine silver wire) sits in the chemical reactor like a mold and is **not used up** — but each run has a 2 % chance to wear it out.',
    ],
    tasks: [have('catalyst:silver'), flag('formaldehyde', 'Make formaldehyde')] },
  { id: 'm_phenolic', chapter: 'MV', title: 'Phenolic Board', req: ['m_distill', 'm_formaldehyde'], reward: M2,
    text: [
      'Phenol + formaldehyde → **phenolic resin** (chemical reactor) — the first plastic.',
      'Wood pulp soaked in a **chemical bath** of water → **paper**. Paper soaked in resin → the **phenolic board**; the assembler lays 4 copper foil on it for a **discrete circuit board**. The fluid solidifier moulds resin into **component cases**.',
    ],
    tasks: [flag('phenolic_resin', 'Make phenolic resin'), have('board:phenolic', 2), have('case:phenolic', 4)] },
  { id: 'm_silicon', chapter: 'MV', title: 'Metallurgical Silicon', req: ['m_hull'], reward: M1,
    text: [
      'Quartz dust + 2 coal dust in the **EBF** at 2000 K — the limit of cupronickel coils → a **silicon ingot** (the carbon leaves as CO₂). Bend it into plates for semiconductors.',
    ],
    tasks: [have('ingot:silicon', 2)] },
  { id: 'm_components', chapter: 'MV', title: 'Transistors', req: ['m_phenolic', 'm_silicon'], reward: M2,
    text: [
      'Assembler: silicon plate + 2 fine gold wire + case → 2 **transistors** · silicon plate + 4 fine copper wire + glass tube → 4 **diodes** · 2 aluminium foil + paper + case → 2 **capacitors**. Resistors stay carbon.',
      'Transistors also make **basic circuits cheaper**: basic board + transistor + 2 resistors + solder → 3.',
    ],
    tasks: [have('transistor', 2), have('diode', 2), have('capacitor', 2)] },
  { id: 'm_discrete', chapter: 'MV', title: 'Discrete Circuit', req: ['m_components'], reward: M2,
    text: [
      'Discrete board + 2 transistors + 2 diodes + 2 capacitors + 2 resistors + solder → the **Discrete Circuit**, the MV circuit. Every MV machine and the MV battery buffer need two.',
    ],
    tasks: [have('circuit:discrete', 2)] },
  { id: 'm_kanthal', chapter: 'MV', title: 'Kanthal Coils', req: ['m_discrete', 'm_chromium'], reward: M2,
    text: [
      'Mixer: 3 iron + chromium + aluminium dust → 5 **Kanthal** dust; the EBF smelts it at 1800 K. Wiremill it, then 8 wire + aluminium foil → a **Kanthal coil** (2600 K).',
      'Any coil fits any coil slot, but a furnace runs at its **coolest** coil — swap all 16. Auto-fill uses your hottest coils first. Spare heat saves power: −5 % per full 900 K above what the recipe needs.',
      'Above 2000 K you can now smelt **chromium**, **vanadium** and other high-melting metals.',
    ],
    tasks: [have('struct:kanthal_coil', 16), flag('ebf_hot', 'Smelt above 2000 K')] },
  // ---- MV (P5e): environment ----
  { id: 'm_acid_rain', chapter: 'MV', title: 'Acid Rain', req: ['m_hull'], reward: M1,
    text: [
      'Pollution climbs in steps. **Haze** (300) browns the sky. **Blight** (800): trees wither — they stop cleaning the air and rubber trees give no resin. **Smog** (1500): machines run 25 % slower.',
      '**Acid rain** (3000): while it rains, machines with nothing over them slowly **corrode away**, and bare tin/copper **wire** dissolves fast. Put a **roof** (Base Build) or a floor above your machines and run insulated cable.',
      'Living trees soak up pollution — keep forests near your smoke stacks.',
    ],
    tasks: [flag('roof', 'Build a roof')] },
  { id: 'm_scrubber', chapter: 'MV', title: 'Scrubber', req: ['m_discrete', 'm_acid_rain'], reward: M2,
    text: [
      'The **Scrubber** washes the air of its chunk. Its controller stands in front of a 3×3, 3-high ring of **scrubber casing** (2 aluminium plates + steel frame + glass) around a hollow core, open on top. Energy + maintenance hatches; pipe water in through an input hatch.',
      '1000 L water + 1 **quicklime** dust → 1000 L wastewater every 10 s at 64 W, removing **40 pollution/s** from its chunk while it runs.',
    ],
    tasks: [build('scrubber'), flag('scrub', 'Scrub the air')] },
  { id: 'm_overclock', chapter: 'MV', title: 'Overclocking', req: ['m_discrete'], reward: M2,
    text: [
      'Every LV machine has an **MV version** (MV hull + 2 discrete circuits + 2 copper cables + the MV parts). It runs all the LV recipes, and **overclocks** them: one tier above the recipe means **2× speed for 4× power** — a 16 W recipe runs twice as fast at 64 W.',
      'It only overclocks while 4× still fits its 128 W input: recipes above 32 W run at normal speed. Faster, but each item costs twice the energy.',
    ],
    tasks: [flag('overclock', 'Run an overclocked recipe')] },
  { id: 'm_ehatch', chapter: 'MV', title: 'MV Energy Hatch', req: ['m_overclock'], reward: M2,
    text: [
      'An **MV Energy Hatch** (MV hull + 2 copper cables) takes 2 A at 128 V: **256 W**. Swap them into the EBF or the Hall–Héroult Cell and LV recipes overclock there too — two MV hatches run a 120 W recipe at 480 W, twice as fast.',
      'A multiblock overclocks to the tier of its **lowest** hatch, so swap them all.',
    ],
    tasks: [build('energy_hatch_mv', 2)] },
  { id: 'm_geothermal', chapter: 'power', tier: 'MV', title: 'Geothermal', req: ['m_motor', 'l_scanner_block'], reward: M2,
    text: [
      'Hot rock lies deep — at layer 18, about one hotspot per 256×256 tiles. Only the **scanner block** reaches that deep: its survey lists hotspots in range with distance and direction.',
      'A **Geothermal Generator** (MV hull + MV pump + 4 steel pipes + 2 aluminium plates + 2 copper cables) on a hotspot gives **128 W at 128 V**, day and night, no fuel — full at the centre, a quarter at the rim 10 tiles out.',
    ],
    tasks: [flag('hotspot', 'Find a hotspot'), build('geothermal_generator'), flag('geothermal_generator', 'Feed power at 128 V')] },
  { id: 'm_wastewater', chapter: 'chem', tier: 'MV', title: 'Water Treatment', req: ['m_discrete'], reward: M1,
    text: [
      'Wastewater is **toxic**: dumping it pollutes and poisons the ground. The **Water Treatment Plant** (MV) turns 1000 L wastewater into 900 L clean water at 64 W.',
    ],
    tasks: [build('water_treatment'), flag('treat', 'Treat wastewater')] },
  // ---- P5f player tools (logistics) ----
  { id: 'm_blueprint', chapter: 'logistics', tier: 'MV', title: 'Blueprints', req: ['m_hull'], reward: M1,
    text: [
      '**📋 Blueprint mode (Y).** **Copy:** tap two opposite corners — everything inside, from the viewed storey up, is saved with its rotation, channels, cut sides, recipes and side settings. Name it, and it stays in your save (up to 20).',
      '**Paste:** pick a blueprint, rotate it with **F**, and tap where its first corner goes. Each block comes out of your inventory; anything missing or in the way is skipped and listed, so you can fill the gaps and paste again on the same spot.',
    ],
    tasks: [flag('bp_copy', 'Copy an area'), flag('bp_paste', 'Paste a blueprint')] },
  { id: 'm_planner', chapter: 'logistics', tier: 'MV', title: 'Planner', req: ['m_hull'], reward: M1,
    text: [
      'The **📐 Planner** works out a production line: pick an item and a rate per minute and it expands the recipe tree — machines needed at base speed, power, raw inputs and byproducts. Tap a step to try another recipe or to treat it as a raw input. Open it from the top bar or the 📐 button on any item in the recipe browser.',
      '**Sketch** turns the plan into a blueprint: a row of machines per step with their recipes already set. Paste it and pipe it up.',
    ],
    tasks: [flag('planner', 'Open the planner'), flag('bp_sketch', 'Sketch a blueprint')] },
  { id: 'm_stats', chapter: 'logistics', tier: 'MV', title: 'Statistics', req: ['m_hull'], reward: M1,
    text: [
      '**📈 Statistics** shows what your factory did: power generated and used, total pollution, and every item and fluid made or used by machines per minute — over the last 10 minutes or the last hour. Tap an item for its graph. History starts fresh each time you load.',
    ],
    tasks: [flag('stats', 'Open statistics')] },
  // ---- 🌱 Farming (P5h): renewable wood and, by breeding, renewable ores ----
  { id: 'f_sapling', chapter: 'farm', tier: 'P', title: 'Saplings', req: ['flint_tools'], reward: P1,
    text: [
      'Felling a tree drops **saplings**. In **Machine Build**, pick a sapling and tap dry ground to plant it: it grows into a full tree in about 5 minutes (rubber trees take longer).',
      'Planted trees soak up pollution like wild ones once grown. Nothing can be built over a planted tree.',
    ],
    tasks: [flag('sapling', 'Plant a sapling')] },
  { id: 'f_tree', chapter: 'farm', tier: 'P', title: 'Tree Farm', req: ['f_sapling'], reward: P1,
    text: ['When it is grown, fell your planted tree in **Mining** mode with an axe: logs, sticks and new saplings. Replant and the wood never runs out.'],
    tasks: [flag('tree_farm', 'Fell a tree you planted')] },
  { id: 'f_seeds', chapter: 'farm', tier: 'P', title: 'Wild Seeds', req: ['gather'], reward: P1,
    text: [
      'Small **wild plants** grow on open land: **wheat** and **flax** on the plains, **reeds** in swamps and by the sea, **berry bushes** in forests and the tundra. Hover to see one; tap it in **Mining** mode for seeds and a first harvest.',
      'Wheat → straw, flax → fibre (crafting).',
    ],
    tasks: [flag('forage', 'Pick a wild plant')] },
  { id: 'f_planter', chapter: 'farm', tier: 'P', title: 'Planters', req: ['f_seeds'], reward: P1,
    text: [
      'Crops grow in a **planter** (planks + dirt). Place one, then — still in Machine Build — put **crop sticks** on it, then a **seed** on the sticks.',
      'A crop needs water nearby (sea, lake or river within 4 tiles) or rain, else it grows at half speed. When it is **mature**, tap the planter in **View** mode to harvest: it drops back to half grown and ripens again. Sometimes a seed comes back too.',
    ],
    tasks: [build('planter'), flag('plant_crop', 'Plant a seed on crop sticks'), flag('harvest', 'Harvest a crop')] },
  { id: 'f_cross', chapter: 'farm', tier: 'P', title: 'Cross-Breeding', req: ['f_planter'], reward: P2,
    text: [
      'Empty **crop sticks** next to two or more **mature** crops (side by side, same level) catch pollen: every so often the sticks sprout — a copy of a neighbour, or, if the pair crosses, a **new species**. Wheat × reed → **stonecrop**, reed × berry → **clayweed**, flax × berry → **coalcap**.',
      'Look up any seed in the recipe book (**Planter** recipes) to see what it crosses into. Keep breeding: stonecrop × coalcap leads to **ironleaf**.',
    ],
    tasks: [flag('cross', 'Breed a new species')] },
  { id: 'f_compost', chapter: 'farm', tier: 'P', title: 'Compost', req: ['f_planter'], reward: P1,
    text: ['8 wheat, reeds or berries → **compost** (by hand, or the steam compressor). Put it on a planter in Machine Build: **2× growth** for 10 minutes.'],
    tasks: [flag('compost', 'Compost a planter')] },
  { id: 'f_resource', chapter: 'farm', tier: 'S', title: 'Ironleaf', req: ['f_cross', 's_macerator'], reward: S2,
    text: [
      '**Resource crops** pull metal out of the ground — but only ripen with a **block of that metal** right under the planter (9 ingots; stack the planter on it). Without one they stall at three quarters grown.',
      '**Ironleaf** (stonecrop × coalcap) on a **block of iron**: its leaves macerate into small iron dust. Copperbloom and tinroot work the same way. Once your veins run dry, this is how a planet keeps giving.',
    ],
    tasks: [have('crop:ironleaf', 4)] },
  { id: 'f_harvester', chapter: 'farm', tier: 'LV', title: 'Harvester', req: ['f_tree', 'l_circuit'], reward: L1,
    text: [
      'The **Harvester** (LV, 16 W) harvests a mature crop or a grown planted tree within 4 tiles every 2 seconds into its output bag — pipe it away. It replants felled trees with saplings from its bag (or the ones it cuts).',
    ],
    tasks: [build('harvester'), flag('harvester', 'Let it harvest')] },
  { id: 'f_lv_crops', chapter: 'farm', tier: 'LV', title: 'Base Metals', req: ['f_resource'], reward: L1,
    text: ['Cross the steam-age resource crops: ironleaf × tinroot → **leadwort**, copperbloom × tinroot → **zincthistle**, ironleaf × copperbloom → **nickelvine**. Each needs its own metal block.'],
    tasks: [any(['seed:leadwort', 'seed:zincthistle', 'seed:nickelvine'], 1, 'Any LV crop seed')] },
  { id: 'f_manager', chapter: 'farm', tier: 'MV', title: 'Crop Manager', req: ['f_harvester', 'm_hull'], reward: M1,
    text: ['The **Crop Manager** (MV, 32 W) tends planters within 4 tiles: crop sticks on bare planters (so crops keep spreading and crossing) and compost when it runs out. Feed it both by pipe.'],
    tasks: [build('crop_manager'), flag('crop_manager', 'Let it tend a planter')] },
  { id: 'f_gold', chapter: 'farm', tier: 'MV', title: 'Goldenrod', req: ['f_lv_crops'], reward: M2,
    text: ['Leadwort × copperbloom → **silverbell** (silver block); silverbell × zincthistle → **goldenrod** (gold block). Precious metals from a field.'],
    tasks: [have('crop:goldenrod', 1)] },
  { id: 'm_lithium', chapter: 'chem', tier: 'MV', title: 'Lithium', req: ['m_hull', 'l_acid'], reward: M1,
    text: [
      '**Spodumene** (pegmatite veins under desert and tundra) holds lithium. **Chemical reactor:** spodumene dust + 1000 L sulfuric acid → **lithium sulfate** solution, leaving quartz behind.',
      '**Electrolyzer:** the solution → **lithium dust**, with the sulfuric acid back and some oxygen.',
    ],
    tasks: [have('dust:lithium', 2)] },
  { id: 'm_battery', chapter: 'power', tier: 'MV', title: 'Lithium Battery', req: ['m_lithium', 'l_battery_buffer', 'm_discrete'], reward: M2,
    text: [
      'An aluminium **battery case** (assembler) canned with 2 lithium dust is a **Lithium Battery**: 144 kJ, four lead-acid batteries\' worth.',
      'The **MV Battery Buffer** holds 4 of them and moves 128 W per battery at 128 V. It takes lithium batteries only.',
    ],
    tasks: [have('battery:lithium'), build('battery_buffer_mv')] },
  { id: 'm_contact', chapter: 'chem', tier: 'MV', title: 'Contact Process', req: ['m_overclock', 'l_acid'], reward: M2,
    text: [
      'Roast vanadium dust in oxygen → a **vanadium pentoxide catalyst**. In an **MV chemical reactor** (the step needs 64 W) it turns SO₂ + O₂ into **SO₃**; SO₃ into water → sulfuric acid.',
      'Four times the acid per minute of the uncatalysed reactor. The catalyst is kept and wears out 1 % per run.',
    ],
    tasks: [have('catalyst:vanadium_pentoxide'), flag('sulfur_trioxide', 'Make SO₃')] },
  { id: 'm_chromium', chapter: 'chem', tier: 'MV', title: 'Chromium', req: ['m_hall', 'l_chloralkali'], reward: M2,
    text: [
      'Chemical reactor: 2000 L NaOH + 1000 L CO₂ → **soda ash**. Roast chromite dust + 2 soda ash in oxygen → 2 **sodium chromate**; sulfuric acid turns 2 of those into **sodium dichromate** (the sodium sulfate leaves as wastewater).',
      'Roast dichromate with 2 coal dust → **chromium oxide** + 1 soda ash back. Then the **thermite** step in the EBF: Cr₂O₃ + 2 aluminium dust → 2 **chromium dust** + alumina for the Hall–Héroult cell (96 W: two energy hatches).',
    ],
    tasks: [have('dust:soda_ash'), have('dust:chromium', 4)] },
];
export const QUEST = new Map(QUESTS.map((q) => [q.id, q]));
/** Every quest id a quest's requirements mention (any-of groups flattened). */
export const reqIds = (q: QuestDef) => q.req.flat();
/** A quest's tier: topic quests carry one, tier chapters are their tier. */
export const tierOf = (q: QuestDef): TierId => q.tier ?? (q.chapter as TierId);

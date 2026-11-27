// Quest book (DESIGN §8, CONTENT §11f). Hand-written; doubles as the tutorial: every mechanic is explained by the quest
// that first needs it. Quests unlock when all `req` are done.
// Tasks: `have` = hold n (summed over ids, inventory + tool slots) · `build` = n placed structures · `flag` = an action
// done at least once (FLAGS; set by the sim for commands, by the UI for camera/panels).
import { MINERALS } from './minerals';
import type { TierId } from './tiers';

/** Action flags. Sim-set: mine chop sample craft move place stack upper base demolish prospect mload mfuel mtake crank mfill
 * mdump open claim mface cput tap thump lboiler. UI-set (`UI_FLAGS`, via the `flag` command): the rest. */
export const UI_FLAGS = ['pan', 'zoom', 'rotate', 'level_down', 'level_up', 'map', 'globe', 'pause', 'bag', 'search', 'uses',
  'bookmark', 'journal', 'overlay', 'machine', 'pipe_overlay', 'poll_overlay', 'alerts'] as const;

export const SIM_FLAGS = ['mine', 'chop', 'sample', 'craft', 'move', 'place', 'stack', 'upper', 'base', 'demolish', 'prospect', 'mload',
  'mfuel', 'mtake', 'crank', 'mfill', 'mdump', 'open', 'qclaim', 'mface', 'cput', 'tap', 'thump', 'lboiler'] as const;

export type QuestTask =
  | { k: 'have'; ids: string[]; n: number; label?: string }
  | { k: 'build'; id: string; n: number }
  | { k: 'flag'; id: string; label: string };
export interface QuestDef {
  id: string; chapter: TierId; title: string;
  /** Paragraphs; **bold** marks controls and key terms. */
  text: string[];
  req: string[];
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
  { id: 's_items', chapter: 'S', title: 'Item Pipes', req: ['s_furnace'], reward: S2,
    text: [
      '**Tin Item Pipes** (3 tin plates + a tin ring) move items between machines. Like fluid pipes they join on all 6 sides; item and fluid pipes never join each other.',
      'Twice a second every machine on the network sends what it has made (up to 4 items each time) to the **nearest** machine that wants it: a recipe input, fuel for a furnace or boiler, or a **chest**. No more collecting by hand — chain a macerator into a furnace into a chest.',
      'A **Wooden Chest** (27 slots) is now a real inventory: tap it to look inside, put stacks in or take everything out.',
      'Every machine has **6 sides** (east, west, south, north, up, down). Open **Sides** in its panel and tap a side to cycle it: **Auto** (takes what it needs, sends what it makes), **In**, **Out** or **Off**. Chests only take items on Auto; set a chest side to **Out** to empty it down a pipe. Sides also apply to fluid pipes.',
    ],
    tasks: [build('tin_item_pipe', 4), build('chest'), flag('mface', 'Set a machine side')] },
  { id: 's_barrel', chapter: 'S', title: 'Buffers', req: ['s_boiler'], reward: S1,
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
  { id: 's_pump', chapter: 'S', title: 'Steam Pump', req: ['s_boiler'], reward: S1,
    text: [
      'The **Steam Pump** draws 40 L of water per tick, four times the water pump, for 4 L of steam per tick. Like the water pump it must stand next to water. Connect a steam pipe and a water pipe to different sides.',
    ],
    tasks: [build('steam_pump')] },
  { id: 's_thumper', chapter: 'S', title: 'Deep Survey', req: ['s_boiler'], reward: S2,
    text: [
      'The prospector\'s hammer only hears veins down to layer 8. The **Steam Thumper** (hull + 2 pistons + steel rod) pounds the ground for 20 seconds on 16 L of steam per tick, then surveys every vein within **48 tiles** down to **layer 16** — the deep slot.',
      'It surveys once. Demolish it and build it somewhere else to survey there.',
    ],
    tasks: [build('steam_thumper'), flag('thump', 'Finish a thumper survey')] },
  { id: 's_excavator', chapter: 'S', title: 'Steam Excavator', req: ['s_thumper', 's_items'], reward: S2,
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
  { id: 's_hp_boiler', chapter: 'S', title: 'High Pressure', req: ['s_steel_hull'], reward: S1,
    text: [
      'The **High-Pressure Steel Boiler** (steel hull + 8 fire bricks + 2 bronze pipes) runs hotter (600 K) and makes **2.5×** the steam of the small boiler — 30 L/tick — but burns fuel twice as fast.',
      'Everything else is the same: water in, steam out, and never let it run dry while hot.',
    ],
    tasks: [build('hp_boiler')] },
  { id: 's_solar', chapter: 'S', title: 'Sunshine', req: ['s_boiler'], reward: S1,
    text: [
      'The **Solar Boiler** (bronze hull + 4 glass panes + 2 silver plates) burns nothing: sunlight heats it. It is weak (6 L/tick at most), makes nothing at night and less in rain, but it never needs feeding.',
      'It still boils water, so it still explodes if water hits it while it is dry and hot.',
    ],
    tasks: [build('solar_boiler')] },
  { id: 's_large_boiler', chapter: 'S', title: 'Large Boiler', req: ['s_hp_boiler', 's_items'], reward: S2,
    text: [
      'The **Large Boiler** is the steam age\'s great machine: **120 L/tick** of steam at 800 K, burning fuel 8× as fast as a small boiler. Its controller (steel hull + 8 fire bricks + 4 bronze pipes) sits at the **front** of a 3×3×3 block: a floor of 8 **Steel Firebox Casings**, then two layers of **Bronze Plated Bricks** around a **Bronze Pipe Casing** core.',
      '**Rotation:** press **F** (or ↻ in the build bar) before placing — the ghost shows the whole footprint and which way the front faces. The structure is built **behind** the controller.',
      '**Hatches:** big multiblocks don\'t take pipes on just any casing. Any **outer** casing can be swapped for a hatch: a **Bronze Input Hatch** (water in), a **Bronze Output Hatch** (steam out) and, if you like, a **Bronze Input Bus** (fuel by item pipe). It needs at least one input and one output hatch. Place the hatches first, then **Auto-fill** the rest.',
    ],
    tasks: [build('large_boiler'), flag('lboiler', 'Run a complete Large Boiler')] },
];
export const QUEST = new Map(QUESTS.map((q) => [q.id, q]));

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
- Stack: TS, Vite, Three.js (ortho iso + globe), Preact UI, sim Web Worker 20 TPS, IndexedDB, Vitest, GH Pages PWA. Desktop + mobile.
- Art: voxel (16³/tile), procedural, greedy-meshed. No sound yet.
- Overseer: no avatar, no enemies. Global inventory across planets.
- No belts. No offline progress. Pause only, no fast-forward.
- Overvoltage explodes machines; dry-boiler refill explodes.
- No GTNH-specific names (tiers/materials).

## Code layout (planned)
`src/{data,content,sim,world,render,ui,save}`, `tools/` (validator).

## Status
- Planning complete. Next: **P0 Foundation**.

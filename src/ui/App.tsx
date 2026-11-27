import { useEffect, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Game } from '../game';
import { LEVEL_MAX, LEVEL_MIN, type Act, type Renderer, type View } from '../render/renderer';
import * as store from '../save/store';
import type { MachView, SimStats } from '../sim/client';
import { controllerAt, controllerInStorey } from '../sim/machines';
import type { ActResult, SlotRef } from '../sim/player';
import { nearSide, STRUCT, type BaseKind } from '../sim/build';
import { BuildBar } from './BuildBar';
import { bytes, duration, gameClock, levelName, weatherText } from './format';
import { hoverItem, Inventory } from './Inventory';
import { Recipes, type Look } from './Recipes';
import { Machine } from './Machine';
import { Veins } from './Veins';

const ACTS: [Act, string, string, boolean][] = [
  ['view', '👁', 'View (V)', true],
  ['build', '🏭', 'Machine Build (B)', true],
  ['base', '🧱', 'Base Build (N)', true],
  ['demolish', '💥', 'Demolition (Z)', true],
  ['mine', '⛏', 'Mining (X)', true],
];

interface Feed { id: number; text: string; err?: boolean }
let feedId = 0;

export function App({ game, renderer }: { game: Game; renderer: Renderer }) {
  const [view, setView] = useState<View>({ ...renderer.view });
  const [hover, setHover] = useState<string | null>(null);
  const [stats, setStats] = useState<SimStats>(game.sim.stats);
  const [menu, setMenu] = useState(false);
  const [saves, setSaves] = useState<store.SaveMeta[]>([]);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [act, setAct] = useState<Act>(renderer.act);
  const [inv, setInv] = useState({ inv: game.sim.inv, tools: game.sim.tools });
  const [bag, setBag] = useState(false);
  const [sel, setSel] = useState<SlotRef | null>(null);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [dig, setDig] = useState<string | null>(null);
  const [book, setBook] = useState(false);
  const [look, setLook] = useState<Look | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [rot, setRot] = useState(0);
  const [baseKind, setBaseKind] = useState<BaseKind>('floor');
  const [mineTool, setMineTool] = useState<'dig' | 'prospect'>('dig');
  const [journal, setJournal] = useState(false);
  const [, setVeinTick] = useState(0);
  const [machKey, setMachKey] = useState<string | null>(null);
  const [machView, setMachView] = useState<MachView | null>(null);
  const openMach = (k: string | null) => {
    setMachKey(k); setMachView(null); game.sim.watch(k);
    if (k) { setJournal(false); setBook(false); setBag(false); setMenu(false); } else renderer.setGhosts({});
  };
  const openLook = (l: Look) => { setLook(l); setBook(true); setBag(false); setMenu(false); setSel(null); };

  const refresh = () => store.list().then(setSaves).catch(() => setSaves([]));
  const push = (text: string, err?: boolean) => {
    const f = { id: feedId++, text, err };
    setFeed((l) => (l.some((x) => x.text === text) ? l : [...l.slice(-3), f]));
    setTimeout(() => setFeed((l) => l.filter((x) => x !== f)), 2200);
  };
  useEffect(() => {
    game.sim.onStats = (st) => { setStats(st); renderer.setStatuses(st.ms); };
    game.sim.onMach = (mv) => {
      setMachView(mv);
      const casing = mv.m && renderer.entities[mv.key] ? STRUCT.get(renderer.entities[mv.key].s)?.multi?.casing : undefined;
      renderer.setGhosts(casing ? Object.fromEntries(mv.miss.map((k) => [k, casing])) : {});
    };
    game.onChange = refresh;
    game.onToast = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 2500); };
    const prevWorld = game.onWorld;
    game.onWorld = (s) => { prevWorld?.(s); setInv({ inv: s.inv, tools: s.tools }); };
    game.sim.onAct = (r: ActResult) => {
      if (r.changes) renderer.applyChanges(r.changes);
      if (r.ents || r.base) renderer.applyBuild(r.ents, r.base);
      if (r.veins && Object.keys(r.veins).length) { renderer.applyVeins(r.veins); setTimeout(() => setVeinTick((t) => t + 1), 50); }
      setInv({ inv: game.sim.inv, tools: game.sim.tools });
      setDig(r.progress && r.target ? `${r.target} ${r.progress[0]}/${r.progress[1]}` : null);
      const reg = registry();
      for (const g of r.gained ?? []) push(`+${g.n} ${reg.item(g.id)?.name ?? g.id}`);
      if (r.msg) push(r.msg, !r.ok);
    };
    renderer.onView = setView;
    renderer.onHover = setHover;
    refresh();
  }, [game, renderer]);

  const pickAct = (a: Act) => {
    renderer.act = a; setAct(a); setDig(null);
    // Mining works at the surface and below; building at the surface and above.
    if ((a === 'mine' && renderer.view.level > 0) || ((a === 'build' || a === 'base' || a === 'demolish') && renderer.view.level < 0)) renderer.setLevel(0);
  };

  // Tile clicks + ghost preview for the active mode.
  useEffect(() => {
    renderer.ghost = act === 'build' && buildId ? { kind: 'struct', id: buildId.replace('struct:', ''), r: rot }
      : act === 'base' ? { kind: 'base', part: baseKind } : act === 'demolish' ? { kind: 'demolish' } : null;
    renderer.onTile = (x, y, level, fx, fy, block) => {
      const say = (m: string) => push(m, true);
      if (act === 'view') {
        // The visible block under the pointer first (e.g. the top of a tall multiblock seen from an upper level).
        const [bx, by, bb] = block?.split(',').map(Number) ?? [];
        const k = (block ? controllerAt(renderer.entities, renderer.width, bx, by, bb) : null)
          ?? (level >= 0 ? controllerInStorey(renderer.entities, renderer.width, x, y, level) : null);
        return k ? openMach(k) : undefined;
      }
      if (act === 'mine' && mineTool === 'prospect') return game.sim.cmd({ k: 'prospect', x, y });
      if (act === 'mine') return level > 0 ? say('Mining works at the surface and below') : game.sim.cmd({ k: 'mine', x, y, z: -level });
      if (level < 0) return say('Build at the surface or above');
      if (act === 'build') return buildId ? game.sim.cmd({ k: 'place', id: buildId, x, y, f: level, r: rot }) : say('Pick a structure to place');
      if (act === 'base') return game.sim.cmd({ k: 'base', kind: baseKind, x, y, f: level, side: nearSide(fx, fy) });
      if (act === 'demolish') {
        const edge = Math.min(fx, fy, 1 - fx, 1 - fy) < 0.22;
        game.sim.cmd({ k: 'demolish', x, y, f: level, side: edge ? nearSide(fx, fy) : undefined });
      }
    };
  }, [act, buildId, rot, baseKind, mineTool]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); game.togglePause(); }
      if (e.code === 'Escape') setMenu((m) => !m);
      if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); setBag((b) => !b); setBook(false); setSel(null); }
      if (e.code === 'KeyC') { setBook((b) => !b); setBag(false); }
      if ((e.code === 'KeyR' || e.code === 'KeyU') && hoverItem) openLook({ id: hoverItem, tab: e.code === 'KeyR' ? 'recipes' : 'uses' });
      if (e.code === 'KeyV') pickAct('view');
      if (e.code === 'KeyX') pickAct('mine');
      if (e.code === 'KeyB') pickAct('build');
      if (e.code === 'KeyN') pickAct('base');
      if (e.code === 'KeyZ') pickAct('demolish');
      if (e.code === 'KeyF') setRot((r) => (r + 1) % 4);
      if (e.code === 'KeyO') renderer.toggleVeins();
      if (e.code === 'KeyJ') setJournal((j) => !j);
      if (e.code === 'KeyP') { pickAct('mine'); setMineTool((m) => (m === 'prospect' ? 'dig' : 'prospect')); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [game]);

  const reg = registry();
  const pick = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.ifgsave';
    i.onchange = () => i.files?.[0] && game.importSave(i.files[0]);
    i.click();
  };
  const iso = view.mode === 'iso';

  return (
    <>
      <div class="rotate">⟲ Rotate your device to landscape</div>
      <div class="top">
        <button onClick={() => game.togglePause()} title="Space">{stats.paused ? '▶' : '❚❚'}</button>
        <span>{gameClock(stats.tick)}</span>
        <span>{weatherText(stats)}</span>
        <span class="dim tps">{stats.paused ? 'Paused' : `${stats.tps} TPS · ${stats.mspt.toFixed(2)} ms`}</span>
        <span class="grow" />
        {iso && <button onClick={() => renderer.rotate(-1)} title="Q">⟲</button>}
        {iso && <button onClick={() => renderer.rotate(1)} title="E">⟳</button>}
        <button class={iso ? 'on' : ''} onClick={() => renderer.setMode('iso')}>Local</button>
        <button class={view.mode === 'map' ? 'on' : ''} onClick={() => renderer.setMode('map')} title="M">Map</button>
        <button class={view.mode === 'globe' ? 'on' : ''} onClick={() => renderer.setMode('globe')} title="G">Globe</button>
        <button class={journal ? 'on' : ''} onClick={() => { setJournal(!journal); setMenu(false); }} title="Veins (J) · overlay O">◎ Veins</button>
        <button onClick={() => { setMenu(!menu); setBook(false); setJournal(false); }} title="Esc">☰</button>
      </div>
      {menu && (
        <div class="panel">
          <h3>Save</h3>
          <div class="row">
            <button class="primary" onClick={() => game.saveManual()}>Save now</button>
            <button onClick={() => game.exportSave()}>Export</button>
            <button onClick={pick}>Import</button>
          </div>
          <h3>Saves & backups</h3>
          <ul class="saves">
            {saves.map((s) => (
              <li key={s.key}>
                <span>
                  {s.kind === 'manual' ? 'Manual' : 'Auto'} · {new Date(s.savedAt).toLocaleString()}
                  <br />
                  <span class="dim">{duration(s.tick)} played · {bytes(s.size)}</span>
                </span>
                <button onClick={() => game.loadKey(s.key)}>Load</button>
              </li>
            ))}
            {!saves.length && <li class="dim">No saves yet</li>}
          </ul>
          <h3>World</h3>
          <div class="row">
            <button onClick={() => confirm('Start a new world? Current world is backed up first.') && game.newGame()}>New world</button>
          </div>
          <h3>Debug</h3>
          <div class="row">
            <label><input type="checkbox" checked={view.xray} onChange={() => renderer.toggleXray()} /> X-ray ores (dev)</label>
            <button onClick={() => game.sim.cmd({ k: 'devkit' })}>Dev kit: structures + materials</button>
          </div>
          <h3>Content</h3>
          <div class="dim">{reg.items.length} items · {reg.fluids.length} fluids · {reg.recipes.length} recipes</div>
        </div>
      )}
      {iso && !menu && (
        <div class="modebar">
          {ACTS.map(([a, icon, name, on]) => (
            <button key={a} class={act === a ? 'on' : ''} disabled={!on} onClick={() => pickAct(a)} title={name}>{icon}</button>
          ))}
        </div>
      )}
      {iso && !menu && !book && !bag && act === 'mine' && (
        <div class="buildbar">
          <button class={mineTool === 'dig' ? 'on' : ''} onClick={() => setMineTool('dig')} title="Dig (tap to mine; picks up ore samples)">⛏ <span class="lbl">dig</span></button>
          <button class={mineTool === 'prospect' ? 'on' : ''} disabled={!inv.tools.some((t) => t?.id.startsWith('tool:prospector'))}
            onClick={() => setMineTool('prospect')} title="Prospect (P) — needs a prospector's hammer">🔍 <span class="lbl">prospect</span></button>
          <span class="dim">{mineTool === 'prospect' ? 'Tap to survey veins within 24 tiles, to layer 8' : 'Coloured rocks on the ground are ore samples — tap to pick up'}</span>
        </div>
      )}
      {journal && renderer.world && (
        <Veins gen={renderer.world} list={renderer.veinList} at={view} overlay={view.veins} onOverlay={() => renderer.toggleVeins()}
          onFly={(x, y) => { renderer.flyTo(x, y); setJournal(false); }} onClose={() => setJournal(false)} />
      )}
      {iso && !menu && !book && !bag && (act === 'build' || act === 'base' || act === 'demolish') && (
        <BuildBar act={act} inv={inv.inv} buildId={buildId} onBuildId={setBuildId} rot={rot} onRot={() => setRot((r) => (r + 1) % 4)}
          baseKind={baseKind} onBaseKind={setBaseKind} onBook={() => { setLook(null); setBook(true); setBag(false); }} />
      )}
      {machKey && !book && !menu && !journal && renderer.entities[machKey] && (
        <Machine ent={renderer.entities[machKey]} view={machView?.key === machKey ? machView : null} inv={inv}
          onCmd={(c) => game.sim.cmd(c)} onLook={openLook} onClose={() => openMach(null)} />
      )}
      {iso && !menu && !book && !journal && !(machKey && renderer.entities[machKey]) && (
        <div class="zbar">
          <span class="zlabel">{levelName(view.level)}</span>
          <button onClick={() => renderer.setLevel(view.level + 1)} title="] / PgUp">▲</button>
          <input type="range" min={LEVEL_MIN} max={LEVEL_MAX} step={1} value={view.level}
            onInput={(e) => renderer.setLevel(Number((e.target as HTMLInputElement).value))} />
          <button onClick={() => renderer.setLevel(view.level - 1)} title="[ / PgDn">▼</button>
          <button onClick={() => renderer.setLevel(0)} title="Surface">⌂</button>
        </div>
      )}
      <Inventory inv={inv.inv} tools={inv.tools} open={bag} sel={sel} onSel={setSel}
        onMove={(a, b) => game.sim.cmd({ k: 'move', a, b })} onTrash={(a) => game.sim.cmd({ k: 'trash', a })}
        onToggle={() => { setBag(!bag); setBook(false); setSel(null); }} onLook={openLook}
        recipesOpen={book} onRecipes={() => { setBook(!book); setBag(false); setMenu(false); }} />
      {book && <Recipes inv={inv} look={look} onLook={setLook} onCraft={(recipe, n) => game.sim.cmd({ k: 'craft', recipe, n })} onClose={() => setBook(false)} />}
      <div class="feed">
        {dig && <div class="dig">⛏ {dig}</div>}
        {feed.map((f) => <div key={f.id} class={f.err ? 'err' : ''}>{f.text}</div>)}
      </div>
      {hover && <div class="hover">{hover}</div>}
      {toast && <div class={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  );
}

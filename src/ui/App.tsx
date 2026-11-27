import { useEffect, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Game } from '../game';
import { LEVEL_MAX, LEVEL_MIN, type Act, type Renderer, type View } from '../render/renderer';
import * as store from '../save/store';
import type { SimStats } from '../sim/client';
import type { ActResult, SlotRef } from '../sim/player';
import { bytes, duration, gameClock, levelName, weatherText } from './format';
import { Inventory } from './Inventory';

const ACTS: [Act, string, string, boolean][] = [
  ['view', '👁', 'View', true],
  ['build', '🏭', 'Machine Build (P2)', false],
  ['base', '🧱', 'Base Build (P2)', false],
  ['demolish', '💥', 'Demolition (P2)', false],
  ['mine', '⛏', 'Mining', true],
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

  const refresh = () => store.list().then(setSaves).catch(() => setSaves([]));
  const push = (text: string, err?: boolean) => {
    const f = { id: feedId++, text, err };
    setFeed((l) => (l.some((x) => x.text === text) ? l : [...l.slice(-3), f]));
    setTimeout(() => setFeed((l) => l.filter((x) => x !== f)), 2200);
  };
  useEffect(() => {
    game.sim.onStats = setStats;
    game.onChange = refresh;
    game.onToast = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 2500); };
    const prevWorld = game.onWorld;
    game.onWorld = (s) => { prevWorld?.(s); setInv({ inv: s.inv, tools: s.tools }); };
    game.sim.onAct = (r: ActResult) => {
      if (r.changes) renderer.applyChanges(r.changes);
      setInv({ inv: game.sim.inv, tools: game.sim.tools });
      setDig(r.progress && r.target ? `${r.target} ${r.progress[0]}/${r.progress[1]}` : null);
      const reg = registry();
      for (const g of r.gained ?? []) push(`+${g.n} ${reg.item(g.id)?.name ?? g.id}`);
      if (r.msg) push(r.msg, !r.ok);
    };
    renderer.onView = setView;
    renderer.onHover = setHover;
    renderer.onTile = (x, y, z) => { if (renderer.act === 'mine') game.sim.cmd({ k: 'mine', x, y, z }); };
    refresh();
  }, [game, renderer]);

  const pickAct = (a: Act) => { renderer.act = a; setAct(a); setDig(null); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); game.togglePause(); }
      if (e.code === 'Escape') setMenu((m) => !m);
      if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); setBag((b) => !b); setSel(null); }
      if (e.code === 'KeyV') pickAct('view');
      if (e.code === 'KeyX') pickAct('mine');
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
        <button onClick={() => setMenu(!menu)} title="Esc">☰</button>
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
      {iso && !menu && (
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
        onToggle={() => { setBag(!bag); setSel(null); }} />
      <div class="feed">
        {dig && <div class="dig">⛏ {dig}</div>}
        {feed.map((f) => <div key={f.id} class={f.err ? 'err' : ''}>{f.text}</div>)}
      </div>
      {hover && <div class="hover">{hover}</div>}
      {toast && <div class={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  );
}

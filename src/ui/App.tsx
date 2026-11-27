import { useEffect, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Game } from '../game';
import { LEVEL_MAX, LEVEL_MIN, type Renderer, type View } from '../render/renderer';
import * as store from '../save/store';
import type { SimStats } from '../sim/client';
import { bytes, duration, gameClock, levelName, weatherText } from './format';

export function App({ game, renderer }: { game: Game; renderer: Renderer }) {
  const [view, setView] = useState<View>({ ...renderer.view });
  const [hover, setHover] = useState<string | null>(null);
  const [stats, setStats] = useState<SimStats>(game.sim.stats);
  const [menu, setMenu] = useState(false);
  const [saves, setSaves] = useState<store.SaveMeta[]>([]);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  const refresh = () => store.list().then(setSaves).catch(() => setSaves([]));
  useEffect(() => {
    game.sim.onStats = setStats;
    game.onChange = refresh;
    game.onToast = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 2500); };
    renderer.onView = setView;
    renderer.onHover = setHover;
    refresh();
  }, [game, renderer]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); game.togglePause(); }
      if (e.code === 'Escape') setMenu((m) => !m);
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

  return (
    <>
      <div class="top">
        <button onClick={() => game.togglePause()} title="Space">{stats.paused ? '▶' : '❚❚'}</button>
        <span>{gameClock(stats.tick)}</span>
        <span>{weatherText(stats)}</span>
        <span class="dim tps">{stats.paused ? 'Paused' : `${stats.tps} TPS · ${stats.mspt.toFixed(2)} ms`}</span>
        <span class="grow" />
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
      {view.mode === 'iso' && (
        <div class="zbar">
          <span class="zlabel">{levelName(view.level)}</span>
          <button onClick={() => renderer.setLevel(view.level + 1)} title="] / PgUp">▲</button>
          <input type="range" min={LEVEL_MIN} max={LEVEL_MAX} step={1} value={view.level}
            onInput={(e) => renderer.setLevel(Number((e.target as HTMLInputElement).value))} />
          <button onClick={() => renderer.setLevel(view.level - 1)} title="[ / PgDn">▼</button>
          <button onClick={() => renderer.setLevel(0)} title="Surface">⌂</button>
        </div>
      )}
      <div class="viewbar">
        {view.mode === 'iso' && <button onClick={() => renderer.rotate(-1)} title="Q">⟲</button>}
        {view.mode === 'iso' && <button onClick={() => renderer.rotate(1)} title="E">⟳</button>}
        <button class={view.mode === 'iso' ? 'on' : ''} onClick={() => renderer.setMode('iso')}>Local</button>
        <button class={view.mode === 'map' ? 'on' : ''} onClick={() => renderer.setMode('map')} title="M">Map</button>
        <button class={view.mode === 'globe' ? 'on' : ''} onClick={() => renderer.setMode('globe')} title="G">Globe</button>
      </div>
      {hover && <div class="hover">{hover}</div>}
      {toast && <div class={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  );
}

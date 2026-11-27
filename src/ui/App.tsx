import { useEffect, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Game } from '../game';
import * as store from '../save/store';
import type { SimStats } from '../sim/client';
import { bytes, duration, gameClock } from './format';

export function App({ game }: { game: Game }) {
  const [stats, setStats] = useState<SimStats>(game.sim.stats);
  const [menu, setMenu] = useState(false);
  const [saves, setSaves] = useState<store.SaveMeta[]>([]);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  const refresh = () => store.list().then(setSaves).catch(() => setSaves([]));
  useEffect(() => {
    game.sim.onStats = setStats;
    game.onChange = refresh;
    game.onToast = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 2500); };
    refresh();
  }, [game]);

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
        <span class="dim">{stats.paused ? 'Paused' : `${stats.tps} TPS · ${stats.mspt.toFixed(2)} ms`}</span>
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
          <h3>Content</h3>
          <div class="dim">{reg.items.length} items · {reg.fluids.length} fluids · {reg.recipes.length} recipes</div>
        </div>
      )}
      {toast && <div class={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  );
}

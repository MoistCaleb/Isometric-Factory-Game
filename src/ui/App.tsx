import { useEffect, useState } from 'preact/hooks';
import { registry } from '../content/registry';
import type { Game } from '../game';
import { LEVEL_MAX, LEVEL_MIN, type Act, type Renderer, type View } from '../render/renderer';
import * as store from '../save/store';
import type { MachView, SimStats } from '../sim/client';
import { controllerAt, controllerInStorey, machineAt, MS, MS_TEXT } from '../sim/machines';
import { HAZE, pollKey, SMOG } from '../sim/pollution';
const pollAt = (pl: Record<string, number> | undefined, key: string) => { const [x, y] = key.split(',').map(Number); return pl?.[pollKey(x, y)] ?? 0; };
import { STOREY } from '../sim/state';
import type { ActResult, SlotRef } from '../sim/player';
import { nearSide, type BaseKind } from '../sim/build';
import { BuildBar } from './BuildBar';
import { bytes, duration, gameClock, levelName, weatherText } from './format';
import { hoverItem, Inventory } from './Inventory';
import { Conduit } from './Conduit';
import { isConduit } from '../data/structures';
import { Recipes, type Look } from './Recipes';
import { Machine } from './Machine';
import { Veins } from './Veins';
import { claimable, Quests } from './Quests';
import { QUEST, type UI_FLAGS } from '../data/quests';
import { QDONE } from '../sim/quests';

const ACTS: [Act, string, string, boolean][] = [
  ['view', '👁', 'View (V)', true],
  ['build', '🏭', 'Machine Build (B)', true],
  ['base', '🧱', 'Base Build (N)', true],
  ['demolish', '💥', 'Demolition (Z)', true],
  ['mine', '⛏', 'Mining (X)', true],
];

interface Feed { id: number; text: string; err?: boolean }
let feedId = 0;
/** Last quest state seen (completion toasts). */
let lastQ: Record<string, number> | null = null;
/** Tutorial flags already sent this session. */
const sentFlags = new Set<string>();
let lastView: View | null = null, lastPaused: boolean | null = null;

/** Alerts (DESIGN §8): machines stuck in a bad status for ALERT_MS, plus explosions. Tap one to fly there. */
export interface Alert { key: string; st: number; msg: string; t: number; boom?: boolean }
const BAD: number[] = [MS.noFuel, MS.full, MS.noWater, MS.noWaterIn, MS.dry, MS.noSteam, MS.minedOut, MS.noSun, MS.noPower];
const ALERT_MS = 3000;
/** First time each machine was seen in its current bad status (`key` → [status, ms]). */
const badSince = new Map<string, [number, number]>();

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
  /** Open pipe/cable panel · channel for new pipes/cables. */
  const [conKey, setConKey] = useState<string | null>(null);
  const [ch, setCh] = useState(0);
  const [machView, setMachView] = useState<MachView | null>(null);
  const [qbook, setQbook] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [booms, setBooms] = useState<Alert[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [ovOpen, setOvOpen] = useState(false);
  const openMach = (k: string | null) => {
    setMachKey(k); setMachView(null); game.sim.watch(k); renderer.setSelected(k);
    if (k) { setJournal(false); setBook(false); setBag(false); setMenu(false); } else renderer.setGhosts({});
  };
  const flag = (id: (typeof UI_FLAGS)[number]) => { if (!sentFlags.has(id)) { sentFlags.add(id); game.sim.cmd({ k: 'flag', id }); } };
  const openLook = (l: Look) => { setLook(l); setBook(true); setBag(false); setMenu(false); setSel(null); };

  const refresh = () => store.list().then(setSaves).catch(() => setSaves([]));
  const push = (text: string, err?: boolean) => {
    const f = { id: feedId++, text, err };
    setFeed((l) => (l.some((x) => x.text === text) ? l : [...l.slice(-3), f]));
    setTimeout(() => setFeed((l) => l.filter((x) => x !== f)), 2200);
  };
  useEffect(() => {
    game.sim.onStats = (st) => {
      setStats(st); renderer.setStatuses(st.ms); renderer.setPollution(st.pl); renderer.setPowerLoad(st.pn);
      const now = performance.now(), list: Alert[] = [];
      for (const [k, s] of Object.entries(st.ms ?? {})) {
        const ma = machineAt(renderer.entities, k);
        // A full boiler is just idling; a solar boiler waiting for sunshine at night is normal.
        const bad = BAD.includes(s) && !(ma?.def.run === 'boiler' && (s === MS.full || s === MS.noSun));
        if (!bad) { badSince.delete(k); continue; }
        const b = badSince.get(k);
        if (!b || b[0] !== s) { badSince.set(k, [s, now]); continue; }
        if (now - b[1] < ALERT_MS) continue;
        const msg = `${ma?.st.name ?? 'Machine'}: ${MS_TEXT[s]}`;
        if (now - b[1] < ALERT_MS + 300) push(`⚠ ${msg}`, true);
        list.push({ key: k, st: s, msg, t: b[1] });
      }
      for (const k of badSince.keys()) if (!st.ms?.[k]) badSince.delete(k);
      setAlerts(list);
      if (st.q && lastQ) for (const [id, v] of Object.entries(st.q)) if (v === QDONE && !lastQ[id]) push(`Quest complete: ${QUEST.get(id)?.title ?? id} — claim it in the quest book (L)`);
      if (st.q) lastQ = st.q;
      if (lastPaused === false && st.paused) flag('pause');
      lastPaused = st.paused;
    };
    game.sim.onMach = (mv) => {
      setMachView(mv);
      renderer.setGhosts(mv.m && renderer.entities[mv.key] ? Object.fromEntries(mv.miss) : {});
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
      if (!r.sim) setDig(r.progress && r.target ? `${r.target} ${r.progress[0]}/${r.progress[1]}` : null);
      const reg = registry();
      for (const g of r.gained ?? []) push(`+${g.n} ${reg.item(g.id)?.name ?? g.id}`);
      if (r.msg) push(r.msg, !r.ok);
      if (r.sim && !r.ok && r.msg) {
        const key = Object.keys(r.ents ?? {})[0];
        if (key) setBooms((l) => [...l.slice(-4), { key, st: -1, msg: r.msg!, t: performance.now(), boom: true }]);
      }
    };
    renderer.onPan = () => flag('pan');
    renderer.onView = (v) => {
      setView(v);
      const p = lastView;
      lastView = { ...v };
      if (!p) return;
      if (v.mode !== p.mode) { if (v.mode === 'map') flag('map'); if (v.mode === 'globe') flag('globe'); return; }
      if (v.zoom !== p.zoom || v.mapZoom !== p.mapZoom) flag('zoom');
      if (v.rot !== p.rot) flag('rotate');
      if (v.level < p.level && v.level < 0) flag('level_down');
      if (v.level > p.level && v.level > 0) flag('level_up');
      if (v.veins && !p.veins) flag('overlay');
      if (v.pipes && !p.pipes) flag('pipe_overlay');
      if (v.poll && !p.poll) flag('poll_overlay');
      if (v.power && !p.power) flag('power_overlay');
    };
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
        if (k) { setConKey(null); return openMach(k); }
        // Pipe / cable: the hit block, else the top conduit in the viewed storey.
        const ents = renderer.entities, xx = ((x % renderer.width) + renderer.width) % renderer.width;
        const ck = block && ents[block] && isConduit(ents[block].s) ? block
          : level >= 0 ? [2, 1, 0].map((i) => `${xx},${y},${level * STOREY + i}`).find((kk) => ents[kk] && isConduit(ents[kk].s)) : undefined;
        if (ck) { openMach(null); setConKey(ck); }
        return;
      }
      if (act === 'mine' && mineTool === 'prospect') return game.sim.cmd({ k: 'prospect', x, y });
      if (act === 'mine') return level > 0 ? say('Mining works at the surface and below') : game.sim.cmd({ k: 'mine', x, y, z: -level });
      if (level < 0) return say('Build at the surface or above');
      if (act === 'build') return buildId ? game.sim.cmd({ k: 'place', id: buildId, x, y, f: level, r: rot, ch }) : say('Pick a structure to place');
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
      if (e.code === 'KeyH') renderer.togglePipes();
      if (e.code === 'KeyK') renderer.togglePoll();
      if (e.code === 'KeyT') renderer.togglePower();
      if (e.code === 'KeyJ') setJournal((j) => !j);
      if (e.code === 'KeyL') setQbook((q) => !q);
      if (e.code === 'KeyP') { pickAct('mine'); setMineTool((m) => (m === 'prospect' ? 'dig' : 'prospect')); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [game]);

  useEffect(() => { if (bag) flag('bag'); }, [bag]);
  useEffect(() => { if (journal) flag('journal'); }, [journal]);
  useEffect(() => { if (machKey) flag('machine'); }, [machKey]);
  useEffect(() => { if (alertsOpen) flag('alerts'); }, [alertsOpen]);

  const allAlerts = [...booms, ...alerts];
  const goAlert = (a: Alert) => {
    const [x, y, b] = a.key.split(',').map(Number);
    renderer.flyTo(x, y); renderer.setLevel(Math.floor(b / STOREY));
    if (a.boom) setBooms((l) => l.filter((o) => o !== a)); else openMach(a.key);
    setAlertsOpen(false);
  };
  const pollHere = renderer.pollHere;
  useEffect(() => { if (look?.tab === 'uses') flag('uses'); }, [look]);

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
        {iso && pollHere >= 5 && <span class={pollHere >= SMOG ? 'err' : pollHere >= HAZE ? 'warn' : 'dim'} title={`Pollution here (haze ${HAZE}, smog ${SMOG}: machines −25 % speed)`}>☁ {Math.round(pollHere)}{pollHere >= SMOG ? ' smog' : pollHere >= HAZE ? ' haze' : ''}</span>}
        <span class="dim tps">{stats.paused ? 'Paused' : `${stats.tps} TPS · ${stats.mspt.toFixed(2)} ms`}</span>
        <span class="grow" />
        {iso && <button onClick={() => renderer.rotate(-1)} title="Q">⟲</button>}
        {iso && <button onClick={() => renderer.rotate(1)} title="E">⟳</button>}
        <button class={iso ? 'on' : ''} onClick={() => renderer.setMode('iso')}>Local</button>
        <button class={view.mode === 'map' ? 'on' : ''} onClick={() => renderer.setMode('map')} title="M">Map</button>
        <button class={view.mode === 'globe' ? 'on' : ''} onClick={() => renderer.setMode('globe')} title="G">Globe</button>
        <button class={qbook ? 'on' : ''} onClick={() => { setQbook(!qbook); setMenu(false); }} title="Quest book (L)">📜 Quests{claimable(stats.q) > 0 && <span class="badge">{claimable(stats.q)}</span>}</button>
        <button class={journal ? 'on' : ''} onClick={() => { setJournal(!journal); setMenu(false); }} title="Veins (J) · overlay O">◎ Veins</button>
        <span class="popwrap">
          <button class={ovOpen ? 'on' : ''} onClick={() => { setOvOpen(!ovOpen); setAlertsOpen(false); }} title="Overlays: veins O · pipes H · pollution K · power T">Overlays</button>
          {ovOpen && (
            <div class="pop">
              <label><input type="checkbox" checked={view.veins} onChange={() => renderer.toggleVeins()} /> Veins (O)</label>
              <label><input type="checkbox" checked={!!view.pipes} onChange={() => renderer.togglePipes()} /> Pipes + cables (H)</label>
              <label><input type="checkbox" checked={!!view.poll} onChange={() => renderer.togglePoll()} /> Pollution (K)</label>
              <label><input type="checkbox" checked={!!view.power} onChange={() => renderer.togglePower()} /> Power load (T)</label>
            </div>
          )}
        </span>
        <span class="popwrap">
          <button class={alertsOpen ? 'on' : allAlerts.length ? 'alert' : ''} onClick={() => { setAlertsOpen(!alertsOpen); setOvOpen(false); }} title="Alerts">⚠{allAlerts.length > 0 && <span class="badge">{allAlerts.length}</span>}</button>
          {alertsOpen && (
            <div class="pop alerts">
              {allAlerts.map((a) => (
                <button key={a.key + a.st} class={a.boom ? 'err' : ''} onClick={() => goAlert(a)} title="Fly there">{a.boom ? '💥' : '⚠'} {a.msg}</button>
              ))}
              {!allAlerts.length && <div class="dim">No alerts — machines that get stuck (no fuel, no water, no steam…) show up here.</div>}
            </div>
          )}
        </span>
        <button onClick={() => { setMenu(!menu); setBook(false); setJournal(false); setQbook(false); }} title="Esc">☰</button>
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
            <button onClick={() => game.sim.cmd({ k: 'devpoll', x: Math.floor(view.x), y: Math.floor(view.y) })}>Dev: pollute here</button>
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
      {iso && !menu && !book && !bag && !qbook && act === 'mine' && (
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
      {iso && !menu && !book && !bag && !qbook && (act === 'build' || act === 'base' || act === 'demolish') && (
        <BuildBar act={act} inv={inv.inv} buildId={buildId} onBuildId={setBuildId} rot={rot} onRot={() => setRot((r) => (r + 1) % 4)}
          baseKind={baseKind} onBaseKind={setBaseKind} ch={ch} onCh={setCh} onBook={() => { setLook(null); setBook(true); setBag(false); }} />
      )}
      {machKey && !book && !menu && !journal && !qbook && renderer.entities[machKey] && (
        <Machine ent={renderer.entities[machKey]} view={machView?.key === machKey ? machView : null} inv={inv} poll={pollAt(stats.pl, machKey)}
          onCmd={(c) => game.sim.cmd(c)} onLook={openLook} onClose={() => openMach(null)} />
      )}
      {conKey && !machKey && !book && !menu && !journal && !qbook && renderer.entities[conKey] && act === 'view' && (
        <Conduit k={conKey} ent={renderer.entities[conKey]} onCmd={(c) => game.sim.cmd(c)} onClose={() => setConKey(null)} />
      )}
      {iso && !menu && !book && !journal && !qbook && !(machKey && renderer.entities[machKey]) && !(conKey && act === 'view' && renderer.entities[conKey]) && (
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
        onMove={(a, b) => game.sim.cmd({ k: 'move', a, b })} onTrash={(a) => game.sim.cmd({ k: 'trash', a })} onOpen={(id) => game.sim.cmd({ k: 'open', id })}
        onToggle={() => { setBag(!bag); setBook(false); setSel(null); }} onLook={openLook}
        recipesOpen={book} onRecipes={() => { setBook(!book); setBag(false); setMenu(false); }} />
      {qbook && !menu && (
        <Quests quests={stats.q ?? {}} flags={stats.fl ?? {}} inv={inv} ents={renderer.entities} onClaim={(id) => game.sim.cmd({ k: 'qclaim', id })}
          onLook={(l) => { setQbook(false); openLook(l); }} onClose={() => setQbook(false)} />
      )}
      {book && <Recipes inv={inv} look={look} onLook={setLook} onCraft={(recipe, n) => game.sim.cmd({ k: 'craft', recipe, n })} onClose={() => setBook(false)} onFlag={flag} />}
      <div class="feed">
        {dig && <div class="dig">⛏ {dig}</div>}
        {feed.map((f) => <div key={f.id} class={f.err ? 'err' : ''}>{f.text}</div>)}
      </div>
      {hover && <div class="hover">{hover}</div>}
      {toast && <div class={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  );
}

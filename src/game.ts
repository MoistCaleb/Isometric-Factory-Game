// Main-thread game controller: owns the sim client and save lifecycle.
import * as store from './save/store';
import { decodeSave, encodeSave } from './save/codec';
import { SimClient } from './sim/client';
import { newGame, type GameState } from './sim/state';

export const AUTOSAVE_MS = 5 * 60 * 1000;

export class Game {
  sim = new SimClient();
  private timer = 0;
  private userPaused = false;
  onChange?: () => void;
  onToast?: (msg: string, err?: boolean) => void;
  /** Fired when a world is (re)loaded so the renderer can regenerate. */
  onWorld?: (s: GameState) => void;

  async boot() {
    let state: GameState | undefined;
    try {
      const last = await store.latest();
      if (last) state = await store.load(last.key);
    } catch (e) {
      this.onToast?.(`Could not load save: ${e}`, true);
    }
    this.start(state ?? newGame());
    this.timer = window.setInterval(() => void this.autosave(), AUTOSAVE_MS);
    // No offline progress: pause + autosave when hidden; resume when visible unless user paused.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.sim.pause(); void this.autosave(); }
      else if (!this.userPaused) this.sim.resume();
    });
    window.addEventListener('pagehide', () => void this.autosave());
  }

  private start(state: GameState) {
    this.sim.load(state);
    this.onWorld?.(state);
    if (!this.userPaused) this.sim.resume();
    this.onChange?.();
  }

  togglePause() {
    this.userPaused = !this.userPaused;
    this.userPaused ? this.sim.pause() : this.sim.resume();
  }

  async autosave() {
    try { await store.autosave(await this.sim.snapshot()); this.onChange?.(); }
    catch (e) { this.onToast?.(`Autosave failed: ${e}`, true); }
  }

  async saveManual() {
    await store.saveManual(await this.sim.snapshot());
    this.onToast?.('Saved');
    this.onChange?.();
  }

  async loadKey(key: string) {
    const s = await store.load(key);
    if (s) { this.start(s); this.onToast?.('Loaded'); }
  }

  async newGame() {
    await this.autosave(); // keep a backup of the current world
    this.start(newGame());
    this.onToast?.('New world');
  }

  async exportSave() {
    const state = await this.sim.snapshot();
    const blob = new Blob([(await encodeSave(state)) as BlobPart], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `factory-${state.seed.toString(16)}-t${state.tick}.ifgsave`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async importSave(file: File) {
    try {
      const { state } = await decodeSave(new Uint8Array(await file.arrayBuffer()));
      await this.autosave();
      this.start(state);
      this.onToast?.('Imported');
    } catch (e) {
      this.onToast?.(`Import failed: ${(e as Error).message}`, true);
    }
  }

  dispose() { clearInterval(this.timer); }
}

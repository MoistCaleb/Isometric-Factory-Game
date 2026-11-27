// Save file = gzip(JSON envelope). Uses native CompressionStream (browsers + Node ≥18).
import type { GameState } from '../sim/state';
import { migrate } from './migrations';

const MAGIC = 'ifg-save';
interface Envelope { format: typeof MAGIC; savedAt: number; state: GameState }

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeSave(state: GameState, savedAt = Date.now()): Promise<Uint8Array> {
  const env: Envelope = { format: MAGIC, savedAt, state };
  return pipe(new TextEncoder().encode(JSON.stringify(env)), new CompressionStream('gzip'));
}

export async function decodeSave(bytes: Uint8Array): Promise<{ state: GameState; savedAt: number }> {
  let json: string;
  try {
    json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));
  } catch {
    throw new Error('not a valid save file');
  }
  const env = JSON.parse(json) as Envelope;
  if (env.format !== MAGIC) throw new Error('not a valid save file');
  return { state: migrate(env.state as never), savedAt: env.savedAt };
}

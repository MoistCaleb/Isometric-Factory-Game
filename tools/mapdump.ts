// Dev: write a PNG of a planet map. `tsx tools/mapdump.ts [seed] [out.png] [width]`
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { planet } from '../src/data/planets';
import { worldGen } from '../src/world/gen';
import { planetMap } from '../src/world/map';

const seed = Number(process.argv[2] ?? 12345), out = process.argv[3] ?? 'map.png', pw = Number(process.argv[4] ?? 1024);
const gen = worldGen(seed, planet('earth'));
const ph = pw / 2;
const px = await planetMap(gen, pw, ph, 0);
const sp = gen.findSpawn();
const mark = (x: number, y: number) => { for (let d = -3; d <= 3; d++) for (const [a, b] of [[d, 0], [0, d]]) {
  const i = Math.floor((x / gen.w) * pw) + a, j = Math.floor((y / gen.h) * ph) + b;
  if (i >= 0 && i < pw && j >= 0 && j < ph) { const o = (j * pw + i) * 4; px[o] = 255; px[o + 1] = 0; px[o + 2] = 0; } } };
mark(sp.x, sp.y);
const raw = Buffer.alloc((pw * 4 + 1) * ph);
for (let j = 0; j < ph; j++) { raw[j * (pw * 4 + 1)] = 0; Buffer.from(px.buffer, j * pw * 4, pw * 4).copy(raw, j * (pw * 4 + 1) + 1); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(pw, 0); ihdr.writeUInt32BE(ph, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
let veins = 0; for (let cy = 0; cy < gen.cellsY; cy++) for (let cx = 0; cx < gen.cellsX; cx++) veins += gen.veinsInCell(cx, cy).length;
console.log(`spawn ${sp.x},${sp.y} ${JSON.stringify(gen.surface(sp.x, sp.y).biome)} veins ${veins}`);

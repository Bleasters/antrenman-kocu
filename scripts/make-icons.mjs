// Generates the PWA PNG icons with no dependencies (tiny PNG encoder + SDF drawing).
// Run: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG_TOP = [20, 128, 116];
const BG_BOTTOM = [12, 84, 96];
const FG = [255, 255, 255];

// Pulse line in a 0..1 coordinate space
const PULSE = [
  [0.14, 0.56], [0.36, 0.56], [0.44, 0.40], [0.53, 0.72], [0.62, 0.30], [0.70, 0.56], [0.86, 0.56],
];

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function coverage(u, v, scale) {
  // map into content box (scale < 1 shrinks content for maskable safe zone)
  const x = (u - 0.5) / scale + 0.5;
  const y = (v - 0.5) / scale + 0.5;
  let d = Infinity;
  for (let i = 0; i < PULSE.length - 1; i++) {
    d = Math.min(d, distToSegment(x, y, ...PULSE[i], ...PULSE[i + 1]));
  }
  return d < 0.045 ? 1 : 0;
}

function render(size, scale) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let c = 0;
      for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
        c += coverage((i + (si + 0.5) / SS) / size, (j + (sj + 0.5) / SS) / size, scale);
      }
      c /= SS * SS;
      const t = j / size;
      const o = (j * size + i) * 4;
      for (let k = 0; k < 3; k++) {
        const bg = BG_TOP[k] * (1 - t) + BG_BOTTOM[k] * t;
        px[o + k] = Math.round(bg * (1 - c) + FG[k] * c);
      }
      px[o + 3] = 255;
    }
  }
  return px;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = (name, size, scale) => writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size, render(size, scale)));
out('pwa-192.png', 192, 1);
out('pwa-512.png', 512, 1);
out('pwa-maskable-512.png', 512, 0.72);
out('apple-touch-icon.png', 180, 0.9);
console.log('icons written');

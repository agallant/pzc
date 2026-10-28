// Renders the app icons (public/icons/*.png) without any image dependencies.
// Usage: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

function crc32(buf) {
  let c;
  let crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
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

// Shapes in a unit square; each returns coverage 0..1 for a point.
const circle = (cx, cy, r) => (x, y) => (Math.hypot(x - cx, y - cy) <= r ? 1 : 0);
const ellipse = (cx, cy, rx, ry) => (x, y) => (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 ? 1 : 0);
const capsule = (ax, ay, bx, by, r) => (x, y) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= r ? 1 : 0;
};
const rbox = (cx, cy, w, h, r) => (x, y) => {
  const qx = Math.abs(x - cx) - (w / 2 - r);
  const qy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= r ? 1 : 0;
};

function layers(s) {
  // s scales the artwork about the centre so the maskable icon keeps its safe zone.
  const m = (v) => 0.5 + (v - 0.5) * s;
  const k = (v) => v * s;
  const coat = hex('#6f8f7c');
  const skin = hex('#e9c4a3');
  return [
    { color: hex('#10202a'), shape: () => 1, glow: false },
    { color: hex('#5ce1ff'), alpha: 0.16, shape: circle(0.5, m(0.3), k(0.3)) },
    { color: hex('#5ce1ff'), alpha: 0.2, shape: circle(0.5, m(0.3), k(0.2)) },
    { color: coat, shape: capsule(m(0.33), m(0.64), m(0.43), m(0.36), k(0.035)) },
    { color: coat, shape: capsule(m(0.67), m(0.64), m(0.57), m(0.36), k(0.035)) },
    { color: coat, shape: ellipse(0.5, m(0.7), k(0.24), k(0.14)) },
    { color: skin, shape: circle(0.5, m(0.69), k(0.105)) },
    { color: hex('#1b2733'), shape: rbox(0.5, m(0.3), k(0.2), k(0.3), k(0.03)) },
    { color: hex('#7fe1ff'), shape: rbox(0.5, m(0.3), k(0.16), k(0.25), k(0.015)) },
    { color: hex('#ffffff'), alpha: 0.85, shape: rbox(0.5, m(0.23), k(0.1), k(0.03), k(0.012)) },
    { color: hex('#ffffff'), alpha: 0.6, shape: rbox(0.5, m(0.3), k(0.1), k(0.03), k(0.012)) },
    { color: hex('#ff9f43'), shape: circle(m(0.62), m(0.18), k(0.05)) },
  ];
}

function render(size, scale) {
  const ls = layers(scale);
  const buf = Buffer.alloc(size * size * 4);
  const ss = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          let cr = 0;
          let cg = 0;
          let cb = 0;
          for (const l of ls) {
            const a = l.shape(x, y) * (l.alpha ?? 1);
            if (!a) continue;
            cr = cr * (1 - a) + l.color[0] * a;
            cg = cg * (1 - a) + l.color[1] * a;
            cb = cb * (1 - a) + l.color[2] * a;
          }
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      buf[i] = Math.round((r / n) * 255);
      buf[i + 1] = Math.round((g / n) * 255);
      buf[i + 2] = Math.round((b / n) * 255);
      buf[i + 3] = 255;
    }
  }
  return png(size, buf);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 0.9));
writeFileSync('public/icons/icon-512.png', render(512, 0.9));
writeFileSync('public/icons/icon-maskable-512.png', render(512, 0.62));
writeFileSync('public/icons/apple-touch-icon.png', render(180, 0.9));
console.log('icons written');

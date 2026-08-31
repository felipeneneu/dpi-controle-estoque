import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'build');
mkdirSync(outDir, { recursive: true });

const SIZE = 256;
const RUB = 48;

const FONT = {
  D: ['11111', '10001', '10001', '10001', '10001', '10001', '11111'],
  P: ['11111', '10001', '10001', '11110', '10000', '10000', '10000'],
  I: ['00100', '00100', '11111', '00100', '00100', '00100', '00100'],
};
const LETTERS = ['D', 'P', 'I'];
const LET_W = 5;
const LET_H = 7;
const SCALE = 8;
const GAP = 2;

function inRoundedSquare(x, y, size, r) {
  if (x < r && y < r) return (x - r) ** 2 + (y - r) ** 2 <= r * r;
  if (x >= size - r && y < r) return (x - (size - r)) ** 2 + (y - r) ** 2 <= r * r;
  if (x < r && y >= size - r) return (x - r) ** 2 + (y - (size - r)) ** 2 <= r * r;
  if (x >= size - r && y >= size - r) return (x - (size - r)) ** 2 + (y - (size - r)) ** 2 <= r * r;
  return true;
}

// pixel buffer RGBA
const px = Buffer.alloc(SIZE * SIZE * 4);

const gradTop = [124, 58, 237]; // purple #7c3aed
const gradBottom = [236, 72, 153]; // pink #ec4899
const white = [255, 255, 255];

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const t = y / SIZE;
    let r = Math.round(gradTop[0] + (gradBottom[0] - gradTop[0]) * t);
    let g = Math.round(gradTop[1] + (gradBottom[1] - gradTop[1]) * t);
    let b = Math.round(gradTop[2] + (gradBottom[2] - gradTop[2]) * t);
    if (!inRoundedSquare(x, y, SIZE, RUB)) {
      r = g = b = 0;
    }
    const i = (y * SIZE + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  }
}

const totalW = LETTERS.length * LET_W * SCALE + (LETTERS.length - 1) * GAP * SCALE;
const totalH = LET_H * SCALE;
const ox = Math.floor((SIZE - totalW) / 2);
const oy = Math.floor((SIZE - totalH) / 2);

LETTERS.forEach((letter, li) => {
  const rows = FONT[letter];
  const xBase = ox + li * (LET_W * SCALE + GAP * SCALE);
  rows.forEach((row, ry) => {
    row.split('').forEach((ch, cx) => {
      if (ch !== '1') return;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const x = xBase + cx * SCALE + dx;
          const y = oy + ry * SCALE + dy;
          if (x >= 0 && x < SIZE && y >= 0 && y < SIZE && inRoundedSquare(x, y, SIZE, RUB)) {
            const i = (y * SIZE + x) * 4;
            px[i] = white[0];
            px[i + 1] = white[1];
            px[i + 2] = white[2];
          }
        }
      }
    });
  });
});

// ---------- PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- ICO container (single 256 PNG) ----------
function encodeIco(pngData) {
  const header = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256
  entry[1] = 0; // height 256
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngData.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset
  return Buffer.concat([header, entry, pngData]);
}

const png = encodePng(SIZE, px);
const ico = encodeIco(png);
writeFileSync(join(outDir, 'icon.png'), png);
writeFileSync(join(outDir, 'icon.ico'), ico);
console.log('icon.png', png.length, 'bytes | icon.ico', ico.length, 'bytes ->', outDir);
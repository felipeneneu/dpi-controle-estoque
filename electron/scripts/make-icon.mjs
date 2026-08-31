import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'build');
const publicDir = join(here, '..', '..', 'grafica-app', 'public');
mkdirSync(outDir, { recursive: true });

const SIZES = [
  { size: 16, file: 'logo-16x16.png' },
  { size: 256, file: 'logo-256x256.png' },
];

const images = SIZES.map(({ size, file }) => {
  const png = readFileSync(join(publicDir, file));
  return { size, png };
});

function encodeIcoWithSize(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4); // count
  let offset = 6 + images.length * 16;
  const entries = [];
  const data = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
    data.push(png);
  }
  return Buffer.concat([header, ...entries, ...data]);
}

const png256 = images.find((i) => i.size === 256).png;
const ico = encodeIcoWithSize(images);
writeFileSync(join(outDir, 'icon.png'), png256);
writeFileSync(join(outDir, 'icon.ico'), ico);
console.log('icon.png', png256.length, 'bytes | icon.ico', ico.length, 'bytes ->', outDir);
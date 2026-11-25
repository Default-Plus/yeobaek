import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Generates a crisp 256x256 PNG-in-ICO Windows app icon matching Yeobaek's Warm Paper + Ink + Terracotta mark
const SIZE = 256;
const rgba = Buffer.alloc(SIZE * SIZE * 4);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const idx = (y * SIZE + x) * 4;
  if (a === 255) {
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = 255;
  } else {
    const alpha = a / 255;
    rgba[idx] = Math.round(r * alpha + rgba[idx] * (1 - alpha));
    rgba[idx + 1] = Math.round(g * alpha + rgba[idx + 1] * (1 - alpha));
    rgba[idx + 2] = Math.round(b * alpha + rgba[idx + 2] * (1 - alpha));
    rgba[idx + 3] = Math.min(255, Math.round(a + rgba[idx + 3] * (1 - alpha)));
  }
}

function distRoundedRect(x, y, rx, ry, rw, rh, radius) {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const dx = Math.abs(x - cx) - (rw / 2 - radius);
  const dy = Math.abs(y - cy) - (rh / 2 - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

function drawCapsule(x1, y1, x2, y2, radius, color) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius - 2));
  const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(x1, x2) + radius + 2));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius - 2));
  const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(y1, y2) + radius + 2));
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lenSq = vx * vx + vy * vy || 1;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / lenSq));
      const px = x1 + t * vx;
      const py = y1 + t * vy;
      const d = Math.hypot(x - px, y - py) - radius;
      if (d <= 0.7) {
        const cov = d <= -0.5 ? 1 : Math.max(0, 0.7 - d) / 1.2;
        setPixel(x, y, color[0], color[1], color[2], Math.round(cov * 255));
      }
    }
  }
}

// 1. Warm paper rounded card + subtle border
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dOuter = distRoundedRect(x, y, 8, 8, 240, 240, 52);
    if (dOuter <= 0.7) {
      const cov = dOuter <= -0.5 ? 1 : Math.max(0, 0.7 - dOuter) / 1.2;
      setPixel(x, y, 250, 249, 246, Math.round(cov * 255)); // #FAF9F6
      const dInner = distRoundedRect(x, y, 16, 16, 224, 224, 44);
      if (dInner > -3 && dInner < 1.5) {
        setPixel(x, y, 230, 226, 216, Math.round(cov * 220)); // #E6E2D8
      }
    }
  }
}

// 2. Three minimalist editorial lines + terracotta period dot
drawCapsule(76, 92, 180, 92, 5.5, [31, 30, 28]); // #1F1E1C
drawCapsule(76, 128, 160, 128, 4.8, [104, 100, 91]); // #68645B
drawCapsule(76, 164, 134, 164, 4.8, [158, 153, 142]); // #9E998E
drawCapsule(168, 164, 168, 164, 7.5, [181, 101, 77]); // #B5654D

// Encode RGBA as valid PNG
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const rawRows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  rawRows[y * (SIZE * 4 + 1)] = 0; // filter none
  rgba.copy(rawRows, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  makeChunk('IHDR', ihdr),
  makeChunk('IDAT', zlib.deflateSync(rawRows)),
  makeChunk('IEND', Buffer.alloc(0)),
]);

// Wrap PNG into a valid Windows ICO container (Vista+ standard 256x256 PNG-in-ICO)
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type = icon
icoHeader.writeUInt16LE(1, 4); // image count

const icoEntry = Buffer.alloc(16);
icoEntry[0] = 0; // 0 means 256px
icoEntry[1] = 0; // 0 means 256px
icoEntry[2] = 0; // color palette
icoEntry[3] = 0; // reserved
icoEntry.writeUInt16LE(1, 4); // planes
icoEntry.writeUInt16LE(32, 6); // bpp
icoEntry.writeUInt32LE(png.length, 8); // size
icoEntry.writeUInt32LE(22, 12); // offset (6 + 16)

const outDir = path.resolve('build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([icoHeader, icoEntry, png]));
fs.writeFileSync(path.resolve('public', 'icon.png'), png);
console.log('Generated build/icon.png, build/icon.ico, and public/icon.png');

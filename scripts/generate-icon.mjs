import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Generates crisp PNG-in-ICO Windows app icon & 120x120 Google OAuth branding logo
function renderYeobaekPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = size / 256;

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const idx = (y * size + x) * 4;
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
    const sx1 = x1 * scale;
    const sy1 = y1 * scale;
    const sx2 = x2 * scale;
    const sy2 = y2 * scale;
    const sr = radius * scale;
    const minX = Math.max(0, Math.floor(Math.min(sx1, sx2) - sr - 2));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(sx1, sx2) + sr + 2));
    const minY = Math.max(0, Math.floor(Math.min(sy1, sy2) - sr - 2));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(sy1, sy2) + sr + 2));
    const vx = sx2 - sx1;
    const vy = sy2 - sy1;
    const lenSq = vx * vx + vy * vy || 1;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - sx1) * vx + (y - sy1) * vy) / lenSq));
        const px = sx1 + t * vx;
        const py = sy1 + t * vy;
        const d = Math.hypot(x - px, y - py) - sr;
        if (d <= 0.7) {
          const cov = d <= -0.5 ? 1 : Math.max(0, 0.7 - d) / 1.2;
          setPixel(x, y, color[0], color[1], color[2], Math.round(cov * 255));
        }
      }
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dOuter = distRoundedRect(x, y, 8 * scale, 8 * scale, 240 * scale, 240 * scale, 52 * scale);
      if (dOuter <= 0.7) {
        const cov = dOuter <= -0.5 ? 1 : Math.max(0, 0.7 - dOuter) / 1.2;
        setPixel(x, y, 250, 249, 246, Math.round(cov * 255));
        const dInner = distRoundedRect(x, y, 16 * scale, 16 * scale, 224 * scale, 224 * scale, 44 * scale);
        if (dInner > -3 * scale && dInner < 1.5 * scale) {
          setPixel(x, y, 230, 226, 216, Math.round(cov * 220));
        }
      }
    }
  }

  drawCapsule(76, 92, 180, 92, 5.5, [31, 30, 28]);
  drawCapsule(76, 128, 160, 128, 4.8, [104, 100, 91]);
  drawCapsule(76, 164, 134, 164, 4.8, [158, 153, 142]);
  drawCapsule(168, 164, 168, 164, 7.5, [181, 101, 77]);

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

  const rawRows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawRows[y * (size * 4 + 1)] = 0;
    rgba.copy(rawRows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(rawRows)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = renderYeobaekPng(256);
const logo120 = renderYeobaekPng(120);

const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);

const icoEntry = Buffer.alloc(16);
icoEntry[0] = 0;
icoEntry[1] = 0;
icoEntry[2] = 0;
icoEntry[3] = 0;
icoEntry.writeUInt16LE(1, 4);
icoEntry.writeUInt16LE(32, 6);
icoEntry.writeUInt32LE(png.length, 8);
icoEntry.writeUInt32LE(22, 12);

const outDir = path.resolve('build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([icoHeader, icoEntry, png]));
fs.writeFileSync(path.resolve('public', 'icon.png'), png);
fs.writeFileSync(path.resolve('public', 'logo-120.png'), logo120);
console.log('Generated build/icon.png, build/icon.ico, public/icon.png, and public/logo-120.png');

// 生成插件图标：左右双栏面板造型（左深右浅，呼应双视图）
// 用法: node tools/gen-icons.js  （输出到 icons/icon{16,48,128}.png）
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(file, size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

// 判断点是否在圆角矩形内（归一化坐标 0..1）
function inRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.max(x0 + r, Math.min(px, x1 - r));
  const cy = Math.max(y0 + r, Math.min(py, y1 - r));
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const DARK = [36, 41, 47, 255]; // #24292f 原文面板
  const BLUE = [56, 132, 255, 255]; // #3884ff Markdown 面板
  const WHITE = [255, 255, 255, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let color = null;
      if (inRoundedRect(u, v, 0.05, 0.20, 0.47, 0.80, 0.08)) color = DARK;
      if (inRoundedRect(u, v, 0.53, 0.20, 0.95, 0.80, 0.08)) color = BLUE;
      // 左面板中画两条白色“文字行”，右面板画一个白色下箭头
      if (color) {
        if (color === DARK && inRoundedRect(u, v, 0.12, 0.34, 0.40, 0.38, 0.015)) color = WHITE;
        if (color === DARK && inRoundedRect(u, v, 0.12, 0.46, 0.33, 0.50, 0.015)) color = WHITE;
        if (color === DARK && inRoundedRect(u, v, 0.12, 0.58, 0.40, 0.62, 0.015)) color = WHITE;
        if (color === BLUE && inRoundedRect(u, v, 0.70, 0.30, 0.78, 0.56, 0.03)) color = WHITE;
        if (color === BLUE && inRoundedRect(u, v, 0.63, 0.48, 0.85, 0.56, 0.03)) color = WHITE;
        if (color === BLUE && inRoundedRect(u, v, 0.70, 0.50, 0.78, 0.58, 0.03)) color = WHITE;
        const o = (y * size + x) * 4;
        px[o] = color[0]; px[o + 1] = color[1]; px[o + 2] = color[2]; px[o + 3] = color[3];
      }
    }
  }
  return px;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const s of [16, 48, 128]) {
  writePng(path.join(outDir, `icon${s}.png`), s, drawIcon(s));
  console.log(`icons/icon${s}.png 已生成`);
}

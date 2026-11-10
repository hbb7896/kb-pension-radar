// Generate crisp custom PNG and SVG icons for PWA (192x192 & 512x512)
// Pure Node.js PNG encoder (using built-in zlib) so no external dependencies are required.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PUBLIC_DIR = path.join(__dirname, 'public');

// 1. High-resolution Vector SVG Icon (Dark Navy + Gold 'R' Badge + Emerald Upward Breakout Chart)
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#131c31"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="50%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="greenGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#f59e0b" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Rounded App Tile Background -->
  <rect x="0" y="0" width="512" height="512" rx="115" fill="url(#bgGrad)"/>
  <rect x="14" y="14" width="484" height="484" rx="102" fill="none" stroke="url(#goldGrad)" stroke-width="5" stroke-opacity="0.45"/>

  <!-- Subtle Grid Lines -->
  <line x1="64" y1="370" x2="448" y2="370" stroke="#f43f5e" stroke-width="3" stroke-dasharray="10,8" stroke-opacity="0.6"/>
  <line x1="64" y1="160" x2="448" y2="160" stroke="#10b981" stroke-width="3" stroke-dasharray="10,8" stroke-opacity="0.5"/>

  <!-- Candlesticks Background -->
  <!-- Candle 1 -->
  <line x1="110" y1="310" x2="110" y2="395" stroke="#f43f5e" stroke-width="6" stroke-linecap="round"/>
  <rect x="98" y="330" width="24" height="45" rx="4" fill="#f43f5e" opacity="0.85"/>
  <!-- Candle 2 -->
  <line x1="175" y1="270" x2="175" y2="355" stroke="#10b981" stroke-width="6" stroke-linecap="round"/>
  <rect x="163" y="290" width="24" height="48" rx="4" fill="#10b981" opacity="0.85"/>
  <!-- Candle 3 (Tight Day) -->
  <line x1="240" y1="255" x2="240" y2="315" stroke="#38bdf8" stroke-width="6" stroke-linecap="round"/>
  <rect x="228" y="270" width="24" height="28" rx="4" fill="#38bdf8" opacity="0.9"/>
  <!-- Candle 4 (Breakout) -->
  <line x1="395" y1="95" x2="395" y2="245" stroke="#34d399" stroke-width="7" stroke-linecap="round"/>
  <rect x="381" y="115" width="28" height="105" rx="5" fill="url(#greenGrad)"/>

  <!-- Upward R-Breakout Arrow Curve -->
  <path d="M 88 388 Q 210 340 285 245 L 385 118" fill="none" stroke="url(#greenGrad)" stroke-width="14" stroke-linecap="round"/>
  <polygon points="410,92 362,108 396,140" fill="#34d399"/>

  <!-- Bold Golden 'R' Monogram in Center-Left -->
  <g filter="url(#glow)">
    <text x="115" y="315" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="255" fill="url(#goldGrad)" letter-spacing="-8">R</text>
  </g>

  <!-- Bottom Pill Badge: 1R SYSTEM -->
  <rect x="116" y="406" width="280" height="52" rx="26" fill="#1e293b" stroke="url(#goldGrad)" stroke-width="3"/>
  <text x="256" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="26" fill="#f8fafc" letter-spacing="3">1R SYSTEM</text>
</svg>`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.svg'), svgIcon, 'utf-8');

// 2. Pure JS PNG Generator (draws rounded dark navy tile, golden 'R', green breakout bars & chart line)
function createPngBuffer(size) {
  const width = size;
  const height = size;
  const rawData = Buffer.alloc(height * (1 + width * 4));

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const rowOffset = y * (1 + width * 4) + 1 + x * 4;
    if (a < 255 && rawData[rowOffset + 3] > 0) {
      const alpha = a / 255;
      rawData[rowOffset] = Math.round(r * alpha + rawData[rowOffset] * (1 - alpha));
      rawData[rowOffset + 1] = Math.round(g * alpha + rawData[rowOffset + 1] * (1 - alpha));
      rawData[rowOffset + 2] = Math.round(b * alpha + rawData[rowOffset + 2] * (1 - alpha));
      rawData[rowOffset + 3] = 255;
    } else {
      rawData[rowOffset] = r;
      rawData[rowOffset + 1] = g;
      rawData[rowOffset + 2] = b;
      rawData[rowOffset + 3] = a;
    }
  }

  const radius = size * 0.22;

  function insideRoundedRect(x, y, pad, rad) {
    const left = pad, right = width - 1 - pad;
    const top = pad, bottom = height - 1 - pad;
    if (x < left || x > right || y < top || y > bottom) return false;
    if (x < left + rad && y < top + rad) {
      return Math.hypot(x - (left + rad), y - (top + rad)) <= rad;
    }
    if (x > right - rad && y < top + rad) {
      return Math.hypot(x - (right - rad), y - (top + rad)) <= rad;
    }
    if (x < left + rad && y > bottom - rad) {
      return Math.hypot(x - (left + rad), y - (bottom - rad)) <= rad;
    }
    if (x > right - rad && y > bottom - rad) {
      return Math.hypot(x - (right - rad), y - (bottom - rad)) <= rad;
    }
    return true;
  }

  // Background gradient + gold border
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      if (insideRoundedRect(x, y, 0, radius)) {
        const t = (x + y) / (width + height);
        const r = Math.round(15 * (1 - t) + 9 * t);
        const g = Math.round(23 * (1 - t) + 14 * t);
        const b = Math.round(42 * (1 - t) + 26 * t);
        setPixel(x, y, r, g, b, 255);

        // Inner Gold Border
        const borderPad = Math.max(3, Math.round(size * 0.03));
        const borderThick = Math.max(2, Math.round(size * 0.014));
        if (
          insideRoundedRect(x, y, borderPad, radius * 0.88) &&
          !insideRoundedRect(x, y, borderPad + borderThick, radius * 0.84)
        ) {
          setPixel(x, y, 245, 158, 11, 180);
        }
      }
    }
  }

  // Helper to fill rectangle in normalized coords (0..1)
  function fillNormRect(nx1, ny1, nx2, ny2, r, g, b, a = 255) {
    const x1 = Math.round(nx1 * size), x2 = Math.round(nx2 * size);
    const y1 = Math.round(ny1 * size), y2 = Math.round(ny2 * size);
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        setPixel(x, y, r, g, b, a);
      }
    }
  }

  // Draw 3 rising candlestick bars on right side
  fillNormRect(0.56, 0.50, 0.63, 0.72, 56, 189, 248, 220);  // Sky blue candle
  fillNormRect(0.68, 0.36, 0.75, 0.66, 16, 185, 129, 235);  // Emerald candle
  fillNormRect(0.80, 0.18, 0.87, 0.56, 52, 211, 153, 255);  // Bright green breakout candle
  // Wicks
  fillNormRect(0.59, 0.44, 0.60, 0.77, 56, 189, 248, 220);
  fillNormRect(0.71, 0.30, 0.72, 0.71, 16, 185, 129, 235);
  fillNormRect(0.83, 0.12, 0.84, 0.62, 52, 211, 153, 255);

  // Stop-loss red dashed horizontal bar at bottom
  for (let i = 0; i < 7; i++) {
    fillNormRect(0.14 + i * 0.11, 0.82, 0.21 + i * 0.11, 0.835, 244, 63, 94, 210);
  }

  // Bold Golden 'R' on the left-center
  // Vertical stem of R
  fillNormRect(0.18, 0.22, 0.29, 0.74, 245, 158, 11, 255);
  // Top horizontal bar of R
  fillNormRect(0.28, 0.22, 0.46, 0.31, 251, 191, 36, 255);
  // Middle horizontal bar of R
  fillNormRect(0.28, 0.44, 0.46, 0.53, 245, 158, 11, 255);
  // Right curve of R bowl
  fillNormRect(0.43, 0.25, 0.53, 0.50, 251, 191, 36, 255);
  // Diagonal leg of R
  const legSteps = Math.round(size * 0.25);
  for (let i = 0; i < legSteps; i++) {
    const t = i / legSteps;
    const lx = 0.34 + t * 0.14;
    const ly = 0.50 + t * 0.24;
    fillNormRect(lx, ly, lx + 0.09, ly + 0.03, 245, 158, 11, 255);
  }

  // Build valid PNG chunks
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idatData = zlib.deflateSync(rawData, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192.png'), createPngBuffer(192));
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512.png'), createPngBuffer(512));
console.log('Generated icon.svg, icon-192.png, icon-512.png successfully.');

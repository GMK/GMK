/* 開発用: 本体と同じ投影・ラスタ化で地図を PNG に描き出し、形を目視確認する。 */
const fs = require('fs');
const zlib = require('zlib');
const GEO = require('../src/data-geo.js');

const W = parseInt(process.argv[2] || '760', 10);

function projector(w) {
  const v = GEO.view, k = Math.cos(v.latRef * Math.PI / 180);
  const sx = w / ((v.lon1 - v.lon0) * k);
  const h = Math.round((v.lat1 - v.lat0) * sx);
  return { w, h, sx, k, v,
    x: lon => (lon - v.lon0) * k * sx,
    y: lat => (v.lat1 - lat) * sx };
}

/* 偶奇規則のスキャンライン塗り。mask[i]=1 が陸。 */
function rasterizeLand(P) {
  const mask = new Uint8Array(P.w * P.h);
  const polys = Object.values(GEO.coasts).map(flat => {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([P.x(flat[i]), P.y(flat[i + 1])]);
    return pts;
  });
  for (let py = 0; py < P.h; py++) {
    const yc = py + 0.5, xs = [];
    for (const pts of polys) {
      for (let i = 0, n = pts.length; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] > yc) === (b[1] > yc)) continue;
        xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i] - 0.5));
      const x1 = Math.min(P.w - 1, Math.floor(xs[i + 1] - 0.5));
      for (let px = x0; px <= x1; px++) mask[py * P.w + px] = 1;
    }
  }
  return mask;
}

/* 最近傍の代表点でその画素の国を決める（陸地に限定したボロノイ分割）。 */
function assignProvinces(P, mask) {
  const sites = [];
  GEO.provinces.forEach((p, idx) => p.sites.forEach(s => sites.push([P.x(s[1]), P.y(s[0]), idx])));
  const own = new Int16Array(P.w * P.h).fill(-1);
  for (let py = 0; py < P.h; py++) {
    for (let px = 0; px < P.w; px++) {
      const i = py * P.w + px;
      if (!mask[i]) continue;
      let best = Infinity, bi = -1;
      const cx = px + 0.5, cy = py + 0.5;
      for (let s = 0; s < sites.length; s++) {
        const dx = cx - sites[s][0], dy = cy - sites[s][1], d = dx * dx + dy * dy;
        if (d < best) { best = d; bi = sites[s][2]; }
      }
      own[i] = bi;
    }
  }
  return own;
}

function hue(i, n) {
  const h = (i * 360 / n + i % 3 * 17) % 360, s = 0.55, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return t.map(v => Math.round((v + m) * 255));
}

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}
let TBL = null;
function crc32(buf) {
  if (!TBL) {
    TBL = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return c ^ -1;
}

const P = projector(W);
const mask = rasterizeLand(P);
const own = assignProvinces(P, mask);
const n = GEO.provinces.length;
const rgb = Buffer.alloc(P.w * P.h * 3);
for (let i = 0; i < P.w * P.h; i++) {
  let c = [18, 24, 34];
  if (own[i] >= 0) {
    c = hue(own[i], n);
    const right = (i % P.w) + 1 < P.w ? own[i + 1] : own[i];
    const down = i + P.w < own.length ? own[i + P.w] : own[i];
    if (right !== own[i] || down !== own[i]) c = [235, 230, 216];
  }
  rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
}
fs.writeFileSync(__dirname + '/preview.png', png(P.w, P.h, rgb));
const land = mask.reduce((a, b) => a + b, 0);
console.log(`size ${P.w}x${P.h}  land ${land}px (${(land / (P.w * P.h) * 100).toFixed(1)}%)`);

/* 地図上で実際に隣り合う（＝色を見比べられる）大名家の組を、
   国の隣接関係と各年の支配者から機械的に洗い出す。 */
const path = require('path');
const fs = require('fs');
const GEO = require('../src/data-geo.js');
const { HISTORY } = require('../src/data-history.js');

const src = fs.readFileSync(path.join(__dirname, 'preview.js'), 'utf8');
const body = src.split('const P = projector(W);')[0].replace("const GEO = require('../src/data-geo.js');", '');
const { projector, rasterizeLand, assignProvinces } =
  new Function('GEO', 'require', body + '; return {projector, rasterizeLand, assignProvinces};')(GEO, require);

const P = projector(900);
const own = assignProvinces(P, rasterizeLand(P));
const N = GEO.provinces.length;

/* 陸続きに限らず、海峡越し（淡路↔摂津など）も「見比べる組」なので R 画素以内を隣接とみなす */
const R = 9;
const adj = new Set();
for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
  const a = own[y * P.w + x]; if (a < 0) continue;
  for (let dy = 0; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dy === 0 && dx <= 0) continue;
    if (dx*dx + dy*dy > R*R) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= P.w || ny >= P.h) continue;
    const b = own[ny * P.w + nx];
    if (b >= 0 && b !== a) adj.add(a < b ? a + ',' + b : b + ',' + a);
  }
}
const provAdj = [...adj].map(s => s.split(',').map(Number));

const ruler = (id, year) => {
  const seg = HISTORY[id]; let cur = seg[0];
  for (const s of seg) if (s[0] <= year) cur = s;
  return cur[1];
};
const edges = new Map();
for (let year = 1467; year <= 1615; year++) {
  for (const [i, j] of provAdj) {
    const a = ruler(GEO.provinces[i].id, year), b = ruler(GEO.provinces[j].id, year);
    if (a === b) continue;
    const k = a < b ? a + ',' + b : b + ',' + a;
    edges.set(k, (edges.get(k) || 0) + 1);   // 隣り合っていた年数 = その組の重要度
  }
}
const out = [...edges.entries()].map(([k, w]) => [...k.split(','), w]).sort((p, q) => q[2] - p[2]);
fs.writeFileSync(path.join(__dirname, 'adjacency.json'), JSON.stringify(out));
console.log(`国の隣接 ${provAdj.length} 組 → 大名家の隣接 ${out.length} 組`);
console.log('長く隣り合った組:', out.slice(0, 12).map(e => `${e[0]}-${e[1]}(${e[2]}年)`).join(' '));

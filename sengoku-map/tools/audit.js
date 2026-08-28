const GEO = require('../src/data-geo.js');
const path = require('path');
const src = require('fs').readFileSync(path.join(__dirname, 'preview.js'), 'utf8');
const mod = { exports: {} };
// preview.js の関数だけ再利用するため、描画部分を除いて評価する
const body = src.split('const P = projector(W);')[0].replace("const GEO = require('../src/data-geo.js');", '');
const f = new Function('GEO', 'require', body + '; return {projector, rasterizeLand, assignProvinces};');
const { projector, rasterizeLand, assignProvinces } = f(GEO, require);
const P = projector(1200);
const mask = rasterizeLand(P);
const own = assignProvinces(P, mask);
const acc = GEO.provinces.map(() => ({ n: 0, sx: 0, sy: 0 }));
for (let i = 0; i < own.length; i++) {
  if (own[i] < 0) continue;
  const a = acc[own[i]]; a.n++; a.sx += i % P.w; a.sy += Math.floor(i / P.w);
}
const v = GEO.view, k = Math.cos(v.latRef * Math.PI / 180);
const total = acc.reduce((s, a) => s + a.n, 0);
console.log('国名        面積%   重心(緯度,経度)');
GEO.provinces.forEach((p, i) => {
  const a = acc[i];
  if (!a.n) { console.log(`!! ${p.name} : 面積ゼロ`); return; }
  const lon = (a.sx / a.n) / P.sx / k + v.lon0, lat = v.lat1 - (a.sy / a.n) / P.sx;
  console.log(`${p.name.padEnd(10, '　')} ${(a.n / total * 100).toFixed(2).padStart(5)}  ${lat.toFixed(2)},${lon.toFixed(2)}`);
});

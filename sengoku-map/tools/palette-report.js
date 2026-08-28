/* いま data-history.js に入っている色を、実際の隣接関係で採点する */
const fs = require('fs'), path = require('path');
const { labs, dist, contrast } = require('./color.js');
const { CLANS } = require('../src/data-history.js');
const SURFACE = '#0F141D';
const E = JSON.parse(fs.readFileSync(path.join(__dirname, 'adjacency.json'), 'utf8'))
  .filter(([a, b]) => a !== 'other' && b !== 'other');
const L = Object.fromEntries(Object.entries(CLANS).map(([k, v]) => [k, labs(v.color)]));
const cvd = (a, b) => Math.min(dist(a.protan, b.protan), dist(a.deutan, b.deutan), dist(a.tritan, b.tritan));
const rows = E.map(([a, b, w]) => ({
  p: `${CLANS[a].name}↔${CLANS[b].name}`, w,
  n: +dist(L[a].normal, L[b].normal).toFixed(1), c: +cvd(L[a], L[b]).toFixed(1)
})).sort((x, y) => (x.n / 15 + x.c / 8) - (y.n / 15 + y.c / 8));
const bad = rows.filter(r => r.n < 15 || r.c < 6);
console.log(`隣接 ${rows.length} 組 : 基準未達 ${bad.length} / 要ラベル(CVD 6–8) ${rows.filter(r => r.c >= 6 && r.c < 8 && r.n >= 15).length}`);
console.log(rows.slice(0, 10).map(r => `  ${(r.n < 15 || r.c < 6) ? 'NG  ' : 'ok  '}${r.p.padEnd(14, '　')} 通常 ${String(r.n).padStart(5)}  CVD ${String(r.c).padStart(4)}  (${r.w}年隣接)`).join('\n'));
const lowC = Object.entries(CLANS).filter(([k, v]) => k !== 'other' && contrast(v.color, SURFACE) < 3);
console.log('地色とのコントラスト 3:1 未満:', lowC.length ? lowC.map(e => e[1].name).join(',') : 'なし');

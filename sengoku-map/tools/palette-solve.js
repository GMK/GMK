/* 隣接する大名家どうしが見分けられるよう配色を最適化する。
   ・候補色は OKLCH 格子（暗い地色に載せるため L 0.49–0.665、C>=0.10、対地色コントラスト 3:1 以上）
   ・目的は「地図上で実際に隣り合った年数」で重み付けした色差の不足量
   ・通常視 ΔE>=15 を必須、色覚型 ΔE>=6 を下限、8 以上を加点
     （6–8 帯は全領地に大名家名を直接表示するため許容される）
   ・織田＝朱、上杉＝群青…といった伝統色の狙いは色相の固定域と弱い引力で保つ */
const fs = require('fs'), path = require('path');
const { labs, dist, contrast, oklch2hex } = require('./color.js');
const { CLANS } = require('../src/data-history.js');

const SURFACE = '#0F141D';
const EDGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'adjacency.json'), 'utf8'))
  .filter(([a, b]) => a !== 'other' && b !== 'other');   // 国人・小勢力は網掛けで表すため対象外
const IDS = Object.keys(CLANS).filter(id => id !== 'other');
const IX = Object.fromEntries(IDS.map((id, i) => [id, i]));
const E = EDGES.map(([a, b, w]) => [IX[a], IX[b], Math.log2(w + 1)]);
const nbr = IDS.map(() => []);
E.forEach(([i, j], k) => { nbr[i].push(k); nbr[j].push(k); });

/* 主要勢力は色相を固定域に縛り、伝統色としての印象を保つ（度） */
const PIN = {
  oda:[18,46], toyotomi:[74,96], tokugawa:[130,172], mori:[172,206], uesugi:[234,276],
  hojo:[290,326], takeda:[340,376], date:[326,352], shimazu:[0,26], otomo:[112,150],
  imagawa:[212,248], chosokabe:[86,120], ouchi:[52,86], amago:[248,284], miyoshi:[176,214]
};
/* 伝統色の狙い（度）。固定域の中心も明示し、探索が端に張り付かないようにする。 */
const WISH = {
  oda:30, toyotomi:80, tokugawa:150, mori:190, uesugi:255, hojo:305, takeda:358, date:338,
  shimazu:14, otomo:130, imagawa:230, chosokabe:104, ouchi:68, amago:266, miyoshi:194,
  hosokawa:250, yamana:310, akamatsu:35, rokkaku:135, saito:300, toki:95,
  asakura:245, kitabatake:315, hatakeyama:70, satomi:250, satake:145, utsunomiya:265,
  ashina:185, mogami:85, nanbu:230, honganji:0, ukita:310, ryuzoji:125, ito:65, kono:200, maeda:90 };
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
/* 天下人の色は物語の軸なので、色相に加えて明度も縛る（豊臣＝明るい金） */
const PIN_L = { toyotomi:[0.66, 0.745], oda:[0.60, 0.72], tokugawa:[0.62, 0.745] };
const inPin = (id, h, L) => { const p = PIN[id], q = PIN_L[id];
  if (q && (L < q[0] || L > q[1])) return false;
  if (!p) return true;
  const x = h < p[0] ? h + 360 : h; return x >= p[0] && x <= p[1]; };

const CAND = [];
/* 明度帯は dataviz の暗色モード（L 0.48–0.67）よりやや広く取る。細いマークではなく
   大面積の塗りで、文字は塗りの明度に応じて白/黒を選ぶため、明度差を使える。
   彩度は岩絵具の質感に収めるため C<=0.17 に抑える。 */
for (let L = 0.44; L <= 0.741; L += 0.015)
  for (let C = 0.085; C <= 0.171; C += 0.01)
    for (let h = 0; h < 360; h += 3) {
      const hex = oklch2hex(L, C, h);
      if (!hex || contrast(hex, SURFACE) < 3) continue;
      CAND.push({ hex, L, C, h, lab: labs(hex) });
    }

const cvd = (a, b) => Math.min(dist(a.protan, b.protan), dist(a.deutan, b.deutan), dist(a.tritan, b.tritan));
const sq = x => x > 0 ? x * x : 0;
function shortfall(a, b) {
  const n = dist(a.normal, b.normal), c = cvd(a, b);
  return 3 * sq(1 - n / 15) + 3 * sq(1 - c / 6) + 0.4 * sq(1 - c / 8);
}
const LEGEND_FLOOR = 10;    /* 凡例に全家が並ぶので、隣接しない組にも緩い下限を課す */
/* 岩絵具らしい色に収めるための弱い好み。淡すぎ・暗すぎ・彩度不足を軽く罰する。 */
const taste = c => 0.5 * ((c.L - 0.585) / 0.16) ** 2 + 0.35 * ((0.15 - c.C) / 0.07) ** 2;

function localCost(i, cand, cur) {
  let s = 0.010 * hueGap(cand.h, WISH[IDS[i]] ?? cand.h) + taste(cand);
  for (const k of nbr[i]) { const [p, q, w] = E[k];
    s += w * shortfall(p === i ? cand.lab : cur[p].lab, q === i ? cand.lab : cur[q].lab); }
  for (let j = 0; j < cur.length; j++) { if (j === i) continue;
    const d = dist(cand.lab.normal, cur[j].lab.normal);
    if (d < LEGEND_FLOOR) s += 0.5 * sq(1 - d / LEGEND_FLOOR); }
  return s;
}

/* 現行色に最も近い候補から出発し、ランダム再開付きの局所探索で改善する */
function solve(seed) {
  let rnd = seed, rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const cur = IDS.map(id => {
    const pool = CAND.filter(c => inPin(id, c.h, c.L));
    if (seed === 0) { const t = labs(CLANS[id].color);
      return pool.reduce((b, c) => dist(c.lab.normal, t.normal) < dist(b.lab.normal, t.normal) ? c : b, pool[0]); }
    return pool[Math.floor(rand() * pool.length)];
  });
  for (let sweep = 0; sweep < 40; sweep++) {
    let moved = 0;
    for (let i = 0; i < IDS.length; i++) {
      let bc = localCost(i, cur[i], cur), bch = null;
      for (const c of CAND) { if (!inPin(IDS[i], c.h, c.L)) continue;
        const v = localCost(i, c, cur); if (v < bc - 1e-9) { bc = v; bch = c; } }
      if (bch) { cur[i] = bch; moved++; }
    }
    if (!moved) break;
  }
  const total = E.reduce((s, [i, j, w]) => s + w * shortfall(cur[i].lab, cur[j].lab), 0);
  return { cur, total };
}

let best = null;
for (let s = 0; s < 6; s++) { const r = solve(s); if (!best || r.total < best.total) best = r; }
const cur = best.cur;

let fail = 0, warn = 0, rows = [];
for (const [i, j] of E) {
  const n = dist(cur[i].lab.normal, cur[j].lab.normal), c = cvd(cur[i].lab, cur[j].lab);
  if (n < 15 || c < 6) fail++; else if (c < 8) warn++;
  rows.push({ p: `${CLANS[IDS[i]].name}↔${CLANS[IDS[j]].name}`, n: +n.toFixed(1), c: +c.toFixed(1) });
}
rows.sort((a, b) => (a.n / 15 + a.c / 8) - (b.n / 15 + b.c / 8));
let legendMin = Infinity, legendPair = '';
for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
  const d = dist(cur[i].lab.normal, cur[j].lab.normal);
  if (d < legendMin) { legendMin = d; legendPair = `${CLANS[IDS[i]].name}/${CLANS[IDS[j]].name}`; }
}
console.log(`隣接 ${E.length} 組 : 不合格 ${fail} / 要ラベル(CVD 6–8) ${warn}`);
console.log(rows.slice(0, 8).map(w => `  ${w.p.padEnd(14, '　')} 通常 ${w.n}  CVD ${w.c}`).join('\n'));
console.log(`凡例内の最小色差 ${legendMin.toFixed(1)} (${legendPair})`);
console.log('\n' + IDS.map((id, i) => `  ${id}: '${cur[i].hex}', // ${CLANS[id].name} h${cur[i].h}`).join('\n'));
fs.writeFileSync(path.join(__dirname, 'palette.json'),
  JSON.stringify(Object.fromEntries(IDS.map((id, i) => [id, cur[i].hex])), null, 1));

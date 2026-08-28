(function () {
  'use strict';
  const Y0 = 1467, Y1 = 1615;
  const PROV = GEO.provinces;
  const PIDX = Object.fromEntries(PROV.map((p, i) => [p.id, i]));

  /* 元号（改元は年途中のため、表示はおおよそ） */
  const NENGO = [[1467,'応仁'],[1469,'文明'],[1487,'長享'],[1489,'延徳'],[1492,'明応'],[1501,'文亀'],
    [1504,'永正'],[1521,'大永'],[1528,'享禄'],[1532,'天文'],[1555,'弘治'],[1558,'永禄'],[1570,'元亀'],
    [1573,'天正'],[1592,'文禄'],[1596,'慶長'],[1615,'元和']];
  function wareki(y) {
    let e = NENGO[0];
    for (const n of NENGO) if (n[0] <= y) e = n;
    const n = y - e[0] + 1;
    return e[1] + (n === 1 ? '元' : n) + '年';
  }
  function rulerAt(pid, year) {
    const seg = HISTORY[pid]; let cur = seg[0];
    for (const s of seg) if (s[0] <= year) cur = s;
    return cur;                       // [開始年, 大名家ID, 統治した家の呼称]
  }

  /* ── 投影 ───────────────────────────────────────────── */
  const V = GEO.view, KX = Math.cos(V.latRef * Math.PI / 180);
  const ASPECT = ((V.lon1 - V.lon0) * KX) / (V.lat1 - V.lat0);

  /* ── ラスタ（陸地マスク・国の割り当て・ラベル位置）───── */
  let R = null;   // {W,H,own,anchor,edges,provAdj,scale}

  function buildRaster(W, H) {
    const sx = W / ((V.lon1 - V.lon0) * KX);
    const px = lon => (lon - V.lon0) * KX * sx, py = lat => (V.lat1 - lat) * sx;

    // 海岸線を偶奇規則で塗り分ける。琵琶湖は内側の輪として自動的に抜ける。
    const polys = Object.values(GEO.coasts).map(flat => {
      const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push([px(flat[i]), py(flat[i + 1])]);
      return pts;
    });
    const own = new Int16Array(W * H).fill(-1);
    const rows = [];
    for (let y = 0; y < H; y++) {
      const yc = y + 0.5, xs = [];
      for (const pts of polys) for (let i = 0, n = pts.length; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] > yc) === (b[1] > yc)) continue;
        xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q); rows.push(xs);
    }

    const sites = [];
    PROV.forEach((p, i) => p.sites.forEach(s => sites.push([px(s[1]), py(s[0]), i])));

    // 粗いセルごとに候補点を絞り込んでから、画素単位で最近傍を決める
    const CELL = 28, half = CELL * Math.SQRT1_2;
    for (let cy = 0; cy < H; cy += CELL) for (let cx = 0; cx < W; cx += CELL) {
      const mx = cx + CELL / 2, my = cy + CELL / 2;
      let d0 = Infinity;
      for (const s of sites) { const d = Math.hypot(mx - s[0], my - s[1]); if (d < d0) d0 = d; }
      const cand = sites.filter(s => Math.hypot(mx - s[0], my - s[1]) <= d0 + 2 * half + CELL);
      const yE = Math.min(H, cy + CELL), xE = Math.min(W, cx + CELL);
      for (let y = cy; y < yE; y++) {
        const xs = rows[y]; if (!xs.length) continue;
        for (let x = cx; x < xE; x++) {
          // 偶奇判定で陸かどうか
          let c = 0; const xc = x + 0.5;
          for (let k = 0; k < xs.length; k++) if (xs[k] < xc) c++; else break;
          if (!(c & 1)) continue;
          let bd = Infinity, bi = -1;
          for (let k = 0; k < cand.length; k++) {
            const dx = xc - cand[k][0], dy = y + 0.5 - cand[k][1], d = dx * dx + dy * dy;
            if (d < bd) { bd = d; bi = cand[k][2]; }
          }
          own[y * W + x] = bi;
        }
      }
    }

    // 国どうしの接触関係と、国境画素の一覧
    const provAdj = PROV.map(() => new Set());
    const edges = PROV.map(() => []);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, a = own[i]; if (a < 0) continue;
      const r = x + 1 < W ? own[i + 1] : -1, d = y + 1 < H ? own[i + W] : -1;
      if (r !== a) { if (r >= 0) { provAdj[a].add(r); provAdj[r].add(a); edges[r].push(i + 1); } edges[a].push(i); }
      if (d !== a) { if (d >= 0) { provAdj[a].add(d); provAdj[d].add(a); edges[d].push(i + W); } edges[a].push(i); }
    }

    // 「境界から最も遠い画素」をラベル位置にする（凹んだ国でも内側に載る）
    const dt = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) dt[i] = own[i] < 0 ? 0 : 1e9;
    for (const i of [].concat(...edges)) dt[i] = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!dt[i]) continue; let m = dt[i];
      if (x) m = Math.min(m, dt[i - 1] + 1);
      if (y) m = Math.min(m, dt[i - W] + 1);
      if (x && y) m = Math.min(m, dt[i - W - 1] + 1.414);
      if (x + 1 < W && y) m = Math.min(m, dt[i - W + 1] + 1.414);
      dt[i] = m;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!dt[i]) continue; let m = dt[i];
      if (x + 1 < W) m = Math.min(m, dt[i + 1] + 1);
      if (y + 1 < H) m = Math.min(m, dt[i + W] + 1);
      if (x + 1 < W && y + 1 < H) m = Math.min(m, dt[i + W + 1] + 1.414);
      if (x && y + 1 < H) m = Math.min(m, dt[i + W - 1] + 1.414);
      dt[i] = m;
    }
    const anchor = PROV.map(() => ({ x: 0, y: 0, r: -1, n: 0 }));
    for (let i = 0; i < W * H; i++) {
      const a = own[i]; if (a < 0) continue;
      anchor[a].n++;
      if (dt[i] > anchor[a].r) { anchor[a].r = dt[i]; anchor[a].x = i % W; anchor[a].y = (i / W) | 0; }
    }
    return { W, H, own, anchor, edges: edges.map(e => Int32Array.from(e)), provAdj, sx };
  }

  /* ── 描画 ───────────────────────────────────────────── */
  const cv = document.getElementById('map'), ctx = cv.getContext('2d');
  let buf = null, bufCtx = null, img = null;
  const SEA = [16, 24, 34];
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const RGB = Object.fromEntries(Object.entries(CLANS).map(([k, v]) => [k, hex2rgb(v.color)]));

  const state = {
    year: 1560, hover: -1, sel: -1, hoverClan: null,
    labProv: true, labClan: true, playing: false
  };

  function rulersFor(year) { return PROV.map(p => rulerAt(p.id, year)); }

  function paint() {
    if (!R) return;
    const { W, H, own } = R, rul = rulersFor(state.year);
    const dim = state.hoverClan;
    // 国ごとの塗り色を先に決めておく
    const fill = new Uint8Array(PROV.length * 3), isOther = new Uint8Array(PROV.length);
    PROV.forEach((p, i) => {
      const c = rul[i][1], base = RGB[c] || RGB.other;
      const off = dim && c !== dim ? 0.80 : 0;   // 凡例で家を指したとき、他家を海に寄せて沈める
      isOther[i] = c === 'other' ? 1 : 0;
      for (let k = 0; k < 3; k++) fill[i * 3 + k] = base[k] * (1 - off) + SEA[k] * off;
    });

    const d = img.data;
    const clanOf = new Uint8Array(PROV.length);
    const clanIds = [...new Set(rul.map(r => r[1]))];
    PROV.forEach((p, i) => clanOf[i] = clanIds.indexOf(rul[i][1]));

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, p = i * 4, a = own[i];
        let r, g, b;
        if (a < 0) { r = SEA[0]; g = SEA[1]; b = SEA[2]; }
        else {
          r = fill[a * 3]; g = fill[a * 3 + 1]; b = fill[a * 3 + 2];
          if (isOther[a] && ((x + y) % 10) < 4) {   // 網掛け＝ひとつの家にまとまっていない国
            r = r * 0.62 + 14; g = g * 0.62 + 18; b = b * 0.62 + 26;
          }
        }
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    // 境界: 海岸線は淡い明線、大名家の境は太めの暗線、国境は細い暗線
    const mix = (k, col, t) => { const p = k * 4;
      d[p] = d[p] * (1 - t) + col[0] * t;
      d[p + 1] = d[p + 1] * (1 - t) + col[1] * t;
      d[p + 2] = d[p + 2] * (1 - t) + col[2] * t; };
    const COAST = [58, 70, 88], CUT = [10, 13, 20];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, a = own[i];
        for (let e = 0; e < 2; e++) {
          const j = e ? i + W : i + 1;
          if (e ? y + 1 >= H : x + 1 >= W) continue;
          const nb = own[j];
          if (nb === a) continue;
          if (a < 0 || nb < 0) { mix(a < 0 ? j : i, COAST, 0.4); continue; }
          const t = clanOf[a] !== clanOf[nb] ? 0.62 : 0.26;
          mix(i, CUT, t); mix(j, CUT, t);
        }
      }
    }
    bufCtx.putImageData(img, 0, 0);

    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(buf, 0, 0, cv.width, cv.height);
    drawOutline(rul);
    drawLabels(rul);
    drawCartouche();
  }

  /* 地図の北西は日本列島が斜めに走るため必ず空く。そこに年を置き、
     帯を動かしながら地図から目を離さずに済むようにする。 */
  function drawCartouche() {
    const w = cv.width;
    if ((cv.clientWidth || w) < 520) return;
    const u = w / 1000, x = 50 * u, y = 92 * u;
    let era = ERAS[0];
    for (const e of ERAS) if (e[0] <= state.year) era = e;
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(201,162,39,.85)';
    ctx.font = `600 ${11 * u}px "Zen Kaku Gothic New", sans-serif`;
    ctx.fillText('西  暦', x, y - 34 * u);
    ctx.fillStyle = 'rgba(240,234,222,.92)';
    ctx.font = `800 ${64 * u}px "Shippori Mincho B1", serif`;
    ctx.fillText(String(state.year), x, y + 22 * u);
    ctx.fillStyle = 'rgba(189,182,168,.85)';
    ctx.font = `500 ${15 * u}px "Shippori Mincho B1", serif`;
    ctx.fillText(wareki(state.year), x, y + 48 * u);
    ctx.fillStyle = 'rgba(201,162,39,.6)';
    ctx.fillRect(x, y + 62 * u, 120 * u, u);
    ctx.fillStyle = 'rgba(189,182,168,.7)';
    ctx.font = `400 ${12.5 * u}px "Zen Kaku Gothic New", sans-serif`;
    ctx.fillText(era[2], x, y + 84 * u);
    ctx.restore();
  }

  function drawOutline(rul) {
    const focus = state.sel >= 0 ? state.sel : state.hover;
    if (focus < 0) return;
    const k = cv.width / R.W;
    ctx.save();
    ctx.fillStyle = state.sel === focus ? '#F4EDE0' : 'rgba(244,237,224,.72)';
    for (const i of R.edges[focus]) ctx.fillRect(((i % R.W) * k) | 0, (((i / R.W) | 0) * k) | 0, Math.max(1, k * 1.6), Math.max(1, k * 1.6));
    ctx.restore();
  }

  function drawLabels(rul) {
    const k = cv.width / R.W;
    const csw = cv.clientWidth || cv.width;        // 画面上の実寸（CSS px）
    const dpr = cv.width / csw;
    const px = v => v * dpr;                        // CSS px → キャンバス座標
    const provSize = Math.min(12, Math.max(7.5, csw / 95));
    const clanSize = Math.min(22, Math.max(11, csw / 48));
    const radius = i => R.anchor[i].r * k / dpr;    // 内接半径を CSS px で
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';

    const showProv = state.labProv && csw >= 520;   // 小さい画面では国名は畳む
    if (showProv) {
      ctx.font = `500 ${px(provSize)}px "Zen Kaku Gothic New", sans-serif`;
      PROV.forEach((p, i) => {
        if (radius(i) < provSize * 1.05) return;    // 字が収まらない小国は省く
        const a = R.anchor[i], t = p.short || p.name;
        const dy = state.labClan ? px(provSize * 0.85) : 0;
        ctx.lineWidth = px(provSize * 0.55); ctx.strokeStyle = 'rgba(8,11,17,.75)';
        ctx.strokeText(t, a.x * k, a.y * k + dy);
        ctx.fillStyle = 'rgba(238,232,220,.84)';
        ctx.fillText(t, a.x * k, a.y * k + dy);
      });
    }
    if (state.labClan) {
      // その位置で実際に横へ何画素取れるかを測る（同じ家の隣国へまたいでよい）
      const room = (i, clan) => {
        const a = R.anchor[i], W = R.W, y = a.y;
        let l = a.x, r = a.x;
        const same = x => { const o = R.own[y * W + x]; return o >= 0 && rul[o][1] === clan; };
        while (l > 0 && same(l - 1)) l--;
        while (r < W - 1 && same(r + 1)) r++;
        return Math.min(a.x - l, r - a.x) * k / dpr;   // 中央揃えなので狭い側が効く
      };
      // 大きい国から順に置き、同じ家でも離れていれば繰り返す
      // （関東と九州の徳川のように、一枚の地図で遠く離れた領地を持つ家に効く）
      const placed = [], MIND = csw * 0.21;
      const order = PROV.map((p, i) => i)
        .filter(i => rul[i][1] !== 'other' && PROV[i].id !== 'ezo')
        .sort((a, b) => R.anchor[b].r - R.anchor[a].r);
      for (const i of order) {
        const rad = radius(i);
        const size = Math.min(clanSize, Math.max(rad * 1.5, rad + 4));
        if (size < clanSize * 0.55) continue;
        const c = rul[i][1], t = CLANS[c].name;
        const a = R.anchor[i], x = a.x * k / dpr, y = a.y * k / dpr;
        if (placed.some(q => q.c === c && Math.hypot(q.x - x, q.y - y) < MIND)) continue;
        if (placed.some(q => Math.hypot(q.x - x, q.y - y) < size * 2.0)) continue;   // 名前どうしの衝突を避ける
        ctx.font = `700 ${px(size)}px "Shippori Mincho B1", serif`;
        if (ctx.measureText(t).width / 2 / dpr > room(i, c) * 0.95) continue;        // 横幅が足りなければ置かない
        const dy = showProv && rad >= provSize * 1.05 ? px(size * 0.45) : 0;
        ctx.lineWidth = px(size * 0.5); ctx.strokeStyle = 'rgba(8,11,17,.82)';
        ctx.strokeText(t, a.x * k, a.y * k - dy);
        ctx.fillStyle = '#F6F1E7';
        ctx.fillText(t, a.x * k, a.y * k - dy);
        placed.push({ c, x, y });
      }
    }
    ctx.restore();
  }

  /* ── 版面の組み直し ─────────────────────────────────── */
  const stage = document.querySelector('.stage');
  let resizeTimer = null;
  function layout() {
    const w = Math.max(320, stage.clientWidth);
    const h = Math.round(w / ASPECT);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const target = 3.2e6;
    const s = Math.max(1, Math.min(2, Math.sqrt(target / (w * h))));
    const RW = Math.round(w * s), RH = Math.round(RW / ASPECT);
    if (!R || R.W !== RW) {
      R = buildRaster(RW, RH);
      buf = document.createElement('canvas'); buf.width = R.W; buf.height = R.H;
      bufCtx = buf.getContext('2d'); img = bufCtx.createImageData(R.W, R.H);
    }
    // 縮尺（経度1度ぶんの x 単位 = 約111.3km）
    const kmPerPx = 111.32 * (V.lon1 - V.lon0) * KX / w;
    const nice = [50, 100, 200, 300, 500].find(d => d / kmPerPx >= 70) || 500;
    const sb = document.querySelector('.scalebar');
    sb.firstElementChild.style.width = Math.round(nice / kmPerPx) + 'px';
    sb.lastChild.nodeValue = 'およそ ' + nice + 'km';
    paint();
  }

  /* ── 右の柱 ─────────────────────────────────────────── */
  const el = id => document.getElementById(id);
  function renderSide() {
    const y = state.year, rul = rulersFor(y);
    el('year').firstChild.nodeValue = String(y);
    el('wareki').textContent = wareki(y);
    let era = ERAS[0];
    for (const e of ERAS) if (e[0] <= y) era = e;
    el('era').textContent = era[2];

    // その年の出来事、なければ直近のもの
    const ev = EVENTS.find(e => e[0] === y);
    const past = EVENTS.filter(e => e[0] <= y).slice(-1)[0];
    const box = el('event');
    if (ev) box.innerHTML = `<div class="ev-y">${ev[0]}年・${wareki(ev[0])}</div>
      <div class="ev-t">${ev[1]}</div><p class="ev-d">${ev[2]}</p>`;
    else if (past) box.innerHTML = `<div class="ev-y">直近 — ${past[0]}年</div>
      <div class="ev-t">${past[1]}</div><p class="ev-d">${past[2]}</p>`;
    else box.innerHTML = '<p class="ev-none">この年の記載はありません。</p>';

    // 勢力（石高順）
    const agg = new Map();
    PROV.forEach((p, i) => {
      if (p.id === 'ezo') return;
      const c = rul[i][1], a = agg.get(c) || { koku: 0, n: 0 };
      a.koku += KOKUDAKA[p.id]; a.n++; agg.set(c, a);
    });
    const rows = [...agg.entries()].sort((a, b) => b[1].koku - a[1].koku);
    const max = rows[0][1].koku;
    const shown = rows.slice(0, 12), rest = rows.slice(12);
    el('rank').innerHTML = shown.map(([c, a]) => `
      <li data-clan="${c}" class="${state.hoverClan && state.hoverClan !== c ? 'dim' : ''}">
        <span class="sw" style="background:${CLANS[c].color}"></span>
        <span class="nm">${CLANS[c].name}</span>
        <span class="kk">${(a.koku / 10).toFixed(0)}万石 / ${a.n}国</span>
        <span class="bar"><i class="${c === 'other' ? 'hatch' : ''}" style="width:${(a.koku / max * 100).toFixed(1)}%;${c === 'other' ? '' : 'background:' + CLANS[c].color}"></i></span>
      </li>`).join('') +
      (rest.length ? `<li style="opacity:.6"><span class="sw" style="background:var(--edge-hi)"></span>
        <span class="nm">ほか${rest.length}家</span>
        <span class="kk">${(rest.reduce((s, r) => s + r[1].koku, 0) / 10).toFixed(0)}万石</span></li>` : '');

    renderDetail(rul);
    drawShare();
    // 年表の現在位置
    el('rail-fill').style.width = ((y - Y0) / (Y1 - Y0) * 100) + '%';
    document.querySelectorAll('.eras span').forEach(s => s.classList.toggle('on', +s.dataset.s <= y && y < +s.dataset.e));
    document.querySelectorAll('.ticks button').forEach(b => b.classList.toggle('on', +b.dataset.y === y));
  }

  function renderDetail(rul) {
    const i = state.sel >= 0 ? state.sel : state.hover;
    const box = el('detail');
    if (i < 0) {
      box.innerHTML = '<h2>国を選ぶ</h2><p class="hint">地図の上を指すとその国の支配者が出ます。クリックで固定すると、応仁の乱から大坂の陣までの領主の移り変わりを一覧できます。</p>';
      return;
    }
    const p = PROV[i], now = rulerAt(p.id, state.year);
    const rows = HISTORY[p.id].map((s, k, arr) => {
      const end = arr[k + 1] ? arr[k + 1][0] - 1 : Y1;
      const on = s[0] <= state.year && state.year <= end;
      return `<li class="${on ? 'now' : ''}"><span class="c-y">${s[0]}–${end === Y1 ? '' : end}</span>${s[2]}</li>`;
    }).join('');
    box.innerHTML = `<h2>国のうつりかわり</h2>
      <p class="d-name">${p.name}</p>
      <p class="d-meta">${p.road}${p.id === 'ezo' ? '' : ' ・ ' + (KOKUDAKA[p.id] / 10).toFixed(1) + '万石'}
        ・ <span class="sw" style="background:${CLANS[now[1]].color}"></span> ${CLANS[now[1]].name}</p>
      <ul class="chron">${rows}</ul>`;
  }

  /* ── 石高シェアの推移 ─────────────────────────────── */
  const TOTAL = Object.values(KOKUDAKA).reduce((a, b) => a + b, 0);
  const SERIES = (() => {
    const peak = new Map();
    for (let y = Y0; y <= Y1; y++) {
      const m = new Map();
      PROV.forEach(p => { const c = rulerAt(p.id, y)[1]; m.set(c, (m.get(c) || 0) + KOKUDAKA[p.id]); });
      m.forEach((v, c) => { if (v > (peak.get(c) || 0)) peak.set(c, v); });
    }
    const top = [...peak.entries()].filter(e => e[0] !== 'other')
      .sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0]);
    const order = [...top, 'other', '__rest__'];
    const data = [];
    for (let y = Y0; y <= Y1; y++) {
      const m = new Map();
      PROV.forEach(p => { const c = rulerAt(p.id, y)[1]; m.set(c, (m.get(c) || 0) + KOKUDAKA[p.id]); });
      const row = order.map(c => c === '__rest__'
        ? [...m.entries()].filter(e => !order.includes(e[0])).reduce((s, e) => s + e[1], 0)
        : (m.get(c) || 0));
      data.push(row);
    }
    return { order, data };
  })();

  const share = document.getElementById('share'), sctx = share.getContext('2d');
  function drawShare() {
    const cssW = share.clientWidth || 280, cssH = 112;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    share.width = cssW * dpr; share.height = cssH * dpr;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, cssW, cssH);
    const pad = 16, h = cssH - pad - 4, bw = (cssW) / (Y1 - Y0 + 1);
    SERIES.data.forEach((row, i) => {
      let acc = 0;
      const x = i * bw;
      row.forEach((v, k) => {
        if (!v) return;
        const c = SERIES.order[k];
        const hgt = v / TOTAL * h;
        sctx.fillStyle = c === '__rest__' ? '#333B49' : CLANS[c].color;
        sctx.globalAlpha = c === '__rest__' ? .8 : (c === 'other' ? .75 : 1);
        sctx.fillRect(x, pad + h - acc - hgt, Math.ceil(bw) + .5, hgt + .5);
        acc += hgt;
      });
    });
    sctx.globalAlpha = 1;
    const cx = (state.year - Y0) * bw + bw / 2;
    sctx.fillStyle = '#E2542F'; sctx.fillRect(cx - .5, pad - 6, 1.5, h + 8);
    sctx.beginPath(); sctx.arc(cx, pad - 7, 3, 0, 7); sctx.fill();
    sctx.fillStyle = 'rgba(142,137,124,.95)';
    sctx.font = '9.5px "Zen Kaku Gothic New", sans-serif';
    sctx.textBaseline = 'top';
    sctx.fillText('1467', 0, 0); sctx.textAlign = 'right'; sctx.fillText('1615', cssW, 0);
    sctx.textAlign = 'left';
  }
  function shareSeek(e) {
    const r = share.getBoundingClientRect();
    setYear(Y0 + (e.clientX - r.left) / r.width * (Y1 - Y0));
  }
  share.addEventListener('pointerdown', e => { share.setPointerCapture(e.pointerId); setPlaying(false); shareSeek(e); });
  share.addEventListener('pointermove', e => { if (e.buttons) shareSeek(e); });

  /* ── 操作 ───────────────────────────────────────────── */
  const tip = el('tip');
  function provAt(ev) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / r.width * R.W);
    const y = Math.floor((ev.clientY - r.top) / r.height * R.H);
    if (x < 0 || y < 0 || x >= R.W || y >= R.H) return -1;
    return R.own[y * R.W + x];
  }
  cv.addEventListener('pointermove', e => {
    const i = provAt(e);
    if (i !== state.hover) { state.hover = i; paint(); if (state.sel < 0) renderDetail(rulersFor(state.year)); }
    if (i < 0) { tip.classList.remove('on'); return; }
    const p = PROV[i], now = rulerAt(p.id, state.year);
    tip.innerHTML = `<div class="t-p">${p.name}</div>
      <div class="t-l"><span class="sw" style="background:${CLANS[now[1]].color}"></span>${now[2]}</div>
      ${p.id === 'ezo' ? '' : `<div class="t-k">${(KOKUDAKA[p.id] / 10).toFixed(1)}万石</div>`}`;
    const r = cv.getBoundingClientRect();
    tip.style.left = (e.clientX - r.left) + 'px';
    tip.style.top = (e.clientY - r.top - 12) + 'px';
    tip.classList.add('on');
  });
  cv.addEventListener('pointerleave', () => {
    tip.classList.remove('on');
    if (state.hover !== -1) { state.hover = -1; paint(); renderDetail(rulersFor(state.year)); }
  });
  cv.addEventListener('click', e => {
    const i = provAt(e);
    state.sel = (i === state.sel) ? -1 : i;
    paint(); renderDetail(rulersFor(state.year));
  });

  const slider = el('slider');
  function setYear(y, from) {
    y = Math.max(Y0, Math.min(Y1, Math.round(y)));
    if (y === state.year) return;
    state.year = y;
    if (from !== 'slider') slider.value = String(y);
    paint(); renderSide();
  }
  slider.addEventListener('input', () => setYear(+slider.value, 'slider'));

  function setHoverClan(c) {
    if (c === state.hoverClan) return;
    state.hoverClan = c;
    // 一覧は組み直さず、沈める行の印だけ付け替える（指した瞬間にちらつかせない）
    el('rank').querySelectorAll('li[data-clan]').forEach(li =>
      li.classList.toggle('dim', !!c && li.dataset.clan !== c));
    paint();
  }
  el('rank').addEventListener('pointerover', e => {
    const li = e.target.closest('li[data-clan]');
    setHoverClan(li ? li.dataset.clan : null);
  });
  el('rank').addEventListener('pointerleave', () => setHoverClan(null));

  document.querySelectorAll('.chip[data-lab]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.lab === 'prov' ? 'labProv' : 'labClan';
    state[key] = !state[key];
    b.setAttribute('aria-pressed', String(state[key]));
    paint();
  }));

  let timer = null;
  const playBtn = el('play');
  function setPlaying(on) {
    state.playing = on;
    playBtn.setAttribute('aria-label', on ? '再生を止める' : '年を自動で進める');
    playBtn.innerHTML = on
      ? '<svg viewBox="0 0 12 12"><rect x="1" y="1" width="3.4" height="10"/><rect x="7.6" y="1" width="3.4" height="10"/></svg>'
      : '<svg viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z"/></svg>';
    clearInterval(timer);
    if (on) timer = setInterval(() => {
      if (state.year >= Y1) { setPlaying(false); return; }
      setYear(state.year + 1);
    }, 160);
  }
  playBtn.addEventListener('click', () => setPlaying(!state.playing));
  document.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => {
    setPlaying(false); setYear(state.year + (+b.dataset.d));
  }));
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea')) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!state.playing); }
    else if (e.key === 'ArrowLeft') { setPlaying(false); setYear(state.year - (e.shiftKey ? 10 : 1)); }
    else if (e.key === 'ArrowRight') { setPlaying(false); setYear(state.year + (e.shiftKey ? 10 : 1)); }
  });

  /* ── 年表の目盛りと出来事 ───────────────────────────── */
  const pct = y => ((y - Y0) / (Y1 - Y0) * 100) + '%';
  el('eras').innerHTML = ERAS.map(e =>
    `<span data-s="${e[0]}" data-e="${e[1]}" style="flex:${e[1] - e[0]} 1 0" title="${e[0]}–${e[1] - 1}">${e[2]}</span>`).join('');
  el('ticks').innerHTML = EVENTS.map(e =>
    `<button type="button" data-y="${e[0]}" style="left:${pct(e[0])}" title="${e[0]}年 ${e[1]}"><span class="sr">${e[0]}年 ${e[1]}</span></button>`).join('');
  el('ticks').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setPlaying(false); setYear(+b.dataset.y);
  });
  el('scale').innerHTML = [1470, 1500, 1530, 1560, 1590, 1615]
    .map(y => `<span style="left:${pct(y)}">${y}</span>`).join('');

  /* ── 起動 ───────────────────────────────────────────── */
  slider.min = Y0; slider.max = Y1; slider.value = state.year;
  layout(); renderSide(); setPlaying(false);
  window.addEventListener('resize', () => {
    drawShare();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 180);
  });
})();

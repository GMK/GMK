/* 実際にブラウザで開いて描画を確かめる */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await p.goto('file://' + __dirname + '/../sengoku-map.html');
  await p.waitForTimeout(2500);
  for (const y of (process.argv[2] ? process.argv[2].split(',') : ['1560'])) {
    await p.evaluate(yy => { const s = document.getElementById('slider');
      s.value = yy; s.dispatchEvent(new Event('input')); }, y);
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${__dirname}/shot-${y}.png`, fullPage: true });
  }
  const t = await p.evaluate(() => {
    const t0 = performance.now(); const s = document.getElementById('slider');
    for (let y = 1500; y < 1520; y++) { s.value = y; s.dispatchEvent(new Event('input')); }
    return (performance.now() - t0) / 20;
  });
  console.log('1年あたりの再描画', t.toFixed(1), 'ms');
  console.log(errs.length ? errs.join('\n') : 'コンソールエラーなし');
  await b.close();
})();

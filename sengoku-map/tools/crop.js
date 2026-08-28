/* 確認用に画面の一部を切り出して拡大する */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
  await p.goto('file://' + __dirname + '/../sengoku-map.html');
  await p.waitForTimeout(1800);
  await p.evaluate(() => { const s = document.getElementById('slider'); s.value = 1600; s.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(600);
  await p.locator('.stage').screenshot({ path: __dirname + '/crop.png', clip: { x: 0, y: 0, width: 1000, height: 1100 } });
  await b.close();
})();

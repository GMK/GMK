/* 操作まわりの動作確認: 地図のホバー・クリック、凡例のホバー、キー操作、狭い画面 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto('file://' + __dirname + '/../sengoku-map.html');
  await p.waitForTimeout(2000);

  const box = await p.locator('#map').boundingBox();
  // 甲斐のあたり（武田）を指す
  await p.mouse.move(box.x + box.width * 0.735, box.y + box.height * 0.485);
  await p.waitForTimeout(400);
  console.log('吹き出し:', (await p.locator('#tip').innerText()).replace(/\n/g, ' / '));
  await p.mouse.click(box.x + box.width * 0.735, box.y + box.height * 0.485);
  await p.waitForTimeout(400);
  console.log('選択カード:', (await p.locator('#detail').innerText()).split('\n').slice(0, 4).join(' / '));

  await p.locator('#rank li').first().hover(); await p.waitForTimeout(300);
  console.log('凡例ホバー時のdim行数:', await p.locator('#rank li.dim').count());

  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(300);
  console.log('キー操作後の年:', await p.locator('#year').innerText());
  await p.locator('.ticks button').nth(20).click(); await p.waitForTimeout(400);
  console.log('目盛りクリック後:', await p.locator('#year').innerText(), await p.locator('#era').innerText());

  await p.screenshot({ path: __dirname + '/shot-interact.png', fullPage: true });
  await p.setViewportSize({ width: 420, height: 900 });
  await p.waitForTimeout(900);
  await p.screenshot({ path: __dirname + '/shot-mobile.png', fullPage: true });
  console.log(errs.length ? errs.join('\n') : 'JS エラーなし');
  await b.close();
})();

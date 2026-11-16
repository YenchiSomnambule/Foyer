'use strict';
// Core grid: layout, add / rename / delete, context menu, drag reorder.
// (Formerly verify.js.) Runs on the first-run sample tiles.
const { launch, openDevice, reporter, baseLocal, shotPath } = require('./helpers');

(async () => {
  const r = reporter('Smoke: core grid');
  const browser = await launch();
  const { page } = await openDevice(browser, r, { local: baseLocal() });
  const tiles = () => page.locator('#grid .tile').count();

  const gridBox = await page.locator('#grid').boundingBox();
  const first   = await page.locator('.tile').first().boundingBox();
  r.ok(first && gridBox && first.x < gridBox.x + 100, `Tiles start from the grid's left edge (tile x=${Math.round(first?.x)}, grid x=${Math.round(gridBox?.x)})`);

  const xs = new Set((await Promise.all((await page.locator('.tile').all()).map(t => t.boundingBox()))).filter(Boolean).map(b => Math.round(b.x)));
  r.ok(xs.size >= 3, `Grid has multiple columns (${xs.size})`);

  const add = await page.locator('#add-btn').boundingBox();
  r.ok(add && add.x > 1280 - 200 && add.y > 800 - 200, 'Add button is fixed at bottom-right');
  await page.screenshot({ path: shotPath('smoke-1-initial') });

  const start = await tiles();
  await page.click('#add-btn');
  await page.waitForSelector('#add-modal:not(.hidden)', { timeout: 2000 });
  await page.fill('#url-input', 'https://news.ycombinator.com');
  await page.fill('#name-input', 'HN');
  await page.click('#confirm-add');
  await page.waitForTimeout(300);
  r.ok(await tiles() === start + 1, `Site added (${start} → ${await tiles()})`);

  await page.click('#add-btn');
  await page.waitForSelector('#add-modal:not(.hidden)');
  await page.click('#confirm-add');
  r.ok(await tiles() === start + 1, 'Empty URL is rejected');
  await page.keyboard.press('Escape');

  await page.locator('.tile').first().click({ button: 'right' });
  await page.waitForTimeout(150);
  r.ok(await page.locator('#context-menu:not(.hidden)').count() === 1, 'Right-click opens the context menu');
  await page.keyboard.press('Escape');

  await page.locator('.tile').first().click({ button: 'right' });
  await page.locator('#context-menu [data-action="rename"]').click();
  await page.fill('#rename-input', 'Renamed!');
  await page.click('#confirm-rename');
  await page.waitForTimeout(200);
  r.ok(await page.locator('.tile-name', { hasText: 'Renamed!' }).count() === 1, 'Rename updates the label');

  const before = await tiles();
  await page.locator('.tile').last().click({ button: 'right' });
  await page.locator('#context-menu [data-action="delete"]').click();
  await page.waitForTimeout(300);
  r.ok(await tiles() === before - 1, `Delete removes the tile (${before} → ${await tiles()})`);

  const b1 = await page.locator('.tile').nth(0).boundingBox();
  const b2 = await page.locator('.tile').nth(2).boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width / 2 + 10, b1.y + b1.height / 2, { steps: 3 });
  await page.mouse.move(b2.x + b2.width * 0.1, b2.y + b2.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  r.ok(await tiles() === before - 1, 'Drag reorder completes without losing tiles');
  await page.screenshot({ path: shotPath('smoke-2-after-drag') });

  await browser.close();
  r.done();
})();

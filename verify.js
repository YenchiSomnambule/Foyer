'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const DIR   = path.resolve(__dirname);
const SHOTS = path.join(DIR, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const CHROME_MOCK = `
window.chrome = {
  storage: {
    local: {
      _data: {},
      get(keys, cb) {
        const result = {};
        const k = Array.isArray(keys) ? keys : (typeof keys==='string'?[keys]:Object.keys(keys));
        k.forEach(key => { if (key in this._data) result[key] = this._data[key]; });
        if (cb) cb(result);
        return Promise.resolve(result);
      },
      set(obj, cb) {
        Object.assign(this._data, obj);
        if (cb) cb();
        return Promise.resolve();
      },
    },
  },
};
`;

let pass = true;
const findings = [];
let step = 0;

function log(emoji, label, detail='') {
  step++;
  console.log(`${step}. ${emoji} ${label}${detail?' → '+detail:''}`);
}
function find(msg) { findings.push(msg); console.log(`   ⚠️  ${msg}`); }
async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p });
  return p;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(CHROME_MOCK);

  const page = await ctx.newPage();
  page.on('pageerror', err => { find(`Page error: ${err.message}`); pass = false; });

  await page.goto(`file://${DIR}/newtab.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  // 1. Grid renders tiles from left
  await page.waitForSelector('#grid', { timeout: 5000 });
  const gridBox = await page.locator('#grid').boundingBox();
  const firstTile = page.locator('.tile').first();
  const firstBox = await firstTile.boundingBox();
  const startsLeft = firstBox && gridBox && firstBox.x < gridBox.x + 100;
  log(startsLeft ? '✅' : '❌', 'Tiles start from the left edge', `tile x=${Math.round(firstBox?.x)} grid x=${Math.round(gridBox?.x)}`);
  if (!startsLeft) pass = false;
  await shot(page, '1-initial-layout');

  // 2. Multiple columns (not a single column)
  const allTiles = await page.locator('.tile').all();
  const boxes = await Promise.all(allTiles.map(t => t.boundingBox()));
  const uniqueX = new Set(boxes.filter(Boolean).map(b => Math.round(b.x)));
  const multiCol = uniqueX.size >= 3;
  log(multiCol ? '✅' : '❌', 'Grid has multiple columns', `${uniqueX.size} distinct x positions`);
  if (!multiCol) pass = false;

  // 3. Add button is fixed at bottom-right
  const addBtn = page.locator('#add-btn');
  const addBox = await addBtn.boundingBox();
  const isBottomRight = addBox && addBox.x > 1280 - 200 && addBox.y > 800 - 200;
  log(isBottomRight ? '✅' : '❌', 'Add button is fixed at bottom-right', `x=${Math.round(addBox?.x)} y=${Math.round(addBox?.y)}`);
  if (!isBottomRight) pass = false;

  // 4. Add button opens modal
  await addBtn.click();
  await page.waitForSelector('#add-modal:not(.hidden)', { timeout: 2000 });
  log('✅', 'Add modal opens from fixed button');

  // 5. Add a site
  await page.fill('#url-input', 'https://news.ycombinator.com');
  await page.fill('#name-input', 'HN');
  await page.click('#confirm-add');
  await page.waitForTimeout(300);
  const tilesAfterAdd = await page.locator('.tile').count();
  log(tilesAfterAdd > allTiles.length ? '✅' : '❌', 'Site added to grid', `${allTiles.length} → ${tilesAfterAdd} tiles`);
  if (tilesAfterAdd <= allTiles.length) pass = false;
  await shot(page, '2-after-add');

  // 6. 🔍 Empty URL rejected
  await addBtn.click();
  await page.waitForSelector('#add-modal:not(.hidden)');
  await page.click('#confirm-add');
  const tilesAfterEmpty = await page.locator('.tile').count();
  log(tilesAfterEmpty === tilesAfterAdd ? '✅' : '❌', '🔍 Empty URL → no tile added');
  await page.keyboard.press('Escape');

  // 7. Right-click context menu
  await page.locator('.tile').first().click({ button: 'right' });
  await page.waitForTimeout(150);
  const ctxVisible = await page.locator('#context-menu:not(.hidden)').count();
  log(ctxVisible ? '✅' : '❌', '🔍 Right-click context menu appears');
  if (!ctxVisible) pass = false;
  await shot(page, '3-context-menu');
  await page.keyboard.press('Escape');

  // 8. Rename via context menu
  await page.locator('.tile').first().click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('#context-menu [data-action="rename"]').click();
  await page.waitForSelector('#rename-modal:not(.hidden)');
  await page.fill('#rename-input', 'Renamed!');
  await page.click('#confirm-rename');
  await page.waitForTimeout(200);
  const renamedVisible = await page.locator('.tile-name', { hasText: 'Renamed!' }).count();
  log(renamedVisible ? '✅' : '❌', 'Rename updates tile label');
  if (!renamedVisible) pass = false;

  // 9. Delete via context menu
  const countBefore = await page.locator('.tile').count();
  await page.locator('.tile').last().click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('#context-menu [data-action="delete"]').click();
  await page.waitForTimeout(300);
  const countAfter = await page.locator('.tile').count();
  log(countAfter < countBefore ? '✅' : '❌', '🔍 Delete removes tile', `${countBefore} → ${countAfter}`);
  if (countAfter >= countBefore) pass = false;

  // 10. Drag reorder (check that dragend triggers render without crash)
  const t1 = page.locator('.tile').nth(0);
  const t2 = page.locator('.tile').nth(2);
  const b1 = await t1.boundingBox();
  const b2 = await t2.boundingBox();
  if (b1 && b2) {
    await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
    await page.mouse.down();
    await page.mouse.move(b1.x + b1.width / 2 + 10, b1.y + b1.height / 2, { steps: 3 });
    await page.mouse.move(b2.x + b2.width * 0.1,   b2.y + b2.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const stillHasTiles = await page.locator('.tile').count() > 0;
    log(stillHasTiles ? '✅' : '❌', 'Drag reorder completes without crash');
    await shot(page, '4-after-drag');
  }

  await browser.close();

  console.log('\n' + '─'.repeat(56));
  console.log(`\n## Verification: Foyer layout + drag rewrite\n`);
  console.log(`**Verdict:** ${pass ? 'PASS' : 'FAIL'}\n`);
  console.log(`**Steps:** ${step}  |  **Screenshots:** ${SHOTS}`);
  if (findings.length) {
    console.log('\n### Findings');
    findings.forEach(f => console.log('  ⚠️ ', f));
  } else {
    console.log('\n### Findings\nNone.');
  }
  process.exit(pass ? 0 : 1);
})();

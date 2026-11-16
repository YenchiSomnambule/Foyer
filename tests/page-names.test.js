'use strict';
// Named page tabs show the name instead of the digit; digit keys still switch.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, shotPath } = require('./helpers');

(async () => {
  const r = reporter('Named page tabs');
  const browser = await launch();
  const pages = emptyPages();
  pages['1'] = [site('GitHub', 'https://github.com/')];
  pages['2'] = [site('Docs', 'https://docs.google.com/')];
  const { page } = await openDevice(browser, r, {
    local: baseLocal({ pages, pageNames: { 1: 'Home', 2: 'Work', 3: 'Side projects and reading list' } }), scale: 2,
  });
  const labels = () => page.$$eval('.page-btn', bs => bs.map(b => b.textContent));

  r.ok((await labels()).join() === 'Home,Work,Side projects and reading list,4,5,6,7,8,9,0', 'Named tabs show their name instead of the number');
  const w = await page.$eval('.page-btn[data-page="3"] .page-label', e => e.getBoundingClientRect().width);
  r.ok(w <= 72.5, `Long names are truncated (${Math.round(w)}px)`);
  await page.locator('.page-btn[data-page="3"]').hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath('page-names'), clip: { x: 300, y: 55, width: 700, height: 60 } });
  const tip = await page.$eval('.page-btn[data-page="3"]', e => getComputedStyle(e, '::before').content);
  r.ok(tip.includes('Side projects and reading list') && tip.includes('3'), `Tooltip shows full name + key (${tip})`);

  await page.keyboard.press('2');
  await page.waitForTimeout(300);
  r.ok(await page.$eval('.page-btn.active', e => e.dataset.page) === '2' && await page.locator('#grid .tile-name', { hasText: 'Docs' }).count() === 1, 'Pressing 2 still switches to "Work"');

  await page.locator('.page-btn[data-page="4"]').dblclick();
  await page.waitForTimeout(300);
  r.ok(await page.locator('#rename-modal:not(.hidden)').count() === 1, 'Double-clicking a tab opens rename');
  await page.fill('#rename-input', 'Music');
  await page.click('#confirm-rename');
  await page.waitForTimeout(200);
  r.ok((await labels())[3] === 'Music', 'Tab 4 now reads "Music"');

  await page.locator('.page-btn[data-page="1"]').click({ button: 'right' });
  await page.waitForTimeout(200);
  await page.fill('#rename-input', '');
  await page.click('#confirm-rename');
  await page.waitForTimeout(200);
  r.ok((await labels())[0] === '1', 'Clearing a name brings the number back');

  await browser.close();
  r.done();
})();

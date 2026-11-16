'use strict';
// Group overlay shows 3×3 = 9 sites per page; extra sites spill onto page 2.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, group, shotPath } = require('./helpers');

(async () => {
  const r = reporter('Group overlay: 3×3 pages');
  const browser = await launch();
  const names = ['Gmail', 'Drive', 'Docs', 'Sheets', 'Maps', 'Calendar', 'Notion', 'Figma', 'Slack', 'Zoom', 'Trello', 'Spotify'];
  const pages = emptyPages();
  pages['1'] = [group('Work', names.map(n => site(n, `https://${n.toLowerCase()}.example.com/`)))];
  const { page } = await openDevice(browser, r, { local: baseLocal({ pages }), scale: 2 });

  await page.locator('#grid .tile').first().click();
  await page.waitForTimeout(600);
  const perPage = await page.$$eval('.group-page', ps => ps.map(p => p.children.length));
  r.ok(JSON.stringify(perPage) === '[9,3]', `12 sites split 9 + 3 (${JSON.stringify(perPage)})`);
  const cols = await page.$eval('.group-page', el => new Set([...el.children].map(c => Math.round(c.getBoundingClientRect().x))).size);
  r.ok(cols === 3, `3 columns (${cols})`);
  r.ok(await page.locator('.group-dot').count() === 2, 'Two page dots');
  r.ok(await page.locator('#page-bar').isHidden(), 'Page bar hidden while the group is open');
  await page.locator('#group-panel').screenshot({ path: shotPath('group-3x3-page1') });

  await page.locator('.group-dot').nth(1).click();
  await page.waitForTimeout(500);
  await page.locator('#group-panel').screenshot({ path: shotPath('group-3x3-page2') });

  await browser.close();
  r.done();
})();

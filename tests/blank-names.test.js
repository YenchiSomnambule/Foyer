'use strict';
// Sites without a name stay blank — nothing is filled in from the URL.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, tileNames, shotPath } = require('./helpers');

(async () => {
  const r = reporter('Blank names');
  const browser = await launch();
  const pages = emptyPages();
  pages['1'] = [site('Google', 'https://www.google.com/')];
  const { page } = await openDevice(browser, r, {
    local: baseLocal({ pages }), bookmarks: true, scale: 2,
    bookmarksExtra: `node('20', '', '1', 'https://keep.google.com/'); node('21', '', '1', 'https://translate.google.com/'); node('22', 'Mail', '1', 'https://mail.google.com/');`,
  });

  await page.click('#quick-sync-bar');
  await page.waitForTimeout(800);
  const names = await tileNames(page);
  r.info(JSON.stringify(names));
  r.ok(names.join('|') === 'Google|My Bank|||Mail', 'Untitled bookmarks get blank names; titled ones keep theirs');

  await page.click('#add-btn');
  await page.fill('#url-input', 'github.com');
  await page.locator('#url-input').dispatchEvent('input');
  await page.waitForTimeout(300);
  r.ok(await page.inputValue('#name-input') === '', 'Add Site no longer auto-fills a name');
  await page.click('#confirm-add');
  await page.waitForTimeout(400);
  r.ok((await tileNames(page)).at(-1) === '', 'A site added without a name stays blank');

  await page.locator('#grid .tile').first().click({ button: 'right' });
  await page.locator('#context-menu [data-action="rename"]').click();
  await page.fill('#rename-input', '');
  await page.click('#confirm-rename');
  await page.waitForTimeout(300);
  r.ok((await tileNames(page))[0] === '', 'Rename can clear a name');

  const heights = await page.$$eval('#grid .tile', els => els.map(e => Math.round(e.getBoundingClientRect().height)));
  r.ok(new Set(heights).size === 1, `All tiles keep the same height (${[...new Set(heights)]})`);
  await page.screenshot({ path: shotPath('blank-names'), clip: { x: 260, y: 60, width: 1000, height: 180 } });

  await browser.close();
  r.done();
})();

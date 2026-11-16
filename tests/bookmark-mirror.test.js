'use strict';
// "Mirror to Chrome bookmarks": one-way, minimal edits, archive on mass removal,
// never touches the user's own bookmarks. Runs in English and 繁體中文.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, group, shotPath, clearAllTiles } = require('./helpers');

async function run(browser, r, lang) {
  const zh = lang === 'zh-TW';
  r.section(`Language: ${lang}`);
  const names = ['Gmail', 'Drive', 'Docs', 'Sheets', 'Maps', 'Calendar', 'Notion', 'Figma'];
  const pages = emptyPages();
  pages['1'] = [
    group('Work', names.slice(0, 4).map(n => site(n, `https://${n.toLowerCase()}.example.com/`))),
    ...names.slice(4).map(n => site(n, `https://${n.toLowerCase()}.example.com/`)),
  ];
  pages['2'] = [site('YouTube', 'https://www.youtube.com/')];
  const { page } = await openDevice(browser, r, { local: baseLocal({ lang, pages, pageNames: { 1: 'Home' } }), bookmarks: true, scale: 2 });
  const tree   = () => page.evaluate(() => window.__bmTree());
  const foyer  = async () => (await tree())[1]['Other bookmarks'].find(x => typeof x === 'object' && Object.keys(x)[0] === 'Foyer');
  const userOK = async () => { const s = JSON.stringify(await tree()); return s.includes('"Bookmarks bar":["My Bank"]') && s.includes('{"Recipes":["Pasta"]}'); };
  const ops    = () => page.evaluate(() => window.__ops.splice(0));
  const settle = () => page.waitForTimeout(2200);

  r.ok(!(await foyer()), 'Off by default — no Foyer folder');
  await page.click('#config-btn');
  await page.click('#bm-mirror-toggle');
  await page.waitForTimeout(800);
  await page.locator('#settings-card .ssec').filter({ has: page.locator('#bm-mirror-toggle') }).screenshot({ path: shotPath(`mirror-toggle-${lang}`) });
  await page.keyboard.press('Escape');
  const expected = { Foyer: [{ '1 · Home': [{ Work: ['Gmail', 'Drive', 'Docs', 'Sheets'] }, 'Maps', 'Calendar', 'Notion', 'Figma'] }, { [zh ? '第 2 頁' : 'Page 2']: ['YouTube'] }] };
  r.ok(JSON.stringify(await foyer()) === JSON.stringify(expected), 'Mirrors pages, groups and sites in order');
  r.ok(await userOK(), "User's own bookmarks untouched");

  await ops();
  await page.evaluate(() => { items.find(i => i.name === 'Maps').name = 'Google Maps'; save(); });
  await settle();
  let o = await ops();
  r.ok(JSON.stringify(await foyer()).includes('Google Maps') && o.join() === 'update', `Rename → one title update (${o.join() || 'none'})`);

  await page.evaluate(() => { items.reverse(); save(); });
  await settle();
  o = await ops();
  const order = Object.values((await foyer()).Foyer[0])[0].map(x => typeof x === 'string' ? x : Object.keys(x)[0]);
  r.ok(order.join() === 'Figma,Notion,Calendar,Google Maps,Work' && o.every(x => x === 'move'), `Reorder → moves only (${o.join()})`);

  await page.locator('#grid .tile', { hasText: 'Notion' }).click({ button: 'right' });
  await page.locator('#context-menu [data-action="delete"]').click();
  await settle();
  o = await ops();
  r.ok(!JSON.stringify(await foyer()).includes('Notion') && o.join() === 'remove', `Delete one tile → one bookmark removed (${o.join()})`);

  await clearAllTiles(page);
  await settle();
  const other = (await tree())[1]['Other bookmarks'];
  const archive = other.find(x => typeof x === 'object' && Object.keys(x)[0] === (zh ? 'Foyer 封存' : 'Foyer Archive'));
  r.ok(archive && JSON.stringify(archive).includes('Gmail') && JSON.stringify(archive).includes('YouTube'), 'Clear all → old folder moved into the archive, nothing lost');
  r.ok(JSON.stringify(await foyer()) === '{"Foyer":[]}', 'Fresh, empty Foyer folder');
  r.ok(await userOK(), "User's own bookmarks still untouched");

  await page.keyboard.press('Control+z');
  await settle();
  r.ok(JSON.stringify(await foyer()).includes('Gmail'), 'Ctrl+Z → Foyer folder rebuilt');

  await page.click('#config-btn');
  await page.click('#bm-mirror-toggle');
  await page.keyboard.press('Escape');
  await ops();
  await page.evaluate(() => { items.pop(); save(); });
  await settle();
  r.ok((await ops()).length === 0, 'Mirror off → bookmarks no longer change');
  await page.context().close();
}

(async () => {
  const r = reporter('Bookmark mirror');
  const browser = await launch();
  await run(browser, r, 'en');
  await run(browser, r, 'zh-TW');
  await browser.close();
  r.done();
})();

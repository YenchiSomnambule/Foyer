'use strict';
// Auto backups, restore UI, and undo that survives closing the tab.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, group, shotPath, clearAllTiles } = require('./helpers');

const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  const r = reporter('Auto backups + persistent undo');
  const browser = await launch();
  const names = ['Gmail', 'Drive', 'Docs', 'Sheets', 'Maps', 'Calendar', 'Notion', 'Figma', 'Slack'];
  const pages = emptyPages();
  pages['1'] = [
    group('Work', names.map(n => site(n, `https://${n.toLowerCase()}.example.com/`))),
    ...['Zoom', 'Trello', 'Spotify'].map(n => site(n, `https://${n.toLowerCase()}.example.com/`, { icon: ICON })),
  ];
  const dev = await openDevice(browser, r, { local: baseLocal({ pages, pageNames: { 1: 'Home' } }), scale: 2 });
  const L = dev.store.local;
  let page = dev.page;
  const tiles = () => page.locator('#grid .tile').count();

  r.section('Daily backup');
  r.ok(L.backups?.length === 1 && L.backups[0].reason === 'daily', 'Daily backup created on first open');
  r.ok(Object.keys(L.backupBlobs || {}).length === 1, 'The shared custom icon is stored once');
  r.ok(!JSON.stringify(L.backups).includes('data:image'), 'Backups hold icon references, not copies');

  r.section('Clear all → undo after reopening the tab');
  const before = await tiles();
  await clearAllTiles(page);
  await page.waitForTimeout(800);
  r.ok(await tiles() === 0, `Clear all removed every tile (${before} → 0)`);
  r.ok(L.backups.length === 1 && L.backups.at(-1).reason === 'clear', 'Identical daily backup relabelled "before clearing"');
  await page.close();
  page = await dev.open();
  r.ok(await tiles() === 0, 'Reopened tab is still empty');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(600);
  r.ok(await tiles() === before, 'Ctrl+Z works after reopening the tab');
  await page.close();

  r.section('Browser restart → restore from backup');
  dev.store.session = {};
  L.pages = emptyPages();
  page = await dev.open();
  r.ok(await tiles() === 0, 'Undo history gone, tiles empty');
  await page.click('#config-btn');
  await page.click('#settings-backups');
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotPath('backups-list') });
  await page.locator('.backup-restore-btn').first().click();
  await page.click('#confirm-modal-ok');
  await page.waitForTimeout(800);
  r.ok(await tiles() === before, `Restore brought back ${await tiles()} tiles`);
  r.ok(await page.locator('#grid .tile img[src^="data:image"]').count() === 3, 'Custom icons restored');
  r.ok(JSON.stringify(L.pageNames) === '{"1":"Home"}', 'Page names restored');

  r.section('Storage budget');
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) { items[0].icon = 'data:image/png;base64,' + String(i).repeat(600000); _createBackup('import'); }
    await _backupQueue;
  });
  const size = JSON.stringify(L.backups).length + JSON.stringify(L.backupBlobs).length;
  r.ok(size <= 3_000_000 && L.backups.length >= 1, `Backups stay under ~3M chars (${L.backups.length} kept, ${(size / 1e6).toFixed(2)}M)`);

  await browser.close();
  r.done();
})();

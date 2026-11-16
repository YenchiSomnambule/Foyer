'use strict';
// Notes across devices: three computers share one Google account's sync storage.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, Cloud, noteTexts, shotPath } = require('./helpers');

(async () => {
  const r = reporter('Notes cross-device sync');
  const browser = await launch();
  const cloud = new Cloud();
  const synced = () => (cloud.read('sn') || []).map(n => n.text);
  const pagesA = emptyPages();
  pagesA['1'] = [site('GitHub', 'https://github.com/')];

  r.section('First computer turns sync on');
  const A = await openDevice(browser, r, { name: 'A', cloud, local: baseLocal({ pages: pagesA, cloudSync: true, notes: [{ id: 'a1', text: 'Call dentist', color: 'yellow', at: 1 }] }) });
  await A.page.waitForTimeout(2000);
  r.ok(JSON.stringify(synced()) === '["Call dentist"]', 'A uploads its notes');

  r.section('Second computer');
  const B = await openDevice(browser, r, { name: 'B', cloud, local: baseLocal({ pages: emptyPages(), cloudSync: true }) });
  r.ok(JSON.stringify(await noteTexts(B.page)) === '["Call dentist"]', 'B shows A’s note on open');

  r.section('Live edit on A while B is idle');
  await A.page.locator('.note-text').first().fill('Call dentist at 3pm');
  await A.page.waitForTimeout(2200);
  r.ok((await noteTexts(B.page))[0] === 'Call dentist at 3pm', 'B updates live');
  const bk = (B.store.local.backups || []).filter(x => x.kind === 'notes');
  r.ok(bk.length === 1 && bk[0].reason === 'notesSync' && bk[0].notes[0].text === 'Call dentist', 'B backed up its old notes first');

  r.section('B is typing when A saves');
  await B.page.locator('.note-text').first().click();
  await B.page.keyboard.press('End');
  await B.page.keyboard.type(' (bring forms)');
  await A.page.locator('.note-text').first().fill('A edit while B types');
  await A.page.waitForTimeout(2200);
  r.ok((await noteTexts(B.page))[0] === 'Call dentist at 3pm (bring forms)', 'B’s text is not overwritten mid-typing');
  await B.page.waitForTimeout(4500);
  r.ok((await noteTexts(B.page))[0] === 'A edit while B types' && (await noteTexts(A.page))[0] === 'A edit while B types', 'Once B pauses, both show the last save (A’s)');
  r.ok((B.store.local.backups || []).some(x => x.kind === 'notes' && x.notes.some(n => n.text.endsWith('(bring forms)'))), 'B’s overwritten text is in its backups');
  await B.page.locator('.note-text').first().fill('B edits later');
  await B.page.waitForTimeout(2200);
  r.ok((await noteTexts(A.page))[0] === 'B edits later', 'An idle tab with the cursor in a note still updates');

  r.section('Tiles and notes stay independent');
  await A.page.evaluate(() => { items.push({ id: 'z', type: 'site', name: 'Zoom', url: 'https://zoom.us/' }); save(); render(); });
  await B.page.mouse.click(900, 600);
  await B.page.click('#add-note-btn');
  await B.page.keyboard.type('Groceries');
  await B.page.mouse.click(900, 600);
  await A.page.waitForTimeout(2500);
  const bTiles = await B.page.$$eval('#grid .tile-name', e => e.map(x => x.textContent));
  r.ok(bTiles.includes('Zoom') && bTiles.includes('GitHub'), 'A’s tile change reached B');
  const aNotes = await noteTexts(A.page);
  r.ok(aNotes.includes('Groceries') && aNotes.length === 2, 'B’s new note reached A — neither overwrote the other');

  r.section('Third computer that already had notes');
  const C = await openDevice(browser, r, { name: 'C', cloud, local: baseLocal({ pages: emptyPages(), cloudSync: true, notes: [{ id: 'c1', text: 'C-only idea', color: 'green', at: 1 }] }) });
  await C.page.waitForTimeout(2200);
  const cNotes = await noteTexts(C.page);
  r.ok(cNotes.length === 3 && cNotes.includes('C-only idea') && cNotes.includes('Groceries'), 'First sync merges C’s notes with the synced ones');
  r.ok(synced().includes('C-only idea') && (await noteTexts(A.page)).includes('C-only idea'), '…and shares the merge');

  r.section('Restore notes from a backup');
  await B.page.click('#config-btn');
  await B.page.click('#settings-backups');
  await B.page.waitForTimeout(500);
  await B.page.screenshot({ path: shotPath('notes-sync-backups') });
  const rows = await B.page.$$eval('.backup-meta', e => e.map(x => x.textContent));
  await B.page.locator('.backup-restore-btn').nth(rows.findIndex(x => x.includes('note'))).click();
  r.ok(/Your tiles are not affected/.test(await B.page.$eval('#confirm-modal-body', e => e.textContent)), 'Confirmation says tiles are unaffected');
  const tilesBefore = await B.page.locator('#grid .tile').count();
  await B.page.click('#confirm-modal-ok');
  await B.page.waitForTimeout(500);
  r.ok(await B.page.locator('#grid .tile').count() === tilesBefore, 'Restoring notes leaves tiles alone');

  r.section('Size limit');
  await A.page.waitForTimeout(2500);
  const before = JSON.stringify(synced());
  await A.page.locator('.note-text').first().fill('x'.repeat(16000));
  await A.page.waitForTimeout(2200);
  r.ok(JSON.stringify(synced()) === before, 'Notes over 15 KB are not uploaded');
  r.ok(/too long to sync/.test(await A.page.$eval('#toast', e => e.textContent)), '…and the user is told they stay local');

  r.section('Sync off');
  await C.page.click('#config-btn');
  await C.page.click('#cloud-sync-toggle');
  await C.page.keyboard.press('Escape');
  const snapshot = JSON.stringify(cloud.data);
  await C.page.click('#add-note-btn');
  await C.page.keyboard.type('private');
  await C.page.mouse.click(900, 600);
  await C.page.waitForTimeout(2200);
  r.ok(JSON.stringify(cloud.data) === snapshot, 'With sync off, notes stay local');

  await browser.close();
  r.done();
})();

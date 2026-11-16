'use strict';
// Cross-feature regressions found in the v2.6.1 compatibility review.
const fs   = require('fs');
const path = require('path');
const { launch, openDevice, reporter, baseLocal, emptyPages, site, Cloud, tileNames, clearAllTiles, SHOTS } = require('./helpers');

(async () => {
  const r = reporter('Compatibility between features');
  const browser = await launch();

  r.section('Bookmark mirror archive vs. "Sync all bookmarks" / Import');
  {
    const pages = emptyPages();
    pages['1'] = ['Gmail', 'Drive', 'Docs', 'Sheets', 'Maps', 'Calendar'].map(n => site(n, `https://${n.toLowerCase()}.example.com/`));
    const dev = await openDevice(browser, r, { local: baseLocal({ pages, bmMirror: true }), bookmarks: true, wait: 4500 });
    const p = dev.page;
    await clearAllTiles(p);
    await p.waitForTimeout(2500);
    const tree = JSON.stringify(await p.evaluate(() => window.__bmTree()));
    r.ok(tree.includes('Foyer Archive') && tree.includes('Gmail'), 'Clear all archived the mirrored bookmarks');
    await p.click('#quick-sync-all');
    await p.waitForTimeout(800);
    const names = await tileNames(p);
    r.ok(names.join() === 'My Bank,Pasta', `Sync all bookmarks imports only the user's own bookmarks (${names.join()})`);
    await p.click('#config-btn');
    await p.click('#settings-import-bm');
    await p.waitForTimeout(800);
    const listed = await p.$eval('#import-list', e => e.textContent);
    r.ok(!listed.includes('Foyer') && !listed.includes('Gmail'), "Import Bookmarks hides Foyer's own folders");
    await dev.ctx.close();
  }

  r.section('Stale device + one-time cleanup + cross-device sync');
  {
    const remote = emptyPages();
    remote['1'] = [site('Mail', 'https://mail.google.com/'), site('docs.google.com', 'https://docs.google.com/'), site('Maps', 'https://maps.google.com/')];
    const cloud = new Cloud({ sv_meta: { v: 1, at: 5000, n: 1 }, sv_0: JSON.stringify({ pages: remote, pageNames: {} }) });
    const stale = emptyPages();
    stale['1'] = [site('x.com', 'https://x.com/')];
    const dev = await openDevice(browser, r, {
      cloud, local: { tutorialDone: true, pages: stale, pagesAt: 1000, cloudSync: true },
      session: { undoStack: [{ page: '1', pages: emptyPages() }] }, wait: 2500,
    });
    r.ok((await tileNames(dev.page)).join('|') === 'Mail||Maps', 'Stale device adopts newer cloud tiles first, then clears host names');
    r.ok(!JSON.stringify(cloud.read('sv')).includes('x.com'), 'Stale tiles never overwrite the cloud copy');
    r.ok(dev.store.session.undoStack.length === 0, 'Undo history is cleared after adopting synced tiles');
    await dev.ctx.close();
  }

  r.section('Favicon caching is not an "edit" (network)');
  if (process.env.FOYER_OFFLINE) {
    console.log('   SKIPPED (FOYER_OFFLINE)');
  } else {
    const u = 'https://radar.zzq-internal-demo.io/';
    const pages = emptyPages();
    pages['1'] = [
      site('Radar', u, { favicon: `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(new URL(u).origin)}&size=128` }),
      site('GitHub', 'https://github.com/'),
    ];
    const dev = await openDevice(browser, r, { local: baseLocal({ pages, pagesAt: 1000 }), wait: 7000 });
    const L = dev.store.local;
    r.ok(!('favicon' in L.pages['1'][0]) && !!L.pages['1'][1].favicon, 'Stale globe dropped, GitHub favicon cached');
    r.ok(L.pagesAt === 1000, `…without bumping the edit timestamp (pagesAt ${L.pagesAt})`);
    await dev.ctx.close();
  }

  r.section('Import a backup file that contains notes');
  {
    const pages = emptyPages();
    pages['1'] = [site('A', 'https://a.example/')];
    const dev = await openDevice(browser, r, { local: baseLocal({ pages, notes: [{ id: 'n1', text: 'current note', color: 'yellow', at: 1 }] }) });
    fs.mkdirSync(SHOTS, { recursive: true });
    const file = path.join(SHOTS, 'import-with-notes.json');
    fs.writeFileSync(file, JSON.stringify({ version: 2, pages: { ...emptyPages(), 1: [site('B', 'https://b.example/')] },
      notes: [{ id: 'x', text: 'from backup', color: 'blue' }, { id: 'y', text: 'second', color: 'pink' }] }));
    await dev.page.setInputFiles('#json-import-input', file);
    await dev.page.waitForTimeout(500);
    r.ok(/notes will also be replaced by the 2 notes/.test(await dev.page.$eval('#confirm-modal-body', e => e.textContent)), 'The confirmation warns that notes are replaced too');
    await dev.page.click('#confirm-modal-ok');
    await dev.page.waitForTimeout(600);
    r.ok(dev.store.local.notes.map(n => n.text).join() === 'from backup,second' && (await tileNames(dev.page)).join() === 'B', 'Tiles and notes both come from the file');
    await dev.ctx.close();
  }

  r.section('Typing in a note while a tile is keyboard-focused');
  {
    const pages = emptyPages();
    pages['1'] = [site('A', 'https://a.example/'), site('B', 'https://b.example/')];
    const dev = await openDevice(browser, r, { local: baseLocal({ pages }) });
    const p = dev.page;
    await p.keyboard.press('ArrowRight');
    await p.click('#add-note-btn');
    await p.keyboard.type('x');
    await p.keyboard.press('Backspace');
    await p.keyboard.press('Delete');
    await p.keyboard.type('hello');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(400);
    r.ok((await tileNames(p)).length === 2, 'Backspace / Delete / Enter in a note never delete or open the focused tile');
    r.ok(p.url().startsWith('file://'), 'Still on the new-tab page');
    await dev.ctx.close();
  }

  await browser.close();
  r.done();
})();

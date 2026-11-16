'use strict';
// One-time "What's new" card for people updating from an older version.
const { launch, openDevice, reporter, emptyPages, site, shotPath, WHATS_NEW_ID } = require('./helpers');

(async () => {
  const r = reporter("What's new card");
  const browser = await launch();
  const pages = emptyPages();
  pages['1'] = ['GitHub|https://github.com/', 'YouTube|https://www.youtube.com/', 'Gmail|https://mail.google.com/', 'Docs|https://docs.google.com/']
    .map(x => { const [n, u] = x.split('|'); return site(n, u); });
  // What an existing user's storage looks like right after updating from 2.x
  const updater = extra => ({ tutorialDone: true, hostNamesCleared: true, pages, ...extra });
  const card = p => p.locator('#whats-new');

  r.section('Existing user updates');
  let dev = await openDevice(browser, r, { local: updater({ lang: 'zh-TW' }), scale: 2 });
  let p = dev.page;
  r.ok(await card(p).isVisible(), 'Card shows on the first new tab after updating');
  r.ok((await p.textContent('#whats-new-title')).includes('新功能') && (await p.textContent('#whats-new-list')).includes('便條'), 'Mentions the notes (in the user’s language)');
  const c = await card(p).boundingBox(), head = await p.locator('#notes-head').boundingBox();
  r.ok(c.x >= head.x - 2 && c.x + c.width <= head.x + head.width + 2 && c.y > head.y + head.height, 'Sits in the notes column, under "+ New note"');
  await p.screenshot({ path: shotPath('whats-new') });
  await p.click('#wn-ok');
  r.ok(await card(p).isHidden() && dev.store.local.whatsNewSeen === WHATS_NEW_ID, '"知道了" closes it and remembers');
  await p.close();
  p = await dev.open();
  r.ok(await card(p).isHidden(), 'Not shown again');
  await dev.ctx.close();

  r.section('"I don’t need notes"');
  dev = await openDevice(browser, r, { local: updater({}) });
  p = dev.page;
  await p.click('#wn-hide-notes');
  await p.waitForTimeout(400);
  r.ok(await card(p).isHidden() && await p.locator('#notes-panel').isHidden(), 'Closes the card and collapses the notes column');
  r.ok(dev.store.local.notesCollapsed === true && dev.store.local.whatsNewSeen === WHATS_NEW_ID, 'Both choices are saved');
  await dev.ctx.close();

  r.section('Ignored card');
  dev = await openDevice(browser, r, { local: updater({}) });
  const seen = [await card(dev.page).isVisible()];
  for (let i = 0; i < 3; i++) { await dev.page.close(); await dev.open(); seen.push(await card(dev.page).isVisible()); }
  r.ok(seen.join() === 'true,true,true,false', `Stops after 3 new tabs if ignored (${seen.join()})`);
  await dev.ctx.close();

  r.section('New install');
  dev = await openDevice(browser, r, { local: { hostNamesCleared: true, pages } });
  p = dev.page;
  r.ok(await p.locator('#tutorial-overlay').isVisible() && await card(p).isHidden(), 'Tutorial instead of the card');
  await p.click('#tutorial-skip');
  await p.close();
  p = await dev.open();
  r.ok(await card(p).isHidden() && dev.store.local.whatsNewSeen === WHATS_NEW_ID, 'No card after the tutorial either');
  await dev.ctx.close();

  r.section('Never together with the rating prompt');
  const due = { installDate: Date.now() - 30 * 86400000, tabOpens: 100 };
  dev = await openDevice(browser, r, { local: updater(due), wait: 3000 });
  r.ok(await card(dev.page).isVisible() && await dev.page.locator('#rate-card').isHidden(), 'Rating card waits while "What’s new" is up');
  await dev.page.click('#wn-ok');
  await dev.page.close();
  await dev.open(3000);
  r.ok(await dev.page.locator('#rate-card').isVisible(), 'Rating card can appear on a later new tab');
  await dev.ctx.close();

  r.section('Narrow window');
  dev = await openDevice(browser, r, { local: updater({}), viewport: { width: 700, height: 800 } });
  const nb = await card(dev.page).boundingBox();
  r.ok(await card(dev.page).isVisible() && nb.y + nb.height > 700 && await dev.page.locator('#wn-hide-notes').isHidden(), 'Floats at the bottom-left without the notes button');
  await dev.ctx.close();

  await browser.close();
  r.done();
})();

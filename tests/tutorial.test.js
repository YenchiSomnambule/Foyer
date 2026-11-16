'use strict';
// First-run tour: 10 steps incl. "Sticky notes", which points at the notes
// header, or at the edge tab when collapsed, or centres itself when hidden.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, shotPath } = require('./helpers');

const NOTES_STEP = 6;   // 0-based

async function walkTo(page, step) {
  for (let i = 0; i < step; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(80); }
  await page.waitForTimeout(250);
}
const spotOn = async (page, sel) => {
  const s = await page.locator('#tutorial-spotlight').boundingBox();
  const t = await page.locator(sel).boundingBox();
  return s && t && s.x <= t.x && s.y <= t.y && s.x + s.width >= t.x + t.width && s.y + s.height >= t.y + t.height;
};

(async () => {
  const r = reporter('Tutorial');
  const browser = await launch();
  const pages = emptyPages();
  pages['1'] = [site('GitHub', 'https://github.com/'), site('Docs', 'https://docs.google.com/')];
  const fresh = extra => ({ ...baseLocal({ pages, ...extra }), tutorialDone: false });

  r.section('Notes column open');
  let dev = await openDevice(browser, r, { local: fresh({ lang: 'zh-TW' }), scale: 2 });
  let p = dev.page;
  r.ok(await p.locator('#tutorial-overlay').isVisible(), 'Tour starts on first run');
  r.ok(await p.locator('#tutorial-dots .t-dot').count() === 10, '10 steps');
  await walkTo(p, NOTES_STEP);
  r.ok(await p.textContent('#tutorial-title') === '便條', `Step 7 is "便條" (${await p.textContent('#tutorial-title')})`);
  r.ok(await spotOn(p, '#notes-head'), 'Spotlight is on the notes header');
  await p.screenshot({ path: shotPath('tutorial-notes') });
  await p.keyboard.press('Enter');
  await walkTo(p, 2);
  r.ok((await p.textContent('#tutorial-body')).includes('從備份還原'), 'Settings step mentions restoring from backup');
  await p.screenshot({ path: shotPath('tutorial-settings') });
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  r.ok(await p.locator('#tutorial-overlay').isHidden() && dev.store.local.tutorialDone === true, 'Tour finishes and is remembered');
  await dev.ctx.close();

  r.section('Notes column collapsed');
  dev = await openDevice(browser, r, { local: fresh({ notesCollapsed: true, lang: 'en' }) });
  p = dev.page;
  await walkTo(p, NOTES_STEP);
  r.ok(await p.textContent('#tutorial-title') === 'Sticky notes', 'Step 7 is "Sticky notes"');
  r.ok(await spotOn(p, '#notes-expand-btn'), 'Spotlight moves to the edge tab');
  await dev.ctx.close();

  r.section('Narrow window (notes hidden)');
  dev = await openDevice(browser, r, { local: fresh({ lang: 'en' }), viewport: { width: 700, height: 800 } });
  p = dev.page;
  await walkTo(p, NOTES_STEP);
  r.ok(await p.$eval('#tutorial-spotlight', e => e.style.opacity) === '0', 'No spotlight on a hidden column');
  const card = await p.locator('#tutorial-card').boundingBox();
  r.ok(Math.abs(card.x + card.width / 2 - 350) < 4, 'Card is centred instead');
  await dev.ctx.close();

  await browser.close();
  r.done();
})();

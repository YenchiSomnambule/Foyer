'use strict';
// Sticky notes column: layout, typing never triggers tile shortcuts, colours,
// persistence, empty-note cleanup, delete confirmation. Light and dark themes.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, shotPath, noteTexts } = require('./helpers');

async function run(browser, r, theme) {
  r.section(`Theme: ${theme}`);
  const pages = emptyPages();
  pages['1'] = ['GitHub|https://github.com/', 'YouTube|https://www.youtube.com/', 'Gmail|https://mail.google.com/', 'Docs|https://docs.google.com/',
    'Maps|https://maps.google.com/', 'Notion|https://www.notion.so/', 'Figma|https://www.figma.com/', 'Slack|https://slack.com/']
    .map(x => { const [n, u] = x.split('|'); return site(n, u); });
  pages['2'] = [site('X', 'https://x.com/')];
  const dev = await openDevice(browser, r, { local: baseLocal({ theme, lang: 'zh-TW', pages }), scale: 2 });
  const L = dev.store.local;
  let p = dev.page;

  const panel = await p.locator('#notes-panel').boundingBox();
  const tile  = await p.locator('#grid .tile').first().boundingBox();
  r.ok(tile.x > panel.x + panel.width, 'Tiles start to the right of the notes column');

  await p.click('#add-note-btn');
  await p.keyboard.type('Call dentist 2/3 tomorrow\nBring forms');
  await p.waitForTimeout(500);
  r.ok(await p.$eval('.page-btn.active', e => e.dataset.page) === '1', 'Typing digits in a note does not switch pages');
  r.ok(await p.locator('#search-overlay:not(.hidden)').count() === 0, 'Typing "/" in a note does not open search');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  r.ok(await p.locator('#grid .tile').count() === 8, 'Ctrl+Z in a note does not undo tiles…');
  r.ok(!(await p.$eval('.note-text', e => e.value)).endsWith('Bring forms'), '…it undoes the note text instead');
  await p.keyboard.press('Control+Shift+z');
  await p.waitForTimeout(300);
  r.ok((await p.$eval('.note-text', e => e.value)).endsWith('Bring forms'), 'Ctrl+Shift+Z redoes it');

  await p.click('#add-note-btn');
  await p.keyboard.type('Q4 goals:\n• Ship Foyer 2.6\n• Write blog post');
  await p.locator('.note').first().locator('.note-dot.note-blue').click();
  await p.click('#add-note-btn');
  await p.keyboard.type('Groceries — milk, eggs, coffee beans');
  await p.locator('.note').first().locator('.note-dot.note-pink').click();
  await p.click('#add-note-btn');           // an empty note…
  await p.mouse.click(900, 600);            // …that loses focus
  await p.waitForTimeout(500);
  r.ok(L.notes.length === 3, `Empty note discarded on blur (${L.notes.length} saved)`);
  r.ok(L.notes.map(n => n.color).join() === 'pink,blue,yellow', 'Colours saved');
  await p.screenshot({ path: shotPath(`notes-${theme}`) });

  await p.close();
  p = await dev.open();
  const texts = await noteTexts(p);
  r.ok(texts.length === 3 && texts[2].startsWith('Call dentist'), 'Notes persist after reopening the tab');

  await p.locator('.note').nth(1).hover();
  await p.locator('.note').nth(1).locator('.note-del').click();
  r.ok(await p.locator('#confirm-modal:not(.hidden)').count() === 1, 'Deleting a note with text asks first');
  await p.click('#confirm-modal-ok');
  await p.waitForTimeout(400);
  r.ok(L.notes.length === 2 && !L.notes.some(n => n.text.startsWith('Q4')), 'Note deleted after confirming');

  // Collapse / expand
  await p.locator('#notes-head').screenshot({ path: shotPath(`notes-head-${theme}`) });
  await p.click('#notes-collapse-btn');
  await p.waitForTimeout(500);
  const firstX = async () => (await p.locator('#grid .tile').first().boundingBox()).x;
  r.ok(await p.locator('#notes-panel').isHidden(), 'Collapse hides the notes column');
  r.ok(await firstX() < 100, `Tiles move back to the left (${Math.round(await firstX())}px)`);
  r.ok(await p.locator('#notes-expand-btn').isVisible() && (await p.textContent('#notes-count')) === '2', 'A tab at the left edge shows the note count');
  r.ok(L.notesCollapsed === true, 'Collapsed state saved');
  await p.screenshot({ path: shotPath(`notes-collapsed-${theme}`) });
  await p.close();
  p = await dev.open();
  r.ok(await p.locator('#notes-panel').isHidden() && await firstX() < 100, 'Still collapsed after reopening the tab');
  await p.click('#notes-expand-btn');
  await p.waitForTimeout(500);
  const pb = await p.locator('#notes-panel').boundingBox();
  r.ok(await p.locator('#notes-panel').isVisible() && await firstX() > pb.x + pb.width, 'Expand brings the column back and tiles move right');
  r.ok(await p.locator('#notes-expand-btn').isHidden() && L.notesCollapsed === false, 'Edge tab hidden again, state saved');

  const narrow = await dev.ctx.newPage();
  await narrow.setViewportSize({ width: 700, height: 800 });
  await narrow.goto(p.url());
  await narrow.waitForTimeout(800);
  r.ok(await narrow.locator('#notes-panel').isHidden(), 'Narrow window (< 720px) hides the notes column');
  await dev.ctx.close();
}

(async () => {
  const r = reporter('Sticky notes');
  const browser = await launch();
  await run(browser, r, 'cream');
  await run(browser, r, 'dark');
  await browser.close();
  r.done();
})();

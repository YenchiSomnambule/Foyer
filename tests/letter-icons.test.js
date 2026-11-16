'use strict';
// Sites with no favicon (Google answers with a 16×16 globe) get a white-on-black
// letter tile in every theme. NEEDS INTERNET (real favicon lookups); skipped
// when FOYER_OFFLINE=1.
const { launch, openDevice, reporter, baseLocal, emptyPages, site, group, shotPath } = require('./helpers');

const unknown = h => `https://${h}.zzq-internal-demo.io/`;
const globe = u => `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(new URL(u).origin)}&size=128`;

(async () => {
  const r = reporter('Letter icons (network)');
  if (process.env.FOYER_OFFLINE) { console.log('SKIPPED (FOYER_OFFLINE)'); r.done(); return; }
  const browser = await launch();
  for (const theme of ['cream', 'dark', 'blue']) {
    r.section(`Theme: ${theme}`);
    const pages = emptyPages();
    pages['1'] = [
      site('Radar Demo', unknown('radar'), { favicon: globe(unknown('radar')) }),   // globe cached by an older version
      site('Account: Accounts', unknown('account')),
      site('Contact: Contacts', unknown('contact')),
      site('GitHub', 'https://github.com/'),
      group('Mixed', [site('Ops', unknown('ops')), site('Google', 'https://www.google.com/'), site('', unknown('wiki'))]),
    ];
    const dev = await openDevice(browser, r, { local: baseLocal({ theme, pages }), scale: 2, wait: 7000 });
    const p = dev.page;
    const state = await p.$$eval('#grid .site-tile', ts => ts.map(t => {
      const f = t.querySelector('.tile-icon-fallback'); const cs = getComputedStyle(f);
      return { letter: f.style.display !== 'none' ? f.textContent : null, bg: cs.backgroundColor, fg: cs.color };
    }));
    r.ok(state.slice(0, 3).map(s => s.letter).join() === 'R,A,C', 'Unknown sites show their first letter');
    r.ok(state[3].letter === null, 'GitHub keeps its real favicon');
    r.ok(state[0].bg === 'rgb(28, 26, 23)' && state[0].fg === 'rgb(255, 255, 255)', 'Letter tile is white on black');
    r.ok(!('favicon' in dev.store.local.pages['1'][0]), 'A globe cached by an older version is dropped');
    await p.screenshot({ path: shotPath(`letter-icons-${theme}`), clip: { x: 260, y: 70, width: 900, height: 120 } });
    if (theme === 'cream') {
      await p.locator('#grid .group-tile').click();
      await p.waitForTimeout(3500);
      const fb = await p.$$eval('.group-site-fallback', els => els.filter(e => e.style.display !== 'none').map(e => e.textContent));
      r.ok(fb.join() === 'O,W', `Group overlay uses letters too, incl. the unnamed site (${fb.join()})`);
      await p.locator('#group-panel').screenshot({ path: shotPath('letter-icons-group') });
    }
    await dev.ctx.close();
  }
  await browser.close();
  r.done();
})();

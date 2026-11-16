'use strict';
// One-time cleanup (v2.5.1) of names that are exactly the site's own host.
const { launch, openDevice, reporter, emptyPages } = require('./helpers');

(async () => {
  const r = reporter('One-time host-name cleanup');
  const browser = await launch();
  const pages = emptyPages();
  pages['1'] = [
    { id: 'a', type: 'site', name: 'keep.google.com', url: 'https://keep.google.com/' },
    { id: 'b', type: 'site', name: 'google.com', url: 'https://www.google.com/' },
    { id: 'c', type: 'site', name: 'My Mail', url: 'https://mail.google.com/' },
    { id: 'd', type: 'site', name: 'Github', url: 'https://github.com/' },
    { id: 'g', type: 'group', name: 'Work', items: [
      { id: 's1', name: 'translate.google.com', url: 'https://translate.google.com/' },
      { id: 's2', name: 'Docs', url: 'https://docs.google.com/' } ] },
  ];
  const dev = await openDevice(browser, r, { local: { tutorialDone: true, pages } });
  const L = dev.store.local;
  const names = L.pages['1'].map(i => i.type === 'group' ? i.items.map(s => s.name).join('+') : i.name);
  r.info(JSON.stringify(names));
  r.ok(names.join('|') === '||My Mail|Github|+Docs', 'Host-named tiles cleared (www and groups too); typed names kept');
  r.ok(JSON.stringify(await dev.page.$$eval('#grid .tile-name', e => e.map(x => x.textContent))) === '["","","My Mail","Github","Work"]', 'Grid shows them blank');
  r.ok(L.backups?.at(-1)?.reason === 'cleanup', 'A backup was taken first');
  r.ok(L.hostNamesCleared === true, 'Marked as done');

  await dev.page.close();
  L.pages['1'][2].name = 'mail.google.com';   // the user chooses a host-like name later
  await dev.open();
  r.ok(L.pages['1'][2].name === 'mail.google.com', 'Runs only once — later choices are respected');

  await browser.close();
  r.done();
})();

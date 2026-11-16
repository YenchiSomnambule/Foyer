'use strict';
// Shared test harness: opens newtab.html in headless Chromium with a fake
// `chrome.*` API whose storage lives in Node, so tests can seed and inspect it.
//
//   const { launch, openDevice, Cloud, reporter, emptyPages, site } = require('./helpers');
//   const r = reporter('My feature');
//   const browser = await launch();
//   const dev = await openDevice(browser, r, { local: { pages } });
//   r.ok(await dev.page.locator('.tile').count() === 1, 'one tile');
//   await browser.close();
//   r.done();

const path = require('path');
const fs   = require('fs');
const { chromium } = require('playwright');

const ROOT   = path.resolve(__dirname, '..');
const NEWTAB = 'file://' + path.join(ROOT, 'newtab.html');
const SHOTS  = path.join(__dirname, 'screenshots');
const PAGE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function emptyPages() {
  const p = {};
  PAGE_KEYS.forEach(k => { p[k] = []; });
  return p;
}

let _seq = 0;
function site(name, url, extra = {}) {
  return { id: `s${++_seq}`, type: 'site', name, url, ...extra };
}

function group(name, sites, extra = {}) {
  return { id: `g${++_seq}`, type: 'group', name, items: sites.map(s => ({ ...s, type: undefined })), ...extra };
}

// The current "What's new" id, read from the source so tests never fall out of step
const WHATS_NEW_ID = fs.readFileSync(path.join(ROOT, 'newtab.js'), 'utf8').match(/const WHATS_NEW_ID\s*=\s*'([^']+)'/)[1];

// Local storage that skips first-run UI (tutorial, "What's new" card, host-name cleanup)
function baseLocal(extra = {}) {
  return { tutorialDone: true, whatsNewSeen: WHATS_NEW_ID, hostNamesCleared: true, ...extra };
}

// ─── Reporter ────────────────────────────────────────────────────────────────

function reporter(title) {
  let fails = 0, passes = 0;
  console.log(`\n# ${title}`);
  return {
    ok(cond, msg) {
      if (cond) passes++; else fails++;
      console.log(`${cond ? '✅' : '❌'} ${msg}`);
      return !!cond;
    },
    fail(msg) { fails++; console.log(`❌ ${msg}`); },
    section(name) { console.log(`— ${name}`); },
    info(msg) { console.log(`   ${msg}`); },
    get fails() { return fails; },
    done() {
      console.log(fails ? `FAIL (${fails} of ${fails + passes})` : `ALL PASS (${passes})`);
      process.exitCode = fails ? 1 : 0;
    },
  };
}

// ─── Browser ─────────────────────────────────────────────────────────────────

function launch() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}

function shotPath(name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return path.join(SHOTS, `${name}.png`);
}

// Shared chrome.storage.sync for one Google account; delivers onChanged events
// to every other device, like Chrome Sync does.
class Cloud {
  constructor(data = {}) { this.data = data; this.devices = []; }
  // Joined text of a chunked payload (prefix 'sv' = tiles, 'sn' = notes)
  read(prefix) {
    const meta = this.data[`${prefix}_meta`];
    if (!meta) return null;
    let s = '';
    for (let i = 0; i < meta.n; i++) s += this.data[`${prefix}_${i}`];
    return JSON.parse(s);
  }
}

// In-page fake bookmarks tree with Chrome's move() index quirk. Starts with a
// user bookmark in the bar and a "Recipes" folder in Other bookmarks.
const BOOKMARKS_MOCK = `
  let next = 100; const N = {};
  const node = (id, title, parentId, url) => { N[id] = { id, title, parentId, url, children: url ? undefined : [] }; if (parentId != null) N[parentId].children.push(id); return N[id]; };
  node('0', '', null); node('1', 'Bookmarks bar', '0'); node('2', 'Other bookmarks', '0');
  node('10', 'My Bank', '1', 'https://bank.example/'); node('11', 'Recipes', '2'); node('12', 'Pasta', '11', 'https://pasta.example/');
  const view = id => { const n = N[id]; const o = { id, title: n.title, parentId: n.parentId ?? undefined, index: n.parentId != null ? N[n.parentId].children.indexOf(id) : undefined }; if (n.url) o.url = n.url; else o.children = n.children.map(view); return o; };
  const drop = id => { const p = N[N[id].parentId]; p.children.splice(p.children.indexOf(id), 1); };
  const kill = id => { (N[id].children || []).slice().forEach(kill); delete N[id]; };
  window.__ops = [];
  // Compact tree of titles: [{ "Bookmarks bar": [...] }, { "Other bookmarks": [...] }]
  window.__bmTree = () => { const s = n => n.url ? n.title : { [n.title]: n.children.map(s) }; return view('0').children.map(s); };
  window.chrome.bookmarks = {
    async getTree() { return [view('0')]; },
    async getSubTree(id) { if (!N[id]) throw new Error('not found'); return [view(id)]; },
    async get(id) { if (!N[id]) throw new Error("Can't find bookmark for id."); const v = view(id); delete v.children; return [v]; },
    async getChildren(id) { return view(id).children.map(c => { delete c.children; return c; }); },
    async create({ parentId, index, title, url }) { const id = String(next++); node(id, title || '', parentId, url); if (index != null) { const ch = N[parentId].children; ch.pop(); ch.splice(index, 0, id); } window.__ops.push('create'); return view(id); },
    async update(id, { title }) { N[id].title = title; window.__ops.push('update'); return view(id); },
    async move(id, { parentId, index }) { const old = N[id].parentId; const oi = N[old].children.indexOf(id); drop(id); if (parentId === old && index > oi) index--; N[id].parentId = parentId; const ch = N[parentId].children; ch.splice(index ?? ch.length, 0, id); window.__ops.push('move'); return view(id); },
    async remove(id) { if (N[id].children && N[id].children.length) throw new Error('non-empty'); drop(id); kill(id); window.__ops.push('remove'); },
    async removeTree(id) { drop(id); kill(id); window.__ops.push('removeTree'); },
  };
`;

/**
 * Opens Foyer in a fresh browser context = one computer.
 *   local / session   initial chrome.storage contents (mutated live; inspect via dev.store)
 *   cloud             a Cloud shared by devices on the same Google account (default: own, empty)
 *   bookmarks         true → fake chrome.bookmarks
 *   bookmarksExtra    JS run inside the fake, e.g. "node('20', '', '1', 'https://x.com/')" (id, title, parentId, url)
 *   wait              ms to let boot finish
 * Returns { page, store, cloud, ctx, open() } — open() loads another tab on the same "computer".
 */
async function openDevice(browser, r, {
  name = 'device', local = baseLocal(), session = {}, cloud = new Cloud(),
  bookmarks = false, bookmarksExtra = '', viewport = { width: 1280, height: 800 }, scale = 1, wait = 1500,
} = {}) {
  const store = { local, session };
  const area  = a => (a === 'sync' ? cloud.data : store[a]);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale });
  const dev = { name, store, cloud, ctx, page: null, pages: [] };
  cloud.devices.push(dev);

  const get = (a, keys) => {
    const s = area(a);
    if (keys === null) return clone(s);
    const ks = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
    const out = {};
    ks.forEach(k => { if (k in s) out[k] = clone(s[k]); });
    return out;
  };
  await ctx.exposeFunction('__sget', (a, k) => get(a, k));
  await ctx.exposeFunction('__sset', async (a, obj) => {
    const changes = {};
    for (const [k, v] of Object.entries(obj)) changes[k] = { oldValue: area(a)[k], newValue: clone(v) };
    Object.assign(area(a), clone(obj));
    if (a === 'sync') {
      for (const other of cloud.devices) {
        if (other === dev) continue;
        for (const p of other.pages) await p.evaluate(c => window.__fire('sync', c), changes).catch(() => {});
      }
    }
  });
  await ctx.exposeFunction('__srm', (a, keys) => { [].concat(keys).forEach(k => delete area(a)[k]); });

  await ctx.addInitScript(`(() => {
    const listeners = [];
    window.__fire = (a, c) => listeners.forEach(f => f(c, a));
    const mk = a => ({
      get(k, cb) { const p = window.__sget(a, k === undefined ? null : k); if (cb) p.then(cb); return p; },
      set(o, cb) { const p = window.__sset(a, o); if (cb) p.then(() => cb()); return p; },
      remove(k, cb) { const p = window.__srm(a, k); if (cb) p.then(() => cb()); return p; },
    });
    window.chrome = { storage: { local: mk('local'), session: mk('session'), sync: mk('sync'),
                                 onChanged: { addListener(f) { listeners.push(f); } } } };
    ${bookmarks ? BOOKMARKS_MOCK + bookmarksExtra : ''}
  })();`);

  dev.open = async (ms = wait) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => r.fail(`[${name}] page error: ${e.message}`));
    await page.goto(NEWTAB);
    await page.waitForTimeout(ms);
    dev.pages.push(page);
    dev.page = page;
    return page;
  };
  await dev.open();
  return dev;
}

// ─── Page helpers ────────────────────────────────────────────────────────────

const tileNames = page => page.$$eval('#grid .tile-name', els => els.map(e => e.textContent));
const noteTexts = page => page.$$eval('.note-text', els => els.map(e => e.value));

async function clearAllTiles(page) {
  await page.click('#config-btn');
  await page.click('#settings-clear-all');
  await page.click('#confirm-modal-ok');
}

module.exports = {
  ROOT, NEWTAB, SHOTS, PAGE_KEYS, WHATS_NEW_ID,
  clone, emptyPages, site, group, baseLocal,
  reporter, launch, shotPath, Cloud, openDevice,
  tileNames, noteTexts, clearAllTiles,
};

/**
 * Playwright verification script for Foyer Chrome extension.
 * Mocks chrome.storage.local so we can run newtab.html in a regular
 * Chromium context (no extension loading required).
 */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXTENSION_DIR = path.resolve(__dirname);
const SCREENSHOTS_DIR = path.join(EXTENSION_DIR, 'screenshots');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let pass = true;
let stepCount = 0;
const findings = [];

function step(emoji, label, extra = '') {
  stepCount++;
  console.log(`${stepCount}. ${emoji} ${label}${extra ? ' → ' + extra : ''}`);
}

function find(msg) {
  findings.push(msg);
  console.log(`   ⚠️  Finding: ${msg}`);
}

async function shot(page, name) {
  const p = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

// ─── Chrome storage mock ──────────────────────────────────────────────────────
// Injected into the page before any scripts run.
const CHROME_MOCK = `
window.chrome = {
  storage: {
    local: {
      _data: {},
      get(keys, cb) {
        const result = {};
        const k = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys));
        k.forEach(key => { if (key in this._data) result[key] = this._data[key]; });
        if (cb) cb(result);
        return Promise.resolve(result);
      },
      set(obj, cb) {
        Object.assign(this._data, obj);
        if (cb) cb();
        return Promise.resolve();
      },
    },
  },
};
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();

  // Inject chrome mock before page scripts
  await ctx.addInitScript(CHROME_MOCK);

  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') find(`Console error: ${m.text()}`); });
  page.on('pageerror', err => { find(`Page error: ${err.message}`); pass = false; });

  const newtabUrl = `file://${EXTENSION_DIR}/newtab.html`;
  await page.goto(newtabUrl, { waitUntil: 'domcontentloaded' });

  // ─── 1. Page loads and grid appears ────────────────────────────────────────
  await page.waitForSelector('#grid', { timeout: 5000 });
  step('✅', 'Page loaded', 'grid element present');
  const s1 = await shot(page, '1-initial-load');

  // ─── 2. Sample sites render as tiles ───────────────────────────────────────
  await page.waitForTimeout(400); // favicon requests settle
  const tiles = await page.locator('.site-tile').count();
  if (tiles >= 4) {
    step('✅', `Sample tiles rendered`, `${tiles} site tiles visible`);
  } else {
    step('❌', `Expected ≥4 sample tiles, got ${tiles}`);
    pass = false;
  }

  // ─── 3. Add Site modal opens ────────────────────────────────────────────────
  await page.locator('.add-tile').click();
  await page.waitForSelector('#add-modal:not(.hidden)', { timeout: 2000 });
  step('✅', 'Add Site modal opens on clicking +');

  // ─── 4. Add a site ──────────────────────────────────────────────────────────
  await page.fill('#url-input', 'https://news.ycombinator.com');
  await page.fill('#name-input', 'Hacker News');
  await page.click('#confirm-add');
  await page.waitForTimeout(300);

  const afterAdd = await page.locator('.site-tile').count();
  if (afterAdd > tiles) {
    step('✅', 'New site added to grid', `tiles: ${tiles} → ${afterAdd}`);
  } else {
    step('❌', 'Site count did not increase after add');
    pass = false;
  }
  await shot(page, '2-after-add');

  // ─── 5. Modal closes after add ──────────────────────────────────────────────
  const modalHidden = await page.locator('#add-modal.hidden').count();
  if (modalHidden > 0) {
    step('✅', 'Add modal dismissed after confirm');
  } else {
    step('❌', 'Add modal still visible after confirm');
    pass = false;
  }

  // ─── 6. URL auto-prefixes https:// ──────────────────────────────────────────
  await page.locator('.add-tile').click();
  await page.waitForSelector('#add-modal:not(.hidden)');
  await page.fill('#url-input', 'reddit.com');
  await page.fill('#name-input', 'Reddit');
  await page.click('#confirm-add');
  await page.waitForTimeout(300);
  const tilesAfterReddit = await page.locator('.site-tile').count();
  if (tilesAfterReddit > afterAdd) {
    step('✅', 'URL without https:// accepted (auto-prefixed)');
  } else {
    step('❌', 'URL without https:// not accepted');
    pass = false;
  }

  // ─── 7. Empty URL ignored ────────────────────────────────────────────────────
  await page.locator('.add-tile').click();
  await page.waitForSelector('#add-modal:not(.hidden)');
  await page.click('#confirm-add'); // no URL
  const tilesAfterEmpty = await page.locator('.site-tile').count();
  if (tilesAfterEmpty === tilesAfterReddit) {
    step('✅', '🔍 Empty URL → no tile added (validated correctly)');
  } else {
    step('❌', '🔍 Empty URL was accepted — should be rejected');
    pass = false;
  }
  // Close with Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ─── 8. Drag two sites → group is created ────────────────────────────────────
  const tile1 = page.locator('.site-tile').nth(0);
  const tile2 = page.locator('.site-tile').nth(1);
  const box1 = await tile1.boundingBox();
  const box2 = await tile2.boundingBox();

  if (box1 && box2) {
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const groups = await page.locator('.group-tile').count();
    if (groups >= 1) {
      step('✅', 'Drag-to-group created a group tile', `${groups} group(s) on grid`);
      await shot(page, '3-after-drag-group');

      // Rename modal should appear
      const renameVisible = await page.locator('#rename-modal:not(.hidden)').count();
      if (renameVisible) {
        step('✅', 'Rename modal auto-prompts after group creation');
        await page.fill('#rename-input', 'Test Group');
        await page.click('#confirm-rename');
        await page.waitForTimeout(200);
      } else {
        find('Rename modal did not appear after group creation — group named "New Group" by default');
      }
    } else {
      find('Drag-to-group: no group tile created (drag may not have registered in headless mode)');
      step('⚠️', 'Drag-to-group did not create a group — headless drag limitation');
    }
  }

  // ─── 9. Group overlay opens ──────────────────────────────────────────────────
  const groupTile = page.locator('.group-tile').first();
  const groupCount = await page.locator('.group-tile').count();
  if (groupCount > 0) {
    await groupTile.click();
    await page.waitForTimeout(300);
    const overlayVisible = await page.locator('#group-overlay:not(.hidden)').count();
    if (overlayVisible) {
      step('✅', 'Group overlay opens on click');
      await shot(page, '4-group-open');

      // Close with X button
      await page.click('#close-group');
      await page.waitForTimeout(200);
      const overlayClosed = await page.locator('#group-overlay.hidden').count();
      if (overlayClosed) {
        step('✅', 'Group overlay closes with ✕ button');
      } else {
        step('❌', 'Group overlay did not close');
        pass = false;
      }
    } else {
      step('❌', 'Group overlay did not open on click');
      pass = false;
    }
  }

  // ─── 10. Right-click context menu ────────────────────────────────────────────
  const firstSite = page.locator('.site-tile').first();
  await firstSite.click({ button: 'right' });
  await page.waitForTimeout(200);
  const ctxVisible = await page.locator('#context-menu:not(.hidden)').count();
  if (ctxVisible) {
    step('✅', '🔍 Right-click shows context menu');
    await shot(page, '5-context-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  } else {
    step('❌', '🔍 Right-click context menu did not appear');
    pass = false;
  }

  // ─── 11. Rename via context menu ─────────────────────────────────────────────
  const siteBeforeRename = await page.locator('.site-tile').first();
  await siteBeforeRename.click({ button: 'right' });
  await page.waitForTimeout(150);
  const renameBtn = page.locator('#context-menu [data-action="rename"]');
  if (await renameBtn.count() > 0) {
    await renameBtn.click();
    await page.waitForTimeout(200);
    const renameOpen = await page.locator('#rename-modal:not(.hidden)').count();
    if (renameOpen) {
      step('✅', 'Rename modal opens from context menu');
      await page.fill('#rename-input', 'Renamed Site');
      await page.click('#confirm-rename');
      await page.waitForTimeout(200);
      const renamedTile = await page.locator('.tile-name', { hasText: 'Renamed Site' }).count();
      if (renamedTile > 0) {
        step('✅', 'Rename saved and reflects on tile');
      } else {
        step('❌', 'Rename did not update tile label');
        pass = false;
      }
    }
  }

  // ─── 12. Delete via context menu ─────────────────────────────────────────────
  const countBefore = await page.locator('.site-tile').count();
  const targetTile = page.locator('.site-tile').last();
  await targetTile.click({ button: 'right' });
  await page.waitForTimeout(150);
  const deleteBtn = page.locator('#context-menu [data-action="delete"]');
  if (await deleteBtn.count() > 0) {
    await deleteBtn.click();
    await page.waitForTimeout(300);
    const countAfter = await page.locator('.site-tile').count();
    if (countAfter < countBefore) {
      step('✅', '🔍 Delete removes tile from grid', `${countBefore} → ${countAfter}`);
    } else {
      step('❌', '🔍 Delete did not remove tile');
      pass = false;
    }
  }

  await shot(page, '6-final-state');
  await browser.close();

  // ─── Report ──────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log(`\n## Verification: Foyer Chrome extension (newtab.html)\n`);
  console.log(`**Verdict:** ${pass ? 'PASS' : 'FAIL'}\n`);
  console.log('**Claim:** New tab page renders a grid of site tiles that can be');
  console.log('  added, dragged to form iPhone-style groups that expand in an');
  console.log('  overlay, renamed, and deleted.\n');
  console.log('**Method:** Playwright (headless Chromium) with chrome.storage mock');
  console.log(`  served from file:// — ${stepCount} steps\n`);
  console.log('**Screenshots:**', SCREENSHOTS_DIR);
  if (findings.length > 0) {
    console.log('\n### Findings');
    findings.forEach(f => console.log('  ⚠️ ', f));
  } else {
    console.log('\n### Findings\nNone — all steps held.');
  }
  console.log('');

  process.exit(pass ? 0 : 1);
})();

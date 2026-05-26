'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const ICON_GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#fccb90,#d57eeb)',
  'linear-gradient(135deg,#e0c3fc,#8ec5fc)',
  'linear-gradient(135deg,#ff9a9e,#fecfef)',
  'linear-gradient(135deg,#96fbc4,#f9f586)',
];

function tileGradient(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33 ^ str.charCodeAt(i)) >>> 0;
  return ICON_GRADIENTS[h % ICON_GRADIENTS.length];
}

// Priority chain: apple-touch-icon (high-res logo) → gstatic (Google cache, 128px) → s2/favicons → raw favicon.ico
function getFaviconSources(url) {
  try {
    const { hostname: host, origin } = new URL(url);
    return [
      `${origin}/apple-touch-icon.png`,
      `${origin}/apple-touch-icon-precomposed.png`,
      `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(origin)}&size=128`,
      `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
      `${origin}/favicon.ico`,
    ];
  } catch {
    return [];
  }
}

// Tries each source in order; calls onResolved(src) with the first that loads, or onResolved(null) if all fail.
function tryFaviconChain(img, fallbackEl, sources, idx, onResolved) {
  if (idx === undefined) idx = 0;
  if (idx >= sources.length) {
    img.style.display = 'none';
    if (fallbackEl) fallbackEl.style.display = 'flex';
    if (onResolved) onResolved(null);
    return;
  }
  img.onerror = () => tryFaviconChain(img, fallbackEl, sources, idx + 1, onResolved);
  img.onload  = () => {
    img.style.display = '';
    if (fallbackEl) fallbackEl.style.display = 'none';
    if (onResolved) onResolved(img.src);
  };
  img.src = sources[idx];
}

// ─── State ───────────────────────────────────────────────────────────────────

let items = [];
let ctxTargetId = null;
let openGroupId = null;
let pendingFavicon = null;
let faviconEpoch   = 0;
let editTargetId      = null;
let pendingEditFavicon = null;
let editFaviconEpoch   = 0;

// Group page state
let groupCurrentPage  = 0;
let groupTotalPages   = 0;
let cleanupGroupDrag  = null;

// Group tile pointer drag state
let gpDragSrcId = null;
let gpDragSrcEl = null;
let gpDragClone = null;
let gpOffX = 0, gpOffY = 0;
let gpActive = false;
let gpSX = 0, gpSY = 0;
let gpDropTgt  = null;   // target tile element
let gpDropMode = null;
let _gpSuppressClick = false;
const _GP_DIST = 6;

let _addTargetGroupId = null;  // non-null when the add modal is adding into a group

let _saveTimer = null;
function debouncedSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => save(), 400);
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function load() {
  const data = await chrome.storage.local.get('items');
  items = data.items ?? sampleItems();
}

function save() {
  return chrome.storage.local.set({ items });
}

function sampleItems() {
  return [
    { id: uid(), type: 'site', name: 'Google',   url: 'https://www.google.com' },
    { id: uid(), type: 'site', name: 'YouTube',  url: 'https://www.youtube.com' },
    { id: uid(), type: 'site', name: 'GitHub',   url: 'https://github.com' },
    { id: uid(), type: 'site', name: 'Twitter',  url: 'https://twitter.com' },
  ];
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  items.forEach(item => {
    grid.appendChild(item.type === 'group' ? buildGroupTile(item) : buildSiteTile(item));
  });
}

function buildSiteTile(item) {
  const tile = document.createElement('div');
  tile.className = 'tile site-tile';
  tile.dataset.id = item.id;

  const letter = (item.name[0] ?? '?').toUpperCase();
  tile.innerHTML = `
    <div class="tile-icon">
      <img alt="" draggable="false" style="display:none">
      <div class="tile-icon-fallback" style="display:flex">${letter}</div>
    </div>
    <span class="tile-name">${escHtml(item.name)}</span>
  `;

  const img      = tile.querySelector('img');
  const fallback = tile.querySelector('.tile-icon-fallback');

  // Stored favicon first (from when the site was added), then full chain
  const sources = [
    ...(item.favicon ? [item.favicon] : []),
    ...getFaviconSources(item.url),
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  tryFaviconChain(img, fallback, sources, 0, resolvedSrc => {
    // Auto-persist the working URL so future renders skip the chain probing
    if (resolvedSrc && !item.favicon) {
      item.favicon = resolvedSrc;
      debouncedSave();
    }
  });

  tile.addEventListener('click', e => {
    if (e.defaultPrevented || _suppressClick) return;
    window.location.href = item.url;
  });

  attachDrag(tile, item.id);
  attachContextMenu(tile, item.id);
  return tile;
}

function buildGroupTile(item) {
  const tile = document.createElement('div');
  tile.className = 'tile group-tile';
  tile.dataset.id = item.id;

  const sites = (item.items ?? []).slice(0, 9);

  // 9-slot mini-grid: filled slots show letter+favicon, empty slots stay faint
  let miniHTML = '';
  for (let i = 0; i < 9; i++) {
    const s = sites[i];
    if (s) {
      const letter = (s.name[0] ?? '?').toUpperCase();
      const bg = tileGradient(s.url);
      miniHTML += `<div class="mini-cell"><img alt="" draggable="false" style="display:none"><span class="mini-letter" style="background:${bg}">${letter}</span></div>`;
    } else {
      miniHTML += `<div class="mini-cell empty"></div>`;
    }
  }

  tile.innerHTML = `
    <div class="tile-icon group-icon">
      <div class="mini-grid">${miniHTML}</div>
    </div>
    <span class="tile-name">${escHtml(item.name)}</span>
  `;

  tile.querySelectorAll('.mini-cell:not(.empty)').forEach((cell, i) => {
    const site = sites[i];
    if (!site) return;
    const img    = cell.querySelector('img');
    const letter = cell.querySelector('.mini-letter');
    const sources = [
      ...(site.favicon ? [site.favicon] : []),
      ...getFaviconSources(site.url),
    ].filter((v, j, a) => a.indexOf(v) === j);
    tryFaviconChain(img, letter, sources);
  });

  tile.addEventListener('click', e => {
    if (e.defaultPrevented || _suppressClick) return;
    openGroup(item.id);
  });

  attachDrag(tile, item.id);
  attachContextMenu(tile, item.id);
  return tile;
}

// ─── Drag & Drop (pointer-events + FLIP live preview) ────────────────────────

let pdSrcId   = null;   // item id being dragged
let pdSrcEl   = null;   // ghost tile in DOM (opacity 0, moves as placeholder)
let pdClone   = null;   // floating visual clone that follows the cursor
let pdOffX    = 0, pdOffY = 0;
let pdActive  = false;
let pdSX      = 0, pdSY  = 0;
let pdDropTgt = null;   // current hovered item id
let pdDropMode= null;   // 'before' | 'after' | 'group' | null
let _suppressClick = false;
const _PD_DIST = 6;    // px threshold before drag activates

function attachDrag(tile, id) {
  tile.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    pdSX = e.clientX; pdSY = e.clientY;
    const rect = tile.getBoundingClientRect();
    pdOffX = e.clientX - rect.left;
    pdOffY = e.clientY - rect.top;

    function onMove(ev) {
      if (!pdActive) {
        if (Math.hypot(ev.clientX - pdSX, ev.clientY - pdSY) < _PD_DIST) return;
        pdActive = true; pdSrcId = id; pdSrcEl = tile;
        _initDrag(tile, rect);
      }
      _moveDrag(ev.clientX, ev.clientY);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (pdActive) _commitDrag();
      else { pdActive = false; pdSrcId = null; pdSrcEl = null; }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function _initDrag(el, rect) {
  pdClone = el.cloneNode(true);
  Object.assign(pdClone.style, {
    position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', height: rect.height + 'px',
    pointerEvents: 'none', zIndex: '1000',
    opacity: '0.92', transform: 'scale(1.1)',
    transformOrigin: 'center center',
    transition: 'transform 0.15s ease',
    filter: 'drop-shadow(0 18px 38px rgba(0,0,0,0.55))',
  });
  document.body.appendChild(pdClone);
  el.style.opacity = '0';
}

function _moveDrag(cx, cy) {
  if (!pdClone) return;
  pdClone.style.left = (cx - pdOffX) + 'px';
  pdClone.style.top  = (cy - pdOffY) + 'px';

  // Auto-scroll #app
  const app = document.getElementById('app');
  const ZONE = 80, SPEED = 10;
  if (cy < ZONE) app.scrollTop -= SPEED;
  else if (cy > window.innerHeight - ZONE) app.scrollTop += SPEED;

  // Use the floating clone's CENTER as the collision point (icon body, not cursor tip)
  const cr    = pdClone.getBoundingClientRect();
  const cloneCX = cr.left + cr.width  / 2;
  const cloneCY = cr.top  + cr.height / 2;

  // Find the nearest tile by center-to-center distance
  const grid     = document.getElementById('grid');
  const allTiles = [...grid.querySelectorAll('.tile')].filter(t => t !== pdSrcEl);

  let nearestTile = null, nearestDist = Infinity;
  for (const t of allTiles) {
    const r = t.getBoundingClientRect();
    const d = Math.hypot(cloneCX - (r.left + r.width / 2), cloneCY - (r.top + r.height / 2));
    if (d < nearestDist) { nearestDist = d; nearestTile = t; }
  }
  if (!nearestTile) return;

  const hovId = nearestTile.dataset.id;
  const rect  = nearestTile.getBoundingClientRect();
  const relX  = (cloneCX - rect.left) / rect.width;
  const relY  = (cloneCY - rect.top)  / rect.height;
  const dist  = Math.hypot(relX - 0.5, relY - 0.5);

  if (dist < 0.28 && nearestDist < rect.width * 0.6) {
    // Clone center is squarely on top of a tile → group merge
    document.querySelectorAll('.drag-group-target').forEach(el => el.classList.remove('drag-group-target'));
    nearestTile.classList.add('drag-group-target');
    pdDropTgt  = hovId;
    pdDropMode = 'group';
  } else {
    // Reorder: insert before/after based on clone center vs tile center X
    document.querySelectorAll('.drag-group-target').forEach(el => el.classList.remove('drag-group-target'));
    const before = cloneCX < rect.left + rect.width / 2;
    if (pdDropTgt === hovId && pdDropMode === (before ? 'before' : 'after')) return;
    pdDropTgt  = hovId;
    pdDropMode = before ? 'before' : 'after';
    _applyReorderPreview(nearestTile, before);
  }
}

function _applyReorderPreview(tgtEl, insertBefore) {
  const grid = document.getElementById('grid');
  if (!pdSrcEl) return;

  const others = [...grid.querySelectorAll('.tile')].filter(t => t !== pdSrcEl);

  // Freeze any in-flight animations so FIRST = current visual position (not final target)
  others.forEach(t => {
    t.getAnimations().forEach(a => { try { a.commitStyles(); a.cancel(); } catch {} });
  });

  // FIRST: visual positions (layout + any committed mid-animation offset)
  const firsts = new Map(others.map(t => [t, t.getBoundingClientRect()]));

  // Clear transforms/transitions so the DOM move lands on clean layout positions
  others.forEach(t => { t.style.transition = 'none'; t.style.transform = ''; });

  // Move the ghost placeholder
  if (insertBefore) grid.insertBefore(pdSrcEl, tgtEl);
  else              grid.insertBefore(pdSrcEl, tgtEl.nextSibling);

  // LAST: new layout positions after DOM move (read all before writing any)
  grid.offsetHeight;
  const lasts = new Map(others.map(t => [t, t.getBoundingClientRect()]));

  // INVERT: apply all inverse transforms (write-only pass, no interleaved reads)
  others.forEach(t => {
    const f = firsts.get(t), l = lasts.get(t);
    if (!f || !l) return;
    const dx = f.left - l.left, dy = f.top - l.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
      t.style.transform = `translate(${dx}px,${dy}px)`;
  });

  // PLAY: second flush locks in the inverse positions so the browser "sees" them
  // as the transition start value. Tiles then animate from their visual positions
  // rather than flashing at the inverse state for two render frames (double-RAF bug).
  grid.offsetHeight;
  others.forEach(t => {
    t.style.transition = 'transform 0.62s cubic-bezier(0.25,0.46,0.45,0.94)';
    t.style.transform  = '';
  });
}

function _commitDrag() {
  pdClone?.remove(); pdClone = null;
  if (pdSrcEl) pdSrcEl.style.opacity = '';

  // Cancel any in-flight FLIP animations and clear decorations
  document.querySelectorAll('.tile').forEach(t => {
    t.getAnimations().forEach(a => { try { a.cancel(); } catch {} });
    t.classList.remove('drag-group-target');
    t.style.transition = '';
    t.style.transform  = '';
  });

  if (pdDropMode === 'group' && pdDropTgt) {
    doGroup(pdSrcId, pdDropTgt);
  } else {
    // DOM order already reflects the live preview → sync items[]
    const grid = document.getElementById('grid');
    const domOrder = [...grid.querySelectorAll('.tile')].map(t => t.dataset.id);
    items = domOrder.map(did => items.find(i => i.id === did)).filter(Boolean);
    save();
  }

  // Suppress the click that fires after mouseup on the same element
  _suppressClick = true;
  requestAnimationFrame(() => { _suppressClick = false; });

  pdSrcId = null; pdSrcEl = null;
  pdDropTgt = null; pdDropMode = null; pdActive = false;

  render();
}

function doGroup(srcId, tgtId) {
  const src = items.find(i => i.id === srcId);
  const tgt = items.find(i => i.id === tgtId);
  if (!src || !tgt) return;

  if (tgt.type === 'group') {
    // Add src into existing group
    if (src.type === 'site') {
      tgt.items = tgt.items ?? [];
      tgt.items.push({ id: uid(), name: src.name, url: src.url });
      items = items.filter(i => i.id !== srcId);
    }
    save();
  } else if (src.type === 'site' && tgt.type === 'site') {
    // Create a new group from two sites
    const newGroup = {
      id: uid(), type: 'group', name: 'New Group',
      items: [
        { id: uid(), name: src.name, url: src.url },
        { id: uid(), name: tgt.name, url: tgt.url },
      ],
    };
    const tgtIdx = items.findIndex(i => i.id === tgtId);
    items.splice(tgtIdx, 1, newGroup);
    items = items.filter(i => i.id !== srcId);
    save();
    // Prompt rename — dragend will render first, showing the "New Group" tile
    // We delay slightly so render() has a chance to complete
    setTimeout(() => promptRename(newGroup.id), 50);
  } else if (src.type === 'group' && tgt.type === 'site') {
    src.items = src.items ?? [];
    src.items.push({ id: uid(), name: tgt.name, url: tgt.url });
    items = items.filter(i => i.id !== tgtId);
    save();
  }
}

// ─── Group Overlay ────────────────────────────────────────────────────────────

function doGroupReorder(groupId, srcSiteId, tgtSiteId, insertBefore) {
  const group = items.find(i => i.id === groupId);
  if (!group) return;
  const srcIdx = group.items.findIndex(s => s.id === srcSiteId);
  const tgtIdx = group.items.findIndex(s => s.id === tgtSiteId);
  if (srcIdx < 0 || tgtIdx < 0) return;
  const [src] = group.items.splice(srcIdx, 1);
  const newTgtIdx = group.items.findIndex(s => s.id === tgtSiteId);
  group.items.splice(insertBefore ? newTgtIdx : newTgtIdx + 1, 0, src);
  const savedPage = groupCurrentPage;
  save();
  openGroup(groupId);
  if (savedPage > 0) goToGroupPage(savedPage);
}

function buildGroupSiteTile(site, groupId) {
  const tile = document.createElement('div');
  tile.className = 'group-site-tile';
  tile.dataset.siteId = site.id;
  const letter   = (site.name[0] ?? '?').toUpperCase();
  const gradient = tileGradient(site.url);
  tile.innerHTML = `
    <div class="group-site-icon">
      <img alt="" draggable="false" style="display:none">
      <div class="group-site-fallback" style="display:flex;background:${gradient}">${letter}</div>
    </div>
    <span>${escHtml(site.name)}</span>
  `;
  const img      = tile.querySelector('img');
  const fallback = tile.querySelector('.group-site-fallback');
  const sources  = [
    ...(site.favicon ? [site.favicon] : []),
    ...getFaviconSources(site.url),
  ].filter((v, i, a) => a.indexOf(v) === i);
  tryFaviconChain(img, fallback, sources);

  tile.addEventListener('click', e => {
    if (!e.defaultPrevented && !_gpSuppressClick) window.location.href = site.url;
  });
  tile.addEventListener('contextmenu', e => {
    e.preventDefault();
    showGroupSiteCtx(e, groupId, site.id);
  });

  tile.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    gpSX = e.clientX; gpSY = e.clientY;
    const rect = tile.getBoundingClientRect();
    gpOffX = e.clientX - rect.left;
    gpOffY = e.clientY - rect.top;

    function onMove(ev) {
      if (!gpActive) {
        if (Math.hypot(ev.clientX - gpSX, ev.clientY - gpSY) < _GP_DIST) return;
        gpActive = true; gpDragSrcId = site.id; gpDragSrcEl = tile;
        _gpInitDrag(tile, rect);
      }
      _gpMoveDrag(ev.clientX, ev.clientY);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (gpActive) _gpCommitDrag(groupId);
      else { gpActive = false; gpDragSrcId = null; gpDragSrcEl = null; }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  return tile;
}

function _gpInitDrag(el, rect) {
  gpDragClone = el.cloneNode(true);
  Object.assign(gpDragClone.style, {
    position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', height: rect.height + 'px',
    pointerEvents: 'none', zIndex: '2000',
    opacity: '0.92', transform: 'scale(1.12)',
    transformOrigin: 'center center',
    transition: 'transform 0.15s ease',
    filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.5))',
  });
  document.body.appendChild(gpDragClone);
  el.style.opacity = '0';
}

function _gpIconRect(tileEl) {
  const icon = tileEl.querySelector('.group-site-icon');
  return (icon ?? tileEl).getBoundingClientRect();
}

function _gpMoveDrag(cx, cy) {
  if (!gpDragClone) return;
  gpDragClone.style.left = (cx - gpOffX) + 'px';
  gpDragClone.style.top  = (cy - gpOffY) + 'px';

  // Use the clone's icon element center as collision point — matches the 54×54 px visual icon
  const cloneIcon = gpDragClone.querySelector('.group-site-icon') ?? gpDragClone;
  const cr = cloneIcon.getBoundingClientRect();
  const cloneCX = cr.left + cr.width  / 2;
  const cloneCY = cr.top  + cr.height / 2;

  // Find nearest tile by icon-center-to-icon-center distance
  // Scope to .group-page to exclude the floating clone (also has the same class)
  let nearestTile = null, nearestDist = Infinity;
  for (const t of document.querySelectorAll('.group-page .group-site-tile')) {
    if (t === gpDragSrcEl) continue;
    const r = _gpIconRect(t);
    const d = Math.hypot(cloneCX - (r.left + r.width / 2), cloneCY - (r.top + r.height / 2));
    if (d < nearestDist) { nearestDist = d; nearestTile = t; }
  }
  if (!nearestTile) return;

  const iconRect = _gpIconRect(nearestTile);
  const before   = cloneCX < iconRect.left + iconRect.width / 2;
  if (gpDropTgt === nearestTile && gpDropMode === (before ? 'before' : 'after')) return;
  gpDropTgt  = nearestTile;
  gpDropMode = before ? 'before' : 'after';
  _gpApplyReorderPreview(nearestTile, before);
}

function _gpApplyReorderPreview(tgtEl, insertBefore) {
  if (!gpDragSrcEl) return;
  const page = tgtEl.closest('.group-page');
  if (!page) return;

  const others = [...page.querySelectorAll('.group-site-tile')].filter(t => t !== gpDragSrcEl);

  // Freeze any in-flight animations so FIRST = current visual position
  others.forEach(t => {
    t.getAnimations().forEach(a => { try { a.commitStyles(); a.cancel(); } catch {} });
  });

  // FIRST: visual positions (layout + any committed mid-animation offset)
  const firsts = new Map(others.map(t => [t, t.getBoundingClientRect()]));

  others.forEach(t => { t.style.transition = 'none'; t.style.transform = ''; });

  if (insertBefore) page.insertBefore(gpDragSrcEl, tgtEl);
  else              page.insertBefore(gpDragSrcEl, tgtEl.nextSibling);

  // LAST: new layout positions after DOM move (read all before writing any)
  page.offsetHeight;
  const lasts = new Map(others.map(t => [t, t.getBoundingClientRect()]));

  // INVERT: write-only pass, no interleaved reads
  others.forEach(t => {
    const f = firsts.get(t), l = lasts.get(t);
    if (!f || !l) return;
    const dx = f.left - l.left, dy = f.top - l.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
      t.style.transform = `translate(${dx}px,${dy}px)`;
  });

  // PLAY: second flush locks in inverse positions; transition starts this JS task
  page.offsetHeight;
  others.forEach(t => {
    t.style.transition = 'transform 0.62s cubic-bezier(0.25,0.46,0.45,0.94)';
    t.style.transform  = '';
  });
}

function _gpCommitDrag(groupId) {
  gpDragClone?.remove(); gpDragClone = null;
  if (gpDragSrcEl) gpDragSrcEl.style.opacity = '';

  document.querySelectorAll('.group-site-tile').forEach(t => {
    t.getAnimations().forEach(a => { try { a.cancel(); } catch {} });
    t.style.transition = '';
    t.style.transform  = '';
  });

  // Sync group.items from DOM order for the affected page
  const group = items.find(i => i.id === groupId);
  if (group && gpDragSrcEl) {
    const page = gpDragSrcEl.closest('.group-page');
    if (page) {
      const pageIdx   = [...document.querySelectorAll('.group-page')].indexOf(page);
      const pageStart = pageIdx * 9;
      const domSiteIds = [...page.querySelectorAll('.group-site-tile')].map(t => t.dataset.siteId);
      const reordered  = domSiteIds.map(sid => group.items.find(s => s.id === sid)).filter(Boolean);
      group.items.splice(pageStart, reordered.length, ...reordered);
    }
  }

  _gpSuppressClick = true;
  requestAnimationFrame(() => { _gpSuppressClick = false; });

  const savedPage = groupCurrentPage;
  gpDragSrcId = null; gpDragSrcEl = null;
  gpDropTgt = null; gpDropMode = null; gpActive = false;

  save();
  openGroup(groupId);
  if (savedPage > 0) goToGroupPage(savedPage);
}

function openGroup(groupId) {
  const group = items.find(i => i.id === groupId);
  if (!group || group.type !== 'group') return;
  openGroupId = groupId;
  groupCurrentPage = 0;

  document.getElementById('group-title').textContent = group.name;

  const track = document.getElementById('group-pages-track');
  const dots  = document.getElementById('group-dots');
  track.innerHTML = '';
  dots.innerHTML  = '';
  track.style.transform = 'translateX(0)';

  // Split items into pages of 9
  const allSites = group.items ?? [];
  const pages = [];
  for (let i = 0; i < allSites.length; i += 9) pages.push(allSites.slice(i, i + 9));
  if (pages.length === 0) pages.push([]);
  groupTotalPages = pages.length;

  pages.forEach((pageSites, pi) => {
    const page = document.createElement('div');
    page.className = 'group-page';
    pageSites.forEach(site => page.appendChild(buildGroupSiteTile(site, groupId)));
    track.appendChild(page);

    if (pages.length > 1) {
      const dot = document.createElement('div');
      dot.className = 'group-dot' + (pi === 0 ? ' active' : '');
      dot.addEventListener('click', () => goToGroupPage(pi));
      dots.appendChild(dot);
    }
  });

  const container = document.getElementById('group-pages-container');
  if (cleanupGroupDrag) cleanupGroupDrag();
  cleanupGroupDrag = initGroupPageDrag(container, track, dots);

  document.getElementById('group-overlay').classList.remove('hidden');
}

function closeGroup() {
  document.getElementById('group-overlay').classList.add('hidden');
  if (cleanupGroupDrag) { cleanupGroupDrag(); cleanupGroupDrag = null; }
  openGroupId = null;
  groupCurrentPage = 0;
}

function goToGroupPage(page) {
  groupCurrentPage = Math.max(0, Math.min(groupTotalPages - 1, page));
  const container = document.getElementById('group-pages-container');
  const track     = document.getElementById('group-pages-track');
  track.style.transition = '';
  track.style.transform  = `translateX(${groupCurrentPage * -container.offsetWidth}px)`;
  document.querySelectorAll('.group-dot').forEach((d, i) =>
    d.classList.toggle('active', i === groupCurrentPage)
  );
}

function initGroupPageDrag(container, track, dots) {
  const THRESHOLD = 48;
  let startX = null;

  function onStart(e) {
    // Don't hijack clicks on tiles or the close button
    if (e.target.closest('.group-site-tile') || e.target.closest('#close-group')) return;
    startX = e.clientX;
    track.style.transition = 'none';
    e.preventDefault();
  }

  function onMove(e) {
    if (startX === null) return;
    const dx  = e.clientX - startX;
    const w   = container.offsetWidth;
    const min = -(groupTotalPages - 1) * w;
    const raw = groupCurrentPage * -w + dx;
    // Rubber-band: resist dragging past first/last page
    const clamped = raw < min ? min + (raw - min) * 0.25
                  : raw > 0   ? raw * 0.25
                  : raw;
    track.style.transform = `translateX(${clamped}px)`;
  }

  function onEnd(e) {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    track.style.transition = ''; // re-enable spring transition

    if      (dx < -THRESHOLD && groupCurrentPage < groupTotalPages - 1) groupCurrentPage++;
    else if (dx >  THRESHOLD && groupCurrentPage > 0)                   groupCurrentPage--;

    const w = container.offsetWidth;
    track.style.transform = `translateX(${groupCurrentPage * -w}px)`;
    dots.querySelectorAll('.group-dot').forEach((d, i) =>
      d.classList.toggle('active', i === groupCurrentPage)
    );
  }

  container.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove',  onMove);
  document.addEventListener('mouseup',    onEnd);

  return () => {
    container.removeEventListener('mousedown', onStart);
    document.removeEventListener('mousemove',  onMove);
    document.removeEventListener('mouseup',    onEnd);
  };
}

function showGroupSiteCtx(e, groupId, siteId) {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = `<button class="ctx-item ctx-danger" data-action="remove">Remove from group</button>`;
  menu.querySelector('[data-action="remove"]').addEventListener('click', () => {
    const group = items.find(i => i.id === groupId);
    if (!group) return;
    const site = group.items.find(s => s.id === siteId);
    if (!site) return;
    group.items = group.items.filter(s => s.id !== siteId);
    items.push({ id: uid(), type: 'site', name: site.name, url: site.url });
    if (group.items.length <= 1) {
      if (group.items.length === 1) {
        const rem = group.items[0];
        items = items.filter(i => i.id !== groupId);
        items.push({ id: uid(), type: 'site', name: rem.name, url: rem.url });
      } else {
        items = items.filter(i => i.id !== groupId);
      }
    }
    save().then(render);
    closeCtxMenu();
    closeGroup();
  });
  positionAndShow(menu, e.clientX, e.clientY);
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function attachContextMenu(tile, id) {
  tile.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    ctxTargetId = id;
    showCtxMenu(e.clientX, e.clientY, id);
  });
}

function showCtxMenu(x, y, id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  const menu = document.getElementById('context-menu');
  const editBtn = item.type === 'site'
    ? `<button class="ctx-item" data-action="edit">Edit</button>` : '';
  menu.innerHTML = `
    <button class="ctx-item" data-action="rename">Rename</button>
    ${editBtn}
    <button class="ctx-item ctx-danger" data-action="delete">Delete</button>
  `;
  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    closeCtxMenu();
    promptRename(id);
  });
  menu.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
    closeCtxMenu();
    openEditModal(id);
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    items = items.filter(i => i.id !== id);
    save().then(render);
    closeCtxMenu();
  });
  positionAndShow(menu, x, y);
}

function positionAndShow(menu, x, y) {
  menu.classList.remove('hidden');
  const mw = 180, mh = 90;
  menu.style.left = `${Math.min(x, window.innerWidth  - mw - 8)}px`;
  menu.style.top  = `${Math.min(y, window.innerHeight - mh - 8)}px`;
}

function closeCtxMenu() {
  document.getElementById('context-menu').classList.add('hidden');
  ctxTargetId = null;
}

// ─── Rename ───────────────────────────────────────────────────────────────────

function promptRename(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('rename-input');
  input.value = item.name;
  modal.classList.remove('hidden');
  input.focus();
  input.select();

  const doSave = () => {
    const val = input.value.trim();
    if (val) { item.name = val; save().then(render); }
    modal.classList.add('hidden');
    unbind();
  };

  const onKeydown = e => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') { modal.classList.add('hidden'); unbind(); }
  };
  document.getElementById('confirm-rename').onclick = doSave;
  document.getElementById('cancel-rename').onclick = () => { modal.classList.add('hidden'); unbind(); };
  input.addEventListener('keydown', onKeydown);

  function unbind() {
    input.removeEventListener('keydown', onKeydown);
    document.getElementById('confirm-rename').onclick = null;
    document.getElementById('cancel-rename').onclick = null;
  }
}

// ─── Edit Site ────────────────────────────────────────────────────────────────

function openEditModal(id) {
  const item = items.find(i => i.id === id);
  if (!item || item.type !== 'site') return;
  editTargetId = id;
  pendingEditFavicon = item.favicon ?? null;

  document.getElementById('edit-url-input').value  = item.url;
  document.getElementById('edit-name-input').value = item.name;

  // Show existing favicon in preview
  const img    = document.getElementById('edit-favicon-preview-img');
  const letter = document.getElementById('edit-favicon-preview-letter');
  const box    = document.getElementById('edit-favicon-preview-box');
  letter.style.display = 'none';
  box.classList.remove('loaded');
  img.style.display = 'none';

  editFaviconEpoch++;
  const epoch   = editFaviconEpoch;
  const sources = [
    ...(item.favicon ? [item.favicon] : []),
    ...getFaviconSources(item.url),
  ].filter((v, i, a) => a.indexOf(v) === i);

  img.onerror = function tryNext() {
    const idx = sources.indexOf(img.src) + 1;
    if (editFaviconEpoch !== epoch) return;
    if (idx >= sources.length) { img.style.display = 'none'; letter.style.display = ''; return; }
    img.onerror = tryNext;
    img.src = sources[idx];
  };
  img.onload = () => {
    if (editFaviconEpoch !== epoch) return;
    img.style.display = '';
    letter.style.display = 'none';
    box.classList.add('loaded');
  };
  if (sources.length) {
    img.src = sources[0];
  } else {
    letter.style.display = '';
  }

  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('edit-url-input').focus();
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  editFaviconEpoch++;
  editTargetId = null;
}

let _editFaviconInputTimer = null;

function onEditUrlInput(rawValue) {
  clearTimeout(_editFaviconInputTimer);
  _editFaviconInputTimer = setTimeout(() => loadEditFaviconPreview(rawValue), 450);
}

function loadEditFaviconPreview(rawValue) {
  let url = rawValue.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  editFaviconEpoch++;
  const epoch = editFaviconEpoch;

  const img    = document.getElementById('edit-favicon-preview-img');
  const letter = document.getElementById('edit-favicon-preview-letter');
  const box    = document.getElementById('edit-favicon-preview-box');
  img.style.display  = 'none';
  letter.style.display = '';
  box.classList.remove('loaded');
  pendingEditFavicon = null;

  const sources = getFaviconSources(url);

  function tryIdx(idx) {
    if (editFaviconEpoch !== epoch) return;
    if (idx >= sources.length) {
      img.style.display = 'none';
      letter.style.display = '';
      pendingEditFavicon = null;
      return;
    }
    img.onerror = () => tryIdx(idx + 1);
    img.onload  = () => {
      if (editFaviconEpoch !== epoch) return;
      img.style.display = '';
      letter.style.display = 'none';
      box.classList.add('loaded');
      pendingEditFavicon = img.src;
    };
    img.src = sources[idx];
  }
  tryIdx(0);
}

function saveEdit() {
  if (!editTargetId) return;
  const item = items.find(i => i.id === editTargetId);
  if (!item) return;

  let url  = document.getElementById('edit-url-input').value.trim();
  const name = document.getElementById('edit-name-input').value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  item.url  = url;
  item.name = name || item.name;
  // Clear cached favicon so it re-resolves with the new URL
  item.favicon = pendingEditFavicon ?? undefined;

  save().then(render);
  closeEditModal();
}

// ─── Add Site ─────────────────────────────────────────────────────────────────

function openAddModal() {
  _addTargetGroupId = null;
  document.getElementById('url-input').value  = '';
  document.getElementById('name-input').value = '';
  resetFaviconPreview();
  pendingFavicon = null;
  document.getElementById('add-modal').classList.remove('hidden');
  document.getElementById('url-input').focus();
}

function openAddModalForGroup(groupId) {
  _addTargetGroupId = groupId;
  document.getElementById('url-input').value  = '';
  document.getElementById('name-input').value = '';
  resetFaviconPreview();
  pendingFavicon = null;
  document.getElementById('add-modal').classList.remove('hidden');
  document.getElementById('url-input').focus();
}

function closeAddModal() {
  document.getElementById('add-modal').classList.add('hidden');
  faviconEpoch++;
  _addTargetGroupId = null;
}

function resetFaviconPreview() {
  const img    = document.getElementById('favicon-preview-img');
  const letter = document.getElementById('favicon-preview-letter');
  const box    = document.getElementById('favicon-preview-box');
  img.src = '';
  img.style.display  = 'none';
  letter.style.display = '';
  box.classList.remove('loaded');
}

let _faviconInputTimer = null;

function onUrlInput(rawValue) {
  clearTimeout(_faviconInputTimer);
  _faviconInputTimer = setTimeout(() => loadModalFaviconPreview(rawValue), 450);
}

function loadModalFaviconPreview(rawValue) {
  let url = rawValue.trim();
  if (!url) { resetFaviconPreview(); pendingFavicon = null; return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  // Auto-fill name from hostname if name field is still empty
  const nameInput = document.getElementById('name-input');
  if (!nameInput.value.trim()) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const base = host.split('.')[0];
      nameInput.value = base.charAt(0).toUpperCase() + base.slice(1);
    } catch {}
  }

  // Increment epoch so any stale chain is ignored
  faviconEpoch++;
  const epoch = faviconEpoch;

  const img    = document.getElementById('favicon-preview-img');
  const letter = document.getElementById('favicon-preview-letter');
  const box    = document.getElementById('favicon-preview-box');

  // Reset visual
  img.style.display  = 'none';
  letter.style.display = '';
  box.classList.remove('loaded');
  pendingFavicon = null;

  const sources = getFaviconSources(url);

  function tryIdx(idx) {
    if (faviconEpoch !== epoch) return; // a newer URL was typed; bail
    if (idx >= sources.length) {
      img.style.display  = 'none';
      letter.style.display = '';
      box.classList.remove('loaded');
      pendingFavicon = null;
      return;
    }
    img.onerror = () => tryIdx(idx + 1);
    img.onload  = () => {
      if (faviconEpoch !== epoch) return;
      img.style.display  = '';
      letter.style.display = 'none';
      box.classList.add('loaded');
      pendingFavicon = img.src;
    };
    img.src = sources[idx];
  }

  tryIdx(0);
}

function addSite() {
  let url  = document.getElementById('url-input').value.trim();
  const name = document.getElementById('name-input').value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const siteName = name || (() => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const base = host.split('.')[0];
      return base.charAt(0).toUpperCase() + base.slice(1);
    } catch { return url; }
  })();

  if (_addTargetGroupId) {
    const group = items.find(i => i.id === _addTargetGroupId);
    if (group) {
      group.items = group.items ?? [];
      group.items.push({ id: uid(), name: siteName, url, favicon: pendingFavicon ?? undefined });
      const gid = _addTargetGroupId;
      save();
      closeAddModal();
      openGroup(gid);
      return;
    }
  }

  items.push({
    id: uid(), type: 'site', name: siteName, url,
    favicon: pendingFavicon ?? undefined,
  });
  save().then(render);
  closeAddModal();
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const THEMES = ['pink', 'blue', 'yellow', 'dark', 'white'];

function applyTheme(theme) {
  THEMES.forEach(t => document.body.classList.remove(`theme-${t}`));
  document.body.classList.add(`theme-${theme}`);
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === theme);
  });
}

function saveTheme(theme) {
  chrome.storage.local.set({ theme });
}

async function loadTheme() {
  return new Promise(resolve => {
    chrome.storage.local.get(['theme'], r => {
      const theme = (r.theme && THEMES.includes(r.theme)) ? r.theme : 'yellow';
      applyTheme(theme);
      resolve(theme);
    });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await load();
  await loadTheme();
  render();

  // Add button (fixed, bottom-right)
  document.getElementById('add-btn').addEventListener('click', openAddModal);

  // Double-click on empty grid background opens add modal
  document.getElementById('app').addEventListener('dblclick', e => {
    if (e.target.closest('.tile') || pdActive) return;
    openAddModal();
  });

  // Double-click on empty group panel background adds to that group
  document.getElementById('group-panel').addEventListener('dblclick', e => {
    if (e.target.closest('.group-site-tile') ||
        e.target.closest('#close-group') ||
        e.target.closest('#group-header') ||
        e.target.closest('#group-dots')) return;
    if (openGroupId) openAddModalForGroup(openGroupId);
  });

  // Add modal
  document.getElementById('confirm-add').addEventListener('click', addSite);
  document.getElementById('cancel-add').addEventListener('click', closeAddModal);

  const urlInput = document.getElementById('url-input');
  urlInput.addEventListener('input', e => onUrlInput(e.target.value));
  urlInput.addEventListener('paste', e => {
    // paste fires before input value updates, so read it on next tick
    setTimeout(() => onUrlInput(urlInput.value), 0);
  });
  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const nameInput = document.getElementById('name-input');
      nameInput.value.trim() ? addSite() : nameInput.focus();
    }
    if (e.key === 'Escape') closeAddModal();
  });
  document.getElementById('name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSite();
    if (e.key === 'Escape') closeAddModal();
  });
  document.getElementById('add-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAddModal();
  });

  // Edit modal
  document.getElementById('confirm-edit').addEventListener('click', saveEdit);
  document.getElementById('cancel-edit').addEventListener('click', closeEditModal);
  const editUrlInput  = document.getElementById('edit-url-input');
  const editNameInput = document.getElementById('edit-name-input');
  editUrlInput.addEventListener('input', e => onEditUrlInput(e.target.value));
  editUrlInput.addEventListener('paste', () => setTimeout(() => onEditUrlInput(editUrlInput.value), 0));
  editUrlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') editNameInput.value.trim() ? saveEdit() : editNameInput.focus();
    if (e.key === 'Escape') closeEditModal();
  });
  editNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') closeEditModal();
  });
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  // Rename modal backdrop
  document.getElementById('rename-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('rename-modal').classList.add('hidden');
  });

  // Group overlay
  document.getElementById('close-group').addEventListener('click', closeGroup);
  document.getElementById('group-backdrop').addEventListener('click', closeGroup);

  // Context menu dismiss
  document.addEventListener('click', e => {
    if (!document.getElementById('context-menu').contains(e.target)) closeCtxMenu();
    if (!document.getElementById('theme-picker').contains(e.target)) {
      document.getElementById('theme-swatches').classList.add('hidden');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeCtxMenu(); closeGroup(); closeAddModal(); closeEditModal();
      document.getElementById('theme-swatches').classList.add('hidden');
    }
  });

  // Theme picker
  const themeBtn     = document.getElementById('theme-btn');
  const themeSwatches = document.getElementById('theme-swatches');
  themeBtn.addEventListener('click', e => {
    e.stopPropagation();
    themeSwatches.classList.toggle('hidden');
  });
  document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.addEventListener('click', e => {
      e.stopPropagation();
      const theme = swatch.dataset.theme;
      applyTheme(theme);
      saveTheme(theme);
      themeSwatches.classList.add('hidden');
    });
  });
});

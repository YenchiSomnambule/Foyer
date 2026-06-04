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
let _gpSuppressClick = false;
let gpSlotRects  = null;   // Natural bounding rects of every tile captured at drag-start (no transforms)
let gpInsertSlot = -1;     // Slot index where the dragged icon would land if dropped now
let gpDragPage   = null;   // The .group-page element we're currently reordering within
let _gpEdgeCooldown = false;
let _gpEdgeCooldownTimer = null;
let _gpDraggingOut = false;   // true when the drag clone is outside the group panel
const _GP_DIST = 6;
const _GP_EASE = 'cubic-bezier(0.25,0.46,0.45,0.94)';
const _GP_DUR  = 380; // ms

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

  // Capture each tile's current COMPOSITED transform via getComputedStyle() BEFORE
  // cancelling so mid-animation positions are used as FIRST, not the stale layout pos.
  others.forEach(t => {
    const anims = t.getAnimations();
    if (anims.length === 0) return;
    const ct = getComputedStyle(t).transform;
    anims.forEach(a => { try { a.cancel(); } catch {} });
    t.style.transform = (ct && ct !== 'none') ? ct : '';
  });

  // FIRST: current visual positions
  const firsts = new Map(others.map(t => [t, t.getBoundingClientRect()]));

  // Clear inline overrides so the DOM move lands on clean layout positions
  others.forEach(t => { t.style.transition = ''; t.style.transform = ''; });

  // Move the ghost placeholder
  if (insertBefore) grid.insertBefore(pdSrcEl, tgtEl);
  else              grid.insertBefore(pdSrcEl, tgtEl.nextSibling);

  // LAST: new layout positions after DOM move
  grid.offsetHeight;
  const lasts = new Map(others.map(t => [t, t.getBoundingClientRect()]));

  // Animate each tile from FIRST to LAST using explicit start keyframes
  others.forEach(t => {
    const f = firsts.get(t), l = lasts.get(t);
    if (!f || !l) return;
    const dx = f.left - l.left, dy = f.top - l.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    t.animate(
      [
        { transform: `translate(${dx}px,${dy}px)` },
        { transform: 'translate(0,0)' }
      ],
      { duration: 400, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)', fill: 'forwards' }
    );
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
  if (_gpEdgeCooldownTimer) { clearTimeout(_gpEdgeCooldownTimer); _gpEdgeCooldownTimer = null; }
  _gpEdgeCooldown = false;
  _gpDraggingOut  = false;

  gpDragPage = el.closest('.group-page');
  const tiles = [...gpDragPage.querySelectorAll('.group-site-tile')];

  // Ensure no leftover transforms/animations from a prior drag before snapshotting positions
  tiles.forEach(t => {
    t.getAnimations().forEach(a => { try { a.cancel(); } catch {} });
    t.style.transition = '';
    t.style.transform  = '';
    t.style.zIndex     = '';
  });
  gpDragPage.offsetHeight; // flush so getBoundingClientRect reads clean layout

  // Snapshot natural slot positions ONCE — these are reused for the entire drag
  gpSlotRects  = tiles.map(t => t.getBoundingClientRect());
  gpInsertSlot = tiles.indexOf(el); // starts at its own slot (no visual change)

  // Enable CSS transitions on all tiles — browser handles all animation automatically,
  // including smooth re-targeting mid-animation when the cursor changes direction
  tiles.forEach(t => { t.style.transition = `transform ${_GP_DUR}ms ${_GP_EASE}`; });

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

// Sets each tile's CSS transform so that the drag icon appears at insertSlot
// while all other icons shift to fill the remaining slots — no DOM mutation.
// CSS transitions automatically interpolate from whatever transform is currently
// applied, so mid-drag direction changes always animate from the current visual
// position rather than snapping back to natural positions.
function _gpSetOrder(insertSlot) {
  if (!gpDragSrcEl || !gpDragPage || !gpSlotRects) return;
  const tiles = [...gpDragPage.querySelectorAll('.group-site-tile')];
  const dragIdx = tiles.indexOf(gpDragSrcEl);
  if (dragIdx < 0) return;
  const n = tiles.length;
  const slot = Math.max(0, Math.min(insertSlot, n - 1));
  if (slot === gpInsertSlot) return; // no change
  gpInsertSlot = slot;

  // Build visual order: visualOrder[slotIndex] = tile index
  const others = Array.from({length: n}, (_, i) => i).filter(i => i !== dragIdx);
  const visualOrder = [];
  let oi = 0;
  for (let s = 0; s < n; s++) {
    visualOrder.push(s === slot ? dragIdx : others[oi++]);
  }

  // Apply transforms — drag source stays invisible at natural pos, others shift
  tiles.forEach((tile, ti) => {
    if (ti === dragIdx) return;
    const targetSlot = visualOrder.indexOf(ti);
    const src = gpSlotRects[ti];
    const tgt = gpSlotRects[targetSlot];
    tile.style.transform = `translate(${tgt.left - src.left}px,${tgt.top - src.top}px)`;
  });
}

function _gpMoveDrag(cx, cy) {
  if (!gpDragClone) return;
  gpDragClone.style.left = (cx - gpOffX) + 'px';
  gpDragClone.style.top  = (cy - gpOffY) + 'px';

  // Detect whether the cursor is outside the group panel
  const pr     = document.getElementById('group-panel').getBoundingClientRect();
  const wasOut = _gpDraggingOut;
  _gpDraggingOut = cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom;

  if (_gpDraggingOut) {
    // Shrink clone to signal "release here = back to main grid"
    gpDragClone.style.transform = 'scale(0.85)';
    gpDragClone.style.opacity   = '0.7';
    // Reset any reorder previews so group tiles snap back to their natural positions
    if (!wasOut && gpDragPage) {
      [...gpDragPage.querySelectorAll('.group-site-tile')].forEach(t => {
        t.style.transform = '';
      });
    }
    return;
  }

  // Re-entering the panel: restore clone appearance
  if (wasOut) {
    gpDragClone.style.transform = 'scale(1.12)';
    gpDragClone.style.opacity   = '0.92';
  }

  // Edge-flip: dragging toward a panel edge moves the icon to the adjacent page
  if (!_gpEdgeCooldown) {
    const EDGE = 56;
    if (cx < pr.left + EDGE && groupCurrentPage > 0) {
      _gpFlipToPage(groupCurrentPage - 1, true);
      return;
    }
    if (cx > pr.right - EDGE && groupCurrentPage < groupTotalPages - 1) {
      _gpFlipToPage(groupCurrentPage + 1, false);
      return;
    }
  }

  if (!gpSlotRects) return;

  // Find the slot whose natural center is closest to the clone's icon center
  const cloneIcon = gpDragClone.querySelector('.group-site-icon') ?? gpDragClone;
  const cr = cloneIcon.getBoundingClientRect();
  const cloneCX = cr.left + cr.width  / 2;
  const cloneCY = cr.top  + cr.height / 2;

  let nearestSlot = 0, nearestDist = Infinity;
  gpSlotRects.forEach((r, i) => {
    const d = Math.hypot(cloneCX - (r.left + r.width / 2), cloneCY - (r.top + r.height / 2));
    if (d < nearestDist) { nearestDist = d; nearestSlot = i; }
  });

  _gpSetOrder(nearestSlot);
}



function _gpFlipToPage(newPage, placeAtEnd) {
  const track = document.getElementById('group-pages-track');
  const dots  = document.getElementById('group-dots');
  const pages = [...track.querySelectorAll('.group-page')];
  if (newPage < 0 || newPage >= pages.length || !gpDragSrcEl) return;
  const targetPage = pages[newPage];

  // Clear transforms on old page (no DOM mutations, just reset visuals)
  if (gpDragPage) {
    [...gpDragPage.querySelectorAll('.group-site-tile')].forEach(t => {
      t.style.transition = '';
      t.style.transform  = '';
      t.style.zIndex     = '';
    });
  }
  // Clean any stragglers on the target page
  [...targetPage.querySelectorAll('.group-site-tile')].forEach(t => {
    t.getAnimations().forEach(a => { try { a.cancel(); } catch {} });
    t.style.transition = '';
    t.style.transform  = '';
    t.style.zIndex     = '';
  });

  // Enforce 9-per-page
  const targetTiles = [...targetPage.querySelectorAll('.group-site-tile')]
    .filter(t => t !== gpDragSrcEl);
  if (targetTiles.length >= 9) {
    const overflow = targetTiles[targetTiles.length - 1];
    let nextPage = pages[newPage + 1];
    if (!nextPage) {
      nextPage = document.createElement('div');
      nextPage.className = 'group-page';
      track.appendChild(nextPage);
      groupTotalPages++;
      const dot = document.createElement('div');
      dot.className = 'group-dot';
      dot.addEventListener('click', () => {
        const idx = [...track.querySelectorAll('.group-page')].indexOf(nextPage);
        if (idx >= 0) goToGroupPage(idx);
      });
      dots.appendChild(dot);
    }
    nextPage.prepend(overflow);
  }

  if (placeAtEnd) targetPage.appendChild(gpDragSrcEl);
  else            targetPage.prepend(gpDragSrcEl);

  // Switch drag page and re-snapshot slot rects for the new page
  gpDragPage = targetPage;
  targetPage.offsetHeight; // flush so rects are accurate
  const newTiles = [...targetPage.querySelectorAll('.group-site-tile')];
  gpSlotRects  = newTiles.map(t => t.getBoundingClientRect());
  gpInsertSlot = newTiles.indexOf(gpDragSrcEl); // placed at start or end, no visual shift needed

  // Enable transitions on new page tiles
  newTiles.forEach(t => { t.style.transition = `transform ${_GP_DUR}ms ${_GP_EASE}`; });

  if (_gpEdgeCooldownTimer) clearTimeout(_gpEdgeCooldownTimer);
  _gpEdgeCooldown = true;
  _gpEdgeCooldownTimer = setTimeout(() => {
    _gpEdgeCooldown = false;
    _gpEdgeCooldownTimer = null;
  }, 700);

  dots.querySelectorAll('.group-dot').forEach((d, i) =>
    d.classList.toggle('active', i === groupCurrentPage)
  );

  goToGroupPage(newPage);
}

function _gpCommitDrag(groupId) {
  if (_gpEdgeCooldownTimer) { clearTimeout(_gpEdgeCooldownTimer); _gpEdgeCooldownTimer = null; }
  _gpEdgeCooldown = false;
  gpDragClone?.remove(); gpDragClone = null;
  if (gpDragSrcEl) gpDragSrcEl.style.opacity = '';

  // Dropped outside the group panel → move site back to main grid
  const wasDraggingOut = _gpDraggingOut;
  _gpDraggingOut = false;

  if (wasDraggingOut && gpDragSrcId) {
    const group = items.find(i => i.id === groupId);
    if (group) {
      const site = group.items.find(s => s.id === gpDragSrcId);
      if (site) {
        group.items = group.items.filter(s => s.id !== gpDragSrcId);
        items.push({ id: uid(), type: 'site', name: site.name, url: site.url, favicon: site.favicon });

        if (group.items.length <= 1) {
          if (group.items.length === 1) {
            const rem = group.items[0];
            items = items.filter(i => i.id !== groupId);
            items.push({ id: uid(), type: 'site', name: rem.name, url: rem.url, favicon: rem.favicon });
          } else {
            items = items.filter(i => i.id !== groupId);
          }
        }
      }
    }
    _gpSuppressClick = true;
    requestAnimationFrame(() => { _gpSuppressClick = false; });
    gpDragSrcId = null; gpDragSrcEl = null;
    gpSlotRects = null; gpInsertSlot = -1; gpDragPage = null;
    gpActive = false;
    save();
    render();
    closeGroup();
    return;
  }

  // Commit the visual order to the DOM: re-append tiles in the order they're
  // currently displayed, then clear all transforms so layout matches DOM order.
  if (gpDragPage && gpDragSrcEl && gpInsertSlot >= 0) {
    const tiles    = [...gpDragPage.querySelectorAll('.group-site-tile')];
    const dragIdx  = tiles.indexOf(gpDragSrcEl);
    if (dragIdx >= 0) {
      const n      = tiles.length;
      const slot   = Math.max(0, Math.min(gpInsertSlot, n - 1));
      const others = Array.from({length: n}, (_, i) => i).filter(i => i !== dragIdx);
      const order  = [];
      let oi = 0;
      for (let s = 0; s < n; s++) order.push(s === slot ? dragIdx : others[oi++]);

      // Disable transitions before DOM reorder so tiles snap to their new natural positions
      tiles.forEach(t => { t.style.transition = 'none'; t.style.transform = ''; t.style.zIndex = ''; });
      order.forEach(ti => gpDragPage.appendChild(tiles[ti]));
      gpDragPage.offsetHeight;
    }
  }

  // Clean up the rest of the track (other pages, any leftovers)
  document.querySelectorAll('#group-pages-track .group-site-tile').forEach(t => {
    t.getAnimations().forEach(a => { try { a.cancel(); } catch {} });
    t.style.transition = '';
    t.style.transform  = '';
    t.style.zIndex     = '';
  });

  // Sync group.items from full DOM order across all pages
  const group = items.find(i => i.id === groupId);
  if (group) {
    const allDomIds = [...document.querySelectorAll('#group-pages-track .group-site-tile')]
      .map(t => t.dataset.siteId);
    group.items = allDomIds.map(sid => group.items.find(s => s.id === sid)).filter(Boolean);
  }

  _gpSuppressClick = true;
  requestAnimationFrame(() => { _gpSuppressClick = false; });

  gpDragSrcId = null; gpDragSrcEl = null;
  gpSlotRects = null; gpInsertSlot = -1; gpDragPage = null;
  gpActive = false;

  save();
  _refreshGroupTile(groupId);
}

function _refreshGroupTile(groupId) {
  const group = items.find(i => i.id === groupId);
  if (!group) return;
  const old = document.querySelector(`#grid .tile[data-id="${groupId}"]`);
  if (!old) return;
  old.replaceWith(buildGroupTile(group));
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
  menu.innerHTML = `<button class="ctx-item ctx-danger" data-action="delete">Delete</button>`;
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    const group = items.find(i => i.id === groupId);
    if (!group) return;

    // Permanently delete the site from the group
    group.items = group.items.filter(s => s.id !== siteId);

    // Dissolve group if fewer than 2 items remain
    if (group.items.length <= 1) {
      if (group.items.length === 1) {
        const rem = group.items[0];
        items = items.filter(i => i.id !== groupId);
        items.push({ id: uid(), type: 'site', name: rem.name, url: rem.url, favicon: rem.favicon });
      } else {
        items = items.filter(i => i.id !== groupId);
      }
    }

    save();
    render();
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

  const editUrlEl = document.getElementById('edit-url-input');
  editUrlEl.value  = item.url;
  document.getElementById('edit-name-input').value = item.name;
  clearUrlError(editUrlEl);

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

  const editUrlInput = document.getElementById('edit-url-input');
  let url  = editUrlInput.value.trim();
  const name = document.getElementById('edit-name-input').value.trim();
  if (!url) { showUrlError(editUrlInput, 'Please enter a website URL.'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!isValidUrl(url)) { showUrlError(editUrlInput, 'That doesn\'t look like a valid URL.'); return; }

  item.url  = url;
  item.name = name || item.name;
  // Clear cached favicon so it re-resolves with the new URL
  item.favicon = pendingEditFavicon ?? undefined;

  save().then(render);
  closeEditModal();
}

// ─── URL Validation ──────────────────────────────────────────────────────────

function isValidUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost'
      || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)
      || hostname.includes('.');
  } catch {
    return false;
  }
}

function showUrlError(inputEl, msg) {
  inputEl.classList.add('input-invalid');
  let errEl = inputEl.parentElement.querySelector('.input-error');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.className = 'input-error';
    inputEl.insertAdjacentElement('afterend', errEl);
  }
  errEl.textContent = msg;
  const clear = () => {
    inputEl.classList.remove('input-invalid');
    errEl.textContent = '';
    inputEl.removeEventListener('input', clear);
  };
  inputEl.addEventListener('input', clear);
  inputEl.focus();
}

function clearUrlError(inputEl) {
  inputEl.classList.remove('input-invalid');
  const errEl = inputEl.parentElement?.querySelector('.input-error');
  if (errEl) errEl.textContent = '';
}

// ─── Add Site ─────────────────────────────────────────────────────────────────

function openAddModal() {
  _addTargetGroupId = null;
  const urlInput = document.getElementById('url-input');
  urlInput.value  = '';
  document.getElementById('name-input').value = '';
  clearUrlError(urlInput);
  resetFaviconPreview();
  pendingFavicon = null;
  document.getElementById('add-modal').classList.remove('hidden');
  urlInput.focus();
}

function openAddModalForGroup(groupId) {
  _addTargetGroupId = groupId;
  const urlInput = document.getElementById('url-input');
  urlInput.value  = '';
  document.getElementById('name-input').value = '';
  clearUrlError(urlInput);
  resetFaviconPreview();
  pendingFavicon = null;
  document.getElementById('add-modal').classList.remove('hidden');
  urlInput.focus();
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
  const urlInput = document.getElementById('url-input');
  let url  = urlInput.value.trim();
  const name = document.getElementById('name-input').value.trim();
  if (!url) { showUrlError(urlInput, 'Please enter a website URL.'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!isValidUrl(url)) { showUrlError(urlInput, 'That doesn\'t look like a valid URL.'); return; }
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

const THEMES = ['pink', 'blue', 'yellow', 'dark', 'cream'];

function applyTheme(theme) {
  ['background','background-image','background-size','background-position','background-repeat']
    .forEach(p => document.body.style.removeProperty(p));
  ['--text-color','--text-shadow','--glass','--glass-border',
   '--overlay-bg','--add-btn-bg','--add-btn-border','--add-btn-color']
    .forEach(p => document.body.style.removeProperty(p));
  THEMES.forEach(t => document.body.classList.remove(`theme-${t}`));
  document.body.classList.remove('theme-custom');
  document.body.classList.remove('theme-image');
  document.body.classList.add(`theme-${theme}`);
  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.theme === theme);
  });
  document.getElementById('swatch-custom')?.style.removeProperty('background');
  _resetImageSwatch();
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function applyCustomColor(hex) {
  const [h, s, l] = hexToHsl(hex);
  const blobS = Math.max(s - 10, 25);
  // Ensure blobs are always visible: minimum 35% lightness so they show on very dark picks
  const blobL = Math.min(Math.max(l + 28, 35), 92);
  const baseL = Math.max(l - 8, 10);

  document.body.style.background = [
    `radial-gradient(ellipse 80% 60% at 28% 22%, hsla(${h},${blobS}%,${blobL}%,0.72) 0%, transparent 60%)`,
    `radial-gradient(ellipse 70% 55% at 72% 65%, hsla(${(h+10)%360},${blobS}%,${Math.max(blobL-3,32)}%,0.62) 0%, transparent 55%)`,
    `radial-gradient(ellipse 50% 45% at 14% 78%, hsla(${h},${Math.min(blobS+5,100)}%,${Math.max(blobL-1,33)}%,0.52) 0%, transparent 50%)`,
    `radial-gradient(ellipse 55% 50% at 86% 18%, hsla(${(h-5+360)%360},${Math.max(blobS-3,20)}%,${Math.max(blobL-2,33)}%,0.55) 0%, transparent 52%)`,
    `linear-gradient(155deg, hsl(${h},${s}%,${baseL}%) 0%, hsl(${(h+5)%360},${s}%,${baseL+5}%) 28%, hsl(${h},${s}%,${baseL+8}%) 55%, hsl(${(h+5)%360},${s}%,${baseL+5}%) 78%, hsl(${h},${s}%,${baseL}%) 100%)`
  ].join(', ');

  THEMES.forEach(t => document.body.classList.remove(`theme-${t}`));
  document.body.classList.remove('theme-image');
  document.body.classList.add('theme-custom');
  _resetImageSwatch();

  // Threshold 55: light backgrounds (l>=55) get dark text; dark gets explicit white
  if (l >= 55) {
    document.body.style.setProperty('--text-color', 'rgba(30,25,15,0.85)');
    document.body.style.setProperty('--text-shadow', '0 1px 3px rgba(255,255,255,0.45)');
    document.body.style.setProperty('--glass', 'rgba(0,0,0,0.07)');
    document.body.style.setProperty('--glass-border', 'rgba(0,0,0,0.14)');
    document.body.style.setProperty('--overlay-bg', 'rgba(0,0,0,0.3)');
    document.body.style.setProperty('--add-btn-bg', 'rgba(0,0,0,0.07)');
    document.body.style.setProperty('--add-btn-border', 'rgba(0,0,0,0.22)');
    document.body.style.setProperty('--add-btn-color', 'rgba(30,25,15,0.75)');
  } else {
    // Explicitly set white-text dark-mode values rather than relying on :root defaults
    document.body.style.setProperty('--text-color', 'rgba(255,255,255,0.92)');
    document.body.style.setProperty('--text-shadow', '0 1px 4px rgba(0,0,0,0.5)');
    document.body.style.setProperty('--glass', 'rgba(255,255,255,0.14)');
    document.body.style.setProperty('--glass-border', 'rgba(255,255,255,0.22)');
    document.body.style.setProperty('--overlay-bg', 'rgba(0,0,0,0.45)');
    document.body.style.setProperty('--add-btn-bg', 'rgba(255,255,255,0.14)');
    document.body.style.setProperty('--add-btn-border', 'rgba(255,255,255,0.22)');
    document.body.style.setProperty('--add-btn-color', 'rgba(255,255,255,0.92)');
  }

  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  const customSwatch = document.getElementById('swatch-custom');
  if (customSwatch) {
    customSwatch.classList.add('active');
    customSwatch.style.background = hex;  // Show chosen color instead of rainbow
  }
}

function saveCustomColor(hex) {
  chrome.storage.local.set({ theme: 'custom', customColor: hex });
}

function saveTheme(theme) {
  chrome.storage.local.set({ theme });
}

async function loadTheme() {
  return new Promise(resolve => {
    chrome.storage.local.get(['theme', 'customColor', 'bgImage'], r => {
      if (r.theme === 'custom' && r.customColor) {
        applyCustomColor(r.customColor);
        const inp = document.getElementById('custom-color-input');
        if (inp) inp.value = r.customColor;
        resolve('custom');
      } else if (r.theme === 'image' && r.bgImage) {
        applyBgImage(r.bgImage);
        resolve('image');
      } else {
        const theme = (r.theme && THEMES.includes(r.theme)) ? r.theme : 'cream';
        applyTheme(theme);
        resolve(theme);
      }
    });
  });
}

// ─── Image background ────────────────────────────────────────────────────────

function compressImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1920;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const r = Math.min(MAX / width, MAX / height);
        width  = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function _resetImageSwatch() {
  const btn = document.getElementById('swatch-image');
  if (btn) {
    btn.style.removeProperty('background-image');
    btn.style.removeProperty('background-size');
    btn.style.removeProperty('background-position');
  }
}

function applyBgImage(dataUrl) {
  document.body.style.background = `url("${dataUrl}") center/cover no-repeat`;
  THEMES.forEach(t => document.body.classList.remove(`theme-${t}`));
  document.body.classList.remove('theme-custom');
  document.body.classList.add('theme-image');

  // White-text vars — readable over arbitrary photos
  document.body.style.setProperty('--text-color',    'rgba(255,255,255,0.92)');
  document.body.style.setProperty('--text-shadow',   '0 1px 4px rgba(0,0,0,0.6)');
  document.body.style.setProperty('--glass',         'rgba(255,255,255,0.18)');
  document.body.style.setProperty('--glass-border',  'rgba(255,255,255,0.28)');
  document.body.style.setProperty('--overlay-bg',    'rgba(0,0,0,0.5)');
  document.body.style.setProperty('--add-btn-bg',    'rgba(255,255,255,0.18)');
  document.body.style.setProperty('--add-btn-border','rgba(255,255,255,0.28)');
  document.body.style.setProperty('--add-btn-color', 'rgba(255,255,255,0.92)');

  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  const btn = document.getElementById('swatch-image');
  if (btn) {
    btn.classList.add('active');
    btn.style.backgroundImage  = `url("${dataUrl}")`;
    btn.style.backgroundSize   = 'cover';
    btn.style.backgroundPosition = 'center';
  }
}

function saveBgImage(dataUrl) {
  chrome.storage.local.set({ theme: 'image', bgImage: dataUrl });
}

// ─── Tutorial ────────────────────────────────────────────────────────────────

const TUT_STEPS = [
  { sel: null,         title: 'Welcome to Foyer',  body: "Your websites, organised in a clean home screen grid. Here's a quick tour — or tap Skip to jump straight in." },
  { sel: '#add-btn',   title: 'Add a website',      body: 'Tap + to add any site. Paste a URL, give it a name, and it joins the grid.' },
  { sel: '.tile',      title: 'Open or manage',     body: 'Click an icon to open the site. Right-click for options: rename, edit, or delete.' },
  { sel: '#grid',      title: 'Drag to organise',   body: 'Drag icons to rearrange. Drop one onto another to create a folder group.' },
  { sel: '#theme-btn', title: 'Change the look',    body: 'Pick a preset theme or dial in a custom colour. Saves automatically.' },
];

let _tutStep = 0;

function _startTutorial() {
  _tutStep = 0;
  const spot = document.getElementById('tutorial-spotlight');
  // Pre-position to first real target so step 1's reveal is instant (no sliding from nowhere)
  const firstReal = TUT_STEPS.find(s => s.sel);
  if (firstReal) {
    const el = document.querySelector(firstReal.sel);
    if (el) {
      const r = el.getBoundingClientRect(), PAD = 14;
      Object.assign(spot.style, {
        left: `${r.left - PAD}px`, top: `${r.top - PAD}px`,
        width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px`,
      });
    }
  }
  spot.style.opacity = '0';
  document.getElementById('tutorial-overlay').classList.remove('hidden');
  _renderTutStep();
}

function _renderTutStep() {
  const step   = TUT_STEPS[_tutStep];
  const spot   = document.getElementById('tutorial-spotlight');
  const card   = document.getElementById('tutorial-card');
  const isLast = _tutStep === TUT_STEPS.length - 1;

  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-body').textContent  = step.body;
  document.getElementById('tutorial-next').textContent  = isLast ? 'Done ✓' : 'Next →';
  document.getElementById('tutorial-dots').innerHTML    = TUT_STEPS.map((_, i) =>
    `<span class="t-dot${i === _tutStep ? ' on' : ''}"></span>`).join('');

  const target = step.sel ? document.querySelector(step.sel) : null;
  const PAD = 14, CW = 300;

  if (!target) {
    spot.style.opacity = '0';
    Object.assign(card.style, { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' });
    return;
  }

  const r = target.getBoundingClientRect();
  Object.assign(spot.style, {
    opacity: '1',
    left:   `${r.left  - PAD}px`,
    top:    `${r.top   - PAD}px`,
    width:  `${r.width  + PAD * 2}px`,
    height: `${r.height + PAD * 2}px`,
  });

  const cx       = r.left + r.width / 2;
  const cardLeft = Math.max(12, Math.min(cx - CW / 2, window.innerWidth - CW - 12));
  const cardTop  = window.innerHeight - r.bottom - PAD - 20 > 160
    ? r.bottom + PAD + 20
    : Math.max(12, r.top - PAD - 20 - 170);

  Object.assign(card.style, { top: `${cardTop}px`, left: `${cardLeft}px`, transform: 'none' });
}

function _tutNext() {
  _tutStep++;
  if (_tutStep >= TUT_STEPS.length) { _tutDone(); return; }
  _renderTutStep();
}

function _tutDone() {
  document.getElementById('tutorial-overlay').classList.add('hidden');
  chrome.storage.local.set({ tutorialDone: true });
}

// ─── Search / Quick Launch ────────────────────────────────────────────────────

let _srActiveIdx = -1;

function _flattenSites() {
  const out = [];
  for (const item of items) {
    if (item.type === 'site') {
      out.push({ name: item.name, url: item.url, favicon: item.favicon ?? null, groupName: null });
    } else if (item.type === 'group') {
      for (const s of (item.items ?? [])) {
        out.push({ name: s.name, url: s.url, favicon: s.favicon ?? null, groupName: item.name });
      }
    }
  }
  return out;
}

function _hlMatch(str, q) {
  if (!q) return escHtml(str);
  const idx = str.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return escHtml(str);
  return escHtml(str.slice(0, idx))
    + `<mark>${escHtml(str.slice(idx, idx + q.length))}</mark>`
    + escHtml(str.slice(idx + q.length));
}

function openSearch() {
  document.getElementById('search-overlay').classList.remove('hidden');
  const inp = document.getElementById('search-input');
  inp.value = '';
  _srActiveIdx = -1;
  _renderSearch('');
  requestAnimationFrame(() => inp.focus());
}

function closeSearch() {
  document.getElementById('search-overlay').classList.add('hidden');
  _srActiveIdx = -1;
}

function _renderSearch(raw) {
  const el = document.getElementById('search-results');
  const all = _flattenSites();
  const q = raw.trim().toLowerCase();

  let list = q
    ? all.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q)  ||
        (s.groupName && s.groupName.toLowerCase().includes(q)))
    : all;

  if (q) {
    list = list.slice().sort((a, b) => {
      const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      if (an === q   && bn !== q)   return -1;
      if (bn === q   && an !== q)   return  1;
      if (an.startsWith(q) && !bn.startsWith(q)) return -1;
      if (bn.startsWith(q) && !an.startsWith(q)) return  1;
      return 0;
    });
  }

  if (!list.length) {
    el.innerHTML = `<div class="sr-empty">No results for "${escHtml(raw.trim())}"</div>`;
    _srActiveIdx = -1;
    return;
  }

  el.innerHTML = list.map((site, i) => `
    <div class="sr-item${i === _srActiveIdx ? ' active' : ''}" role="option"
         data-url="${escHtml(site.url)}" data-idx="${i}">
      <div class="sr-icon" style="background:${tileGradient(site.url)}"
           data-fav="${escHtml(site.favicon ?? '')}">
        <span>${(site.name[0] ?? '?').toUpperCase()}</span>
        <img alt="" draggable="false" style="display:none">
      </div>
      <div class="sr-text">
        <div class="sr-name">${_hlMatch(site.name, raw.trim())}</div>
        <div class="sr-url">${_hlMatch(site.url, raw.trim())}</div>
      </div>
      ${site.groupName
        ? `<span class="sr-group" title="${escHtml(site.groupName)}">${escHtml(site.groupName)}</span>`
        : ''}
    </div>
  `).join('');

  // Show cached favicons
  el.querySelectorAll('.sr-icon[data-fav]').forEach(icon => {
    const fav = icon.dataset.fav;
    if (!fav) return;
    const img = icon.querySelector('img'), span = icon.querySelector('span');
    img.onload  = () => { img.style.display = ''; span.style.display = 'none'; };
    img.onerror = () => {};
    img.src = fav;
  });

  // Pointer interactions
  el.querySelectorAll('.sr-item').forEach(row => {
    row.addEventListener('mouseenter', () => {
      _srActiveIdx = +row.dataset.idx;
      _srHighlight();
    });
    row.addEventListener('click', () => { window.location.href = row.dataset.url; });
  });
}

function _srHighlight() {
  document.querySelectorAll('.sr-item').forEach((r, i) => {
    r.classList.toggle('active', i === _srActiveIdx);
    if (i === _srActiveIdx) r.scrollIntoView({ block: 'nearest' });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await load();
  await loadTheme();
  render();

  // Tutorial: wire buttons first, then check if first launch
  document.getElementById('tutorial-next').addEventListener('click', _tutNext);
  document.getElementById('tutorial-skip').addEventListener('click', _tutDone);
  chrome.storage.local.get('tutorialDone', r => { if (!r.tutorialDone) _startTutorial(); });

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
      if (!document.getElementById('search-overlay').classList.contains('hidden'))   { closeSearch();  return; }
      if (!document.getElementById('tutorial-overlay').classList.contains('hidden')) { _tutDone();     return; }
      closeCtxMenu(); closeGroup(); closeAddModal(); closeEditModal();
      document.getElementById('theme-swatches').classList.add('hidden');
      return;
    }
    // ⌘K / Ctrl+K or "/" → open search (not when an input is focused or a modal is open)
    const tag = document.activeElement?.tagName;
    const modalOpen = ['add-modal','edit-modal','rename-modal'].some(
      id => !document.getElementById(id).classList.contains('hidden')
    );
    if (!modalOpen) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); return; }
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); openSearch(); }
    }
  });

  // Search input behaviour
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', e => {
    _srActiveIdx = -1;
    _renderSearch(e.target.value);
  });
  searchInput.addEventListener('keydown', e => {
    const rows = document.querySelectorAll('.sr-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _srActiveIdx = Math.min(_srActiveIdx + 1, rows.length - 1);
      if (_srActiveIdx < 0 && rows.length) _srActiveIdx = 0;
      _srHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _srActiveIdx = Math.max(_srActiveIdx - 1, -1);
      _srHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = document.querySelector('.sr-item.active') ?? document.querySelector('.sr-item');
      if (active) window.location.href = active.dataset.url;
    }
  });
  document.getElementById('search-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSearch();
  });

  // Theme picker
  const themeBtn     = document.getElementById('theme-btn');
  const themeSwatches = document.getElementById('theme-swatches');
  themeBtn.addEventListener('click', e => {
    e.stopPropagation();
    themeSwatches.classList.toggle('hidden');
  });
  document.querySelectorAll('.swatch[data-theme]').forEach(swatch => {
    swatch.addEventListener('click', e => {
      e.stopPropagation();
      const theme = swatch.dataset.theme;
      applyTheme(theme);
      saveTheme(theme);
      themeSwatches.classList.add('hidden');
    });
  });

  const swatchCustom = document.getElementById('swatch-custom');
  const colorInput   = document.getElementById('custom-color-input');
  swatchCustom.addEventListener('click', e => {
    e.stopPropagation();
    colorInput.click();
  });
  colorInput.addEventListener('input', e => {
    applyCustomColor(e.target.value);
    saveCustomColor(e.target.value);
  });

  // Image background picker
  const swatchImage  = document.getElementById('swatch-image');
  const bgImageInput = document.getElementById('bg-image-input');
  swatchImage.addEventListener('click', e => {
    e.stopPropagation();
    bgImageInput.click();
  });
  bgImageInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    if (!dataUrl) return;
    applyBgImage(dataUrl);
    saveBgImage(dataUrl);
    themeSwatches.classList.add('hidden');
    e.target.value = ''; // reset so same file can be re-picked
  });
});

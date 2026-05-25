'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function getFavicon(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return null;
  }
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── State ───────────────────────────────────────────────────────────────────

let items = [];
let ctxTargetId = null;
let openGroupId = null;

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
  tile.draggable = true;

  const fav = getFavicon(item.url) ?? '';
  tile.innerHTML = `
    <div class="tile-icon">
      <img src="${fav}" alt="" draggable="false">
      <div class="tile-icon-fallback" style="display:none">${(item.name[0]??'?').toUpperCase()}</div>
    </div>
    <span class="tile-name">${escHtml(item.name)}</span>
  `;

  tile.querySelector('img').addEventListener('error', e => {
    e.target.style.display = 'none';
    tile.querySelector('.tile-icon-fallback').style.display = 'flex';
  });

  tile.addEventListener('click', e => {
    if (e.defaultPrevented) return;
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
  tile.draggable = true;

  const miniIcons = (item.items ?? []).slice(0, 9).map(s => {
    const fav = getFavicon(s.url) ?? '';
    return `<img src="${fav}" alt="" class="mini-favicon" draggable="false">`;
  }).join('');

  tile.innerHTML = `
    <div class="tile-icon group-icon">
      <div class="mini-grid">${miniIcons}</div>
    </div>
    <span class="tile-name">${escHtml(item.name)}</span>
  `;

  tile.addEventListener('click', e => {
    if (e.defaultPrevented) return;
    openGroup(item.id);
  });

  attachDrag(tile, item.id);
  attachContextMenu(tile, item.id);
  return tile;
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────
// Three modes:
//   reorder-before  – drop indicator left of target  → insert before target
//   reorder-after   – drop indicator right of target → insert after target
//   group           – merge src into/with target tile

let dragSrcId  = null;
let dropTgtId  = null;
let dropMode   = null;   // 'before' | 'after' | 'group'

function clearDragIndicators() {
  document.querySelectorAll(
    '.drag-group-target, .drop-before, .drop-after'
  ).forEach(el => el.classList.remove('drag-group-target', 'drop-before', 'drop-after'));
}

function attachDrag(tile, id) {
  tile.addEventListener('dragstart', e => {
    dragSrcId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // Defer so the drag image captures normal tile, not the dimmed state
    requestAnimationFrame(() => tile.classList.add('dragging'));
  });

  tile.addEventListener('dragend', () => {
    tile.classList.remove('dragging');
    clearDragIndicators();
    dragSrcId = null;
    dropTgtId = null;
    dropMode  = null;
    render(); // ensure clean state if drop was handled or cancelled
  });

  tile.addEventListener('dragover', e => {
    if (!dragSrcId || dragSrcId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Auto-scroll #app when near the top/bottom edge
    const app = document.getElementById('app');
    const ZONE = 80, SPEED = 10;
    if (e.clientY < ZONE) app.scrollTop -= SPEED;
    else if (e.clientY > window.innerHeight - ZONE) app.scrollTop += SPEED;

    const rect = tile.getBoundingClientRect();
    const relX  = (e.clientX - rect.left)  / rect.width;
    const relY  = (e.clientY - rect.top)   / rect.height;
    const dist  = Math.sqrt((relX - 0.5) ** 2 + (relY - 0.5) ** 2);

    clearDragIndicators();

    if (dist < 0.28) {
      // Center zone → group merge
      dropTgtId = id;
      dropMode  = 'group';
      tile.classList.add('drag-group-target');
    } else {
      // Edge zone → reorder
      dropTgtId = id;
      dropMode  = relX < 0.5 ? 'before' : 'after';
      tile.classList.add(dropMode === 'before' ? 'drop-before' : 'drop-after');
    }
  });

  tile.addEventListener('dragleave', e => {
    if (!tile.contains(e.relatedTarget)) {
      tile.classList.remove('drag-group-target', 'drop-before', 'drop-after');
    }
  });

  tile.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragSrcId || dragSrcId === id) return;

    if (dropMode === 'group') {
      doGroup(dragSrcId, id);
    } else {
      doReorder(dragSrcId, id, dropMode === 'before');
    }
    // dragend will clean up and re-render
  });
}

// Also handle drop on empty grid space → move src to end
document.getElementById('grid').addEventListener('dragover', e => {
  if (!dragSrcId) return;
  if (e.target.closest && e.target.closest('.tile')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
});

document.getElementById('grid').addEventListener('drop', e => {
  if (!dragSrcId) return;
  if (e.target.closest && e.target.closest('.tile')) return;
  e.preventDefault();
  const srcIdx = items.findIndex(i => i.id === dragSrcId);
  if (srcIdx >= 0) {
    const [src] = items.splice(srcIdx, 1);
    items.push(src);
    save();
  }
  // dragend will re-render
});

function doReorder(srcId, tgtId, insertBefore) {
  const srcIdx = items.findIndex(i => i.id === srcId);
  const tgtIdx = items.findIndex(i => i.id === tgtId);
  if (srcIdx < 0 || tgtIdx < 0) return;
  const [src] = items.splice(srcIdx, 1);
  const newTgtIdx = items.findIndex(i => i.id === tgtId);
  items.splice(insertBefore ? newTgtIdx : newTgtIdx + 1, 0, src);
  save();
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

function openGroup(groupId) {
  const group = items.find(i => i.id === groupId);
  if (!group || group.type !== 'group') return;
  openGroupId = groupId;

  document.getElementById('group-title').textContent = group.name;
  const grid = document.getElementById('group-grid');
  grid.innerHTML = '';

  (group.items ?? []).forEach(site => {
    const tile = document.createElement('div');
    tile.className = 'group-site-tile';
    const fav = getFavicon(site.url) ?? '';
    tile.innerHTML = `
      <div class="group-site-icon">
        <img src="${fav}" alt="" draggable="false">
        <div class="group-site-fallback" style="display:none">${(site.name[0]??'?').toUpperCase()}</div>
      </div>
      <span>${escHtml(site.name)}</span>
    `;
    tile.querySelector('img').addEventListener('error', e => {
      e.target.style.display = 'none';
      tile.querySelector('.group-site-fallback').style.display = 'flex';
    });
    tile.addEventListener('click', () => { window.location.href = site.url; });
    tile.addEventListener('contextmenu', e => {
      e.preventDefault();
      showGroupSiteCtx(e, groupId, site.id);
    });
    grid.appendChild(tile);
  });

  document.getElementById('group-overlay').classList.remove('hidden');
}

function closeGroup() {
  document.getElementById('group-overlay').classList.add('hidden');
  openGroupId = null;
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
  menu.innerHTML = `
    <button class="ctx-item" data-action="rename">Rename</button>
    <button class="ctx-item ctx-danger" data-action="delete">Delete</button>
  `;
  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    closeCtxMenu();
    promptRename(id);
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

// ─── Add Site ─────────────────────────────────────────────────────────────────

function openAddModal() {
  document.getElementById('url-input').value = '';
  document.getElementById('name-input').value = '';
  document.getElementById('add-modal').classList.remove('hidden');
  document.getElementById('url-input').focus();
}

function closeAddModal() {
  document.getElementById('add-modal').classList.add('hidden');
}

function addSite() {
  let url  = document.getElementById('url-input').value.trim();
  const name = document.getElementById('name-input').value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const siteName = name || (() => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  })();
  items.push({ id: uid(), type: 'site', name: siteName, url });
  save().then(render);
  closeAddModal();
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await load();
  render();

  // Add button (fixed, bottom-right)
  document.getElementById('add-btn').addEventListener('click', openAddModal);

  // Add modal
  document.getElementById('confirm-add').addEventListener('click', addSite);
  document.getElementById('cancel-add').addEventListener('click', closeAddModal);
  document.getElementById('url-input').addEventListener('keydown', e => {
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
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeCtxMenu(); closeGroup(); closeAddModal(); }
  });
});

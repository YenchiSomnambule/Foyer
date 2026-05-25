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

// ─── State ───────────────────────────────────────────────────────────────────

let items = [];          // flat list: { id, type:'site'|'group', name, url?, items? }
let dragSrcId = null;    // id being dragged
let ctxTargetId = null;  // id for the open context menu
let openGroupId = null;  // group currently expanded

// ─── Storage ─────────────────────────────────────────────────────────────────

async function load() {
  const data = await chrome.storage.local.get('items');
  items = data.items ?? sampleItems();
}

async function save() {
  await chrome.storage.local.set({ items });
}

function sampleItems() {
  return [
    { id: uid(), type: 'site', name: 'Google', url: 'https://www.google.com' },
    { id: uid(), type: 'site', name: 'YouTube', url: 'https://www.youtube.com' },
    { id: uid(), type: 'site', name: 'GitHub', url: 'https://github.com' },
    { id: uid(), type: 'site', name: 'Twitter', url: 'https://twitter.com' },
  ];
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  items.forEach(item => {
    grid.appendChild(item.type === 'group' ? buildGroupTile(item) : buildSiteTile(item));
  });

  // Add (+) button
  const addTile = document.createElement('div');
  addTile.className = 'tile add-tile';
  addTile.innerHTML = `
    <div class="tile-icon">
      <span class="add-icon">+</span>
    </div>
    <span class="tile-name">Add Site</span>
  `;
  addTile.addEventListener('click', openAddModal);
  grid.appendChild(addTile);
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
      <div class="tile-icon-fallback" style="display:none">${(item.name[0] ?? '?').toUpperCase()}</div>
    </div>
    <span class="tile-name">${escHtml(item.name)}</span>
  `;

  const img = tile.querySelector('img');
  img.addEventListener('error', () => {
    img.style.display = 'none';
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

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        <div class="group-site-fallback" style="display:none">${(site.name[0] ?? '?').toUpperCase()}</div>
      </div>
      <span>${escHtml(site.name)}</span>
    `;
    const img = tile.querySelector('img');
    img.addEventListener('error', () => {
      img.style.display = 'none';
      tile.querySelector('.group-site-fallback').style.display = 'flex';
    });
    tile.addEventListener('click', () => { window.location.href = site.url; });

    // Right-click inside group to delete
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
  menu.innerHTML = `
    <button class="ctx-item ctx-danger" data-action="remove-from-group">Remove from group</button>
  `;
  menu.querySelector('[data-action="remove-from-group"]').addEventListener('click', () => {
    removeFromGroup(groupId, siteId);
    closeCtxMenu();
    closeGroup();
    save().then(render);
  });
  positionAndShow(menu, e.clientX, e.clientY);
}

function removeFromGroup(groupId, siteId) {
  const group = items.find(i => i.id === groupId);
  if (!group) return;
  const site = group.items.find(s => s.id === siteId);
  if (!site) return;
  group.items = group.items.filter(s => s.id !== siteId);
  // Put site back on main grid
  items.push({ id: uid(), type: 'site', name: site.name, url: site.url });
  if (group.items.length === 0) {
    items = items.filter(i => i.id !== groupId);
  } else if (group.items.length === 1) {
    // Ungroup
    const remaining = group.items[0];
    items = items.filter(i => i.id !== groupId);
    items.push({ id: uid(), type: 'site', name: remaining.name, url: remaining.url });
  }
}

// ─── Drag & Drop (drop site onto site → group) ────────────────────────────────

function attachDrag(tile, id) {
  tile.addEventListener('dragstart', e => {
    dragSrcId = id;
    tile.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  });

  tile.addEventListener('dragend', () => {
    dragSrcId = null;
    tile.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  tile.addEventListener('dragover', e => {
    if (dragSrcId && dragSrcId !== id) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tile.classList.add('drag-over');
    }
  });

  tile.addEventListener('dragleave', () => tile.classList.remove('drag-over'));

  tile.addEventListener('drop', e => {
    e.preventDefault();
    tile.classList.remove('drag-over');
    if (!dragSrcId || dragSrcId === id) return;
    handleDrop(dragSrcId, id);
  });
}

function handleDrop(srcId, tgtId) {
  const src = items.find(i => i.id === srcId);
  const tgt = items.find(i => i.id === tgtId);
  if (!src || !tgt) return;

  if (tgt.type === 'group') {
    // Add src into group
    if (src.type === 'site') {
      tgt.items = tgt.items ?? [];
      tgt.items.push({ id: uid(), name: src.name, url: src.url });
      items = items.filter(i => i.id !== srcId);
    }
  } else if (src.type === 'site' && tgt.type === 'site') {
    // Create a new group from the two sites
    const newGroup = {
      id: uid(),
      type: 'group',
      name: 'New Group',
      items: [
        { id: uid(), name: src.name, url: src.url },
        { id: uid(), name: tgt.name, url: tgt.url },
      ],
    };
    const tgtIdx = items.findIndex(i => i.id === tgtId);
    items.splice(tgtIdx, 1, newGroup);
    items = items.filter(i => i.id !== srcId);
    // Prompt rename immediately
    promptRenameGroup(newGroup.id);
    save().then(render);
    return;
  } else if (src.type === 'group' && tgt.type === 'site') {
    // Add target site into src group
    src.items = src.items ?? [];
    src.items.push({ id: uid(), name: tgt.name, url: tgt.url });
    items = items.filter(i => i.id !== tgtId);
  }

  save().then(render);
}

function promptRenameGroup(groupId) {
  const group = items.find(i => i.id === groupId);
  if (!group) return;
  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('rename-input');
  input.value = group.name;
  modal.classList.remove('hidden');
  input.focus();
  input.select();

  const doSave = () => {
    const val = input.value.trim();
    if (val) { group.name = val; save().then(render); }
    modal.classList.add('hidden');
    unbind();
  };

  const onKeydown = e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') { modal.classList.add('hidden'); unbind(); } };
  document.getElementById('confirm-rename').onclick = doSave;
  document.getElementById('cancel-rename').onclick = () => { modal.classList.add('hidden'); unbind(); };
  input.addEventListener('keydown', onKeydown);

  function unbind() {
    input.removeEventListener('keydown', onKeydown);
    document.getElementById('confirm-rename').onclick = null;
    document.getElementById('cancel-rename').onclick = null;
  }
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
    promptRenameGroup(id) || promptRenameSite(id);
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
  // Keep menu on screen
  const mw = 180, mh = 90;
  const left = Math.min(x, window.innerWidth - mw - 8);
  const top  = Math.min(y, window.innerHeight - mh - 8);
  menu.style.left = `${left}px`;
  menu.style.top  = `${top}px`;
}

function closeCtxMenu() {
  document.getElementById('context-menu').classList.add('hidden');
  ctxTargetId = null;
}

function promptRenameSite(id) {
  const item = items.find(i => i.id === id);
  if (!item || item.type !== 'site') return false;

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
  return true;
}

// ─── Add Site ─────────────────────────────────────────────────────────────────

function openAddModal() {
  const modal = document.getElementById('add-modal');
  document.getElementById('url-input').value = '';
  document.getElementById('name-input').value = '';
  modal.classList.remove('hidden');
  document.getElementById('url-input').focus();
}

function closeAddModal() {
  document.getElementById('add-modal').classList.add('hidden');
}

function addSite() {
  let url = document.getElementById('url-input').value.trim();
  const name = document.getElementById('name-input').value.trim();

  if (!url) return;

  // Auto-prefix https://
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

  // Add modal
  document.getElementById('confirm-add').addEventListener('click', addSite);
  document.getElementById('cancel-add').addEventListener('click', closeAddModal);
  document.getElementById('url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const nameInput = document.getElementById('name-input');
      if (!nameInput.value.trim()) {
        nameInput.focus();
      } else {
        addSite();
      }
    }
    if (e.key === 'Escape') closeAddModal();
  });
  document.getElementById('name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSite();
    if (e.key === 'Escape') closeAddModal();
  });

  // Close modals on backdrop click
  document.getElementById('add-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAddModal();
  });
  document.getElementById('rename-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('rename-modal').classList.add('hidden');
  });

  // Group overlay
  document.getElementById('close-group').addEventListener('click', closeGroup);
  document.getElementById('group-backdrop').addEventListener('click', closeGroup);

  // Context menu — dismiss on outside click
  document.addEventListener('click', e => {
    if (!document.getElementById('context-menu').contains(e.target)) {
      closeCtxMenu();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeCtxMenu();
      closeGroup();
    }
  });
});

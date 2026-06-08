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
let _bookmarkFavicons = {}; // { url: favIconUrl } — populated at boot from chrome.bookmarks
let ctxTargetId = null;
let openGroupId = null;
let _focusedId     = null;   // keyboard-navigated tile id (main grid)
let _gpFocusedSiteId = null; // keyboard-navigated site id (group overlay)
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

// ─── Undo ─────────────────────────────────────────────────────────────────────

const _undoStack  = [];   // newest at end
const UNDO_LIMIT  = 10;
let _toastTimer   = null;
const _isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

function _snapshotForUndo() {
  _undoStack.push(JSON.parse(JSON.stringify(items)));
  if (_undoStack.length > UNDO_LIMIT) _undoStack.shift();
}

function doUndo() {
  if (!_undoStack.length) return;
  items = _undoStack.pop();
  save();
  render();
  _showToast(_undoStack.length ? `Restored · ${_undoStack.length} more` : 'Restored');
}

function _showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function load() {
  const data = await chrome.storage.local.get('items');
  items = data.items ?? sampleItems();
}

function save() {
  return chrome.storage.local.set({ items });
}

function _loadBookmarkFavicons() {
  chrome.bookmarks.getTree(tree => {
    if (chrome.runtime.lastError) return;
    function walk(nodes) {
      for (const n of nodes) {
        if (n.url && n.favIconUrl &&
            (n.favIconUrl.startsWith('https://') || n.favIconUrl.startsWith('data:'))) {
          _bookmarkFavicons[n.url] = n.favIconUrl;
        }
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
  });
}

function sampleItems() {
  return [
    { id: uid(), type: 'site', name: 'Google',   url: 'https://www.google.com' },
    { id: uid(), type: 'site', name: 'YouTube',  url: 'https://www.youtube.com' },
    { id: uid(), type: 'site', name: 'GitHub',   url: 'https://github.com' },
    { id: uid(), type: 'site', name: 'Twitter',  url: 'https://twitter.com' },
  ];
}

// ─── Weather ──────────────────────────────────────────────────────────────────

const WMO = {
  0:  ['☀️',  'Clear'],
  1:  ['🌤️', 'Mostly clear'],
  2:  ['⛅',  'Partly cloudy'],
  3:  ['☁️',  'Overcast'],
  45: ['🌫️', 'Fog'],
  48: ['🌫️', 'Icy fog'],
  51: ['🌦️', 'Drizzle'],
  53: ['🌦️', 'Drizzle'],
  55: ['🌧️', 'Heavy drizzle'],
  61: ['🌧️', 'Light rain'],
  63: ['🌧️', 'Rain'],
  65: ['🌧️', 'Heavy rain'],
  71: ['❄️',  'Light snow'],
  73: ['❄️',  'Snow'],
  75: ['❄️',  'Heavy snow'],
  77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Showers'],
  81: ['🌧️', 'Rain showers'],
  82: ['🌧️', 'Heavy showers'],
  85: ['🌨️', 'Snow showers'],
  86: ['🌨️', 'Heavy snow showers'],
  95: ['⛈️',  'Thunderstorm'],
  96: ['⛈️',  'Thunderstorm'],
  99: ['⛈️',  'Thunderstorm'],
};

let _weatherData = null;   // { tempC, code, city, country, lat, lon, fetchedAt }
let _weatherUnit = 'C';    // 'C' | 'F'
const _WEATHER_TTL = 30 * 60 * 1000; // 30 min

function _showWeatherWidget(show) {
  document.getElementById('weather-widget').classList.toggle('hidden', !show);
  document.getElementById('weather-sep').classList.toggle('hidden', !show);
}

function _renderWeather() {
  if (!_weatherData) return;
  const { tempC, code, city, country } = _weatherData;
  const [emoji, desc] = WMO[code] ?? ['🌡️', 'Unknown'];
  const temp = _weatherUnit === 'F'
    ? Math.round(tempC * 9 / 5 + 32) + '°F'
    : Math.round(tempC) + '°C';

  document.getElementById('weather-icon').textContent = emoji;
  document.getElementById('weather-temp').textContent = temp;
  const condEl = document.getElementById('weather-condition');
  const dotEl  = document.querySelector('.weather-dot');
  condEl.textContent = desc;
  dotEl.style.display = desc ? '' : 'none';
  document.getElementById('weather-city').textContent = city + (country ? ', ' + country : '');
  _showWeatherWidget(true);
}

function _weatherSetStatus(cityText) {
  document.getElementById('weather-icon').textContent = '⏳';
  document.getElementById('weather-temp').textContent = '--';
  document.getElementById('weather-condition').textContent = '';
  document.querySelector('.weather-dot').style.display = 'none';
  document.getElementById('weather-city').textContent = cityText;
  _showWeatherWidget(true);
}

async function _fetchWeatherRaw(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return { tempC: j.current.temperature_2m, code: j.current.weather_code };
}

async function _reverseGeocode(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) return { city: 'Unknown', country: '' };
    const j = await res.json();
    return {
      city:    j.city || j.locality || j.principalSubdivision || 'Unknown',
      country: j.countryCode || '',
    };
  } catch {
    return { city: 'Unknown', country: '' };
  }
}

async function _applyLocation(lat, lon, city, country) {
  _weatherSetStatus(city);
  try {
    const w = await _fetchWeatherRaw(lat, lon);
    _weatherData = { tempC: w.tempC, code: w.code, city, country, lat, lon, fetchedAt: Date.now() };
    chrome.storage.local.set({
      weatherLocation: { lat, lon, city, country },
      weatherCache: _weatherData,
    });
    _renderWeather();
  } catch {
    document.getElementById('weather-city').textContent = 'Unavailable';
  }
}

async function _loadWeather() {
  const stored = await new Promise(r => chrome.storage.local.get(
    ['weatherLocation', 'weatherCache', 'weatherUnit'], r));

  if (stored.weatherUnit) _weatherUnit = stored.weatherUnit;

  // Use cache if still fresh
  if (stored.weatherCache) {
    const c = stored.weatherCache;
    if (Date.now() - c.fetchedAt < _WEATHER_TTL) {
      _weatherData = c;
      _renderWeather();
      return;
    }
  }

  // Refresh from stored location
  if (stored.weatherLocation) {
    const { lat, lon, city, country } = stored.weatherLocation;
    await _applyLocation(lat, lon, city, country);
    return;
  }

  // No location — try geolocation silently
  if (!navigator.geolocation) return;
  _weatherSetStatus('Detecting…');
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const geo = await _reverseGeocode(lat, lon);
      await _applyLocation(lat, lon, geo.city, geo.country);
    },
    () => {
      // Permission denied — show "Set location" prompt
      document.getElementById('weather-icon').textContent = '📍';
      document.getElementById('weather-temp').textContent = '--';
      document.getElementById('weather-condition').textContent = '';
      document.querySelector('.weather-dot').style.display = 'none';
      document.getElementById('weather-city').textContent = 'Set location';
      _showWeatherWidget(true);
    },
    { timeout: 8000 }
  );
}

// ─── Location search ──────────────────────────────────────────────────────────

function openLocationModal() {
  document.getElementById('location-modal').classList.remove('hidden');
  document.getElementById('location-results').innerHTML = '';
  const inp = document.getElementById('location-input');
  inp.value = '';
  setTimeout(() => inp.focus(), 60);
}

function closeLocationModal() {
  document.getElementById('location-modal').classList.add('hidden');
  clearTimeout(_locationSearchTimer);
}

let _locationSearchTimer = null;

async function _doLocationSearch(query) {
  const resultsEl = document.getElementById('location-results');
  if (!query.trim()) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<div class="loc-status">Searching…</div>';
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=7&language=en&format=json`;
    const res = await fetch(url);
    const j = await res.json();
    const list = j.results ?? [];
    if (!list.length) {
      resultsEl.innerHTML = '<div class="loc-status">No results</div>';
      return;
    }
    resultsEl.innerHTML = list.map((r, i) =>
      `<button class="loc-result" data-idx="${i}">
        <span class="loc-name">${escHtml(r.name)}${r.admin1 ? ', ' + escHtml(r.admin1) : ''}</span>
        <span class="loc-country">${escHtml(r.country_code ?? '')}</span>
       </button>`
    ).join('');
    list.forEach((r, i) => {
      resultsEl.querySelector(`[data-idx="${i}"]`).addEventListener('click', () => {
        closeLocationModal();
        _applyLocation(r.latitude, r.longitude, r.name, r.country_code ?? '');
      });
    });
  } catch {
    resultsEl.innerHTML = '<div class="loc-status">Search failed</div>';
  }
}

// ─── Keyboard Navigation ──────────────────────────────────────────────────────

function _getGridCols() {
  const tpl = getComputedStyle(document.getElementById('grid')).gridTemplateColumns;
  return tpl === 'none' ? 1 : tpl.trim().split(/\s+/).length;
}

function _focusTile(id) {
  document.querySelectorAll('.tile.kb-focus').forEach(t => t.classList.remove('kb-focus'));
  _focusedId = id;
  if (!id) return;
  const el = document.querySelector(`#grid [data-id="${id}"]`);
  if (el) {
    el.classList.add('kb-focus');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function _navGrid(key) {
  const tileEls = [...document.querySelectorAll('#grid .tile')];
  if (!tileEls.length) return;

  if (!_focusedId || !tileEls.some(t => t.dataset.id === _focusedId)) {
    _focusTile(tileEls[0].dataset.id);
    return;
  }

  const idx  = tileEls.findIndex(t => t.dataset.id === _focusedId);
  const cols = _getGridCols();
  const len  = tileEls.length;

  let next = idx;
  if (key === 'ArrowRight') next = Math.min(idx + 1, len - 1);
  if (key === 'ArrowLeft')  next = Math.max(idx - 1, 0);
  if (key === 'ArrowDown')  next = Math.min(idx + cols, len - 1);
  if (key === 'ArrowUp')    next = Math.max(idx - cols, 0);

  if (next !== idx) _focusTile(tileEls[next].dataset.id);
}

function _focusGroupTile(siteId) {
  document.querySelectorAll('.group-site-tile.kb-focus').forEach(t => t.classList.remove('kb-focus'));
  _gpFocusedSiteId = siteId;
  if (!siteId) return;
  const el = document.querySelector(`.group-site-tile[data-site-id="${siteId}"]`);
  if (el) el.classList.add('kb-focus');
}

function _navGroupGrid(key) {
  const GP_COLS = 3;
  const pages = document.querySelectorAll('#group-pages-track .group-page');
  if (!pages.length) return;
  const curPage = pages[groupCurrentPage];
  if (!curPage) return;
  const tiles = [...curPage.querySelectorAll('.group-site-tile')];
  if (!tiles.length) return;

  if (!_gpFocusedSiteId || !tiles.some(t => t.dataset.siteId === _gpFocusedSiteId)) {
    _focusGroupTile(tiles[0].dataset.siteId);
    return;
  }

  const idx = tiles.findIndex(t => t.dataset.siteId === _gpFocusedSiteId);
  const len = tiles.length;

  if (key === 'ArrowRight') {
    if (idx < len - 1) {
      _focusGroupTile(tiles[idx + 1].dataset.siteId);
    } else if (groupCurrentPage < groupTotalPages - 1) {
      goToGroupPage(groupCurrentPage + 1);
      const np = pages[groupCurrentPage];
      const nt = [...np.querySelectorAll('.group-site-tile')];
      if (nt.length) _focusGroupTile(nt[0].dataset.siteId);
    }
    return;
  }
  if (key === 'ArrowLeft') {
    if (idx > 0) {
      _focusGroupTile(tiles[idx - 1].dataset.siteId);
    } else if (groupCurrentPage > 0) {
      goToGroupPage(groupCurrentPage - 1);
      const pp = pages[groupCurrentPage];
      const pt = [...pp.querySelectorAll('.group-site-tile')];
      if (pt.length) _focusGroupTile(pt[pt.length - 1].dataset.siteId);
    }
    return;
  }
  if (key === 'ArrowDown') {
    if (idx + GP_COLS < len) {
      _focusGroupTile(tiles[idx + GP_COLS].dataset.siteId);
    } else if (groupCurrentPage < groupTotalPages - 1) {
      goToGroupPage(groupCurrentPage + 1);
      const np = pages[groupCurrentPage];
      const nt = [...np.querySelectorAll('.group-site-tile')];
      if (nt.length) _focusGroupTile(nt[Math.min(idx % GP_COLS, nt.length - 1)].dataset.siteId);
    }
    return;
  }
  if (key === 'ArrowUp') {
    if (idx - GP_COLS >= 0) {
      _focusGroupTile(tiles[idx - GP_COLS].dataset.siteId);
    } else if (groupCurrentPage > 0) {
      goToGroupPage(groupCurrentPage - 1);
      const pp = pages[groupCurrentPage];
      const pt = [...pp.querySelectorAll('.group-site-tile')];
      if (pt.length) {
        const col = idx % GP_COLS;
        const lastRowStart = Math.floor((pt.length - 1) / GP_COLS) * GP_COLS;
        _focusGroupTile(pt[Math.min(lastRowStart + col, pt.length - 1)].dataset.siteId);
      }
    }
    return;
  }
}

// ─── Settings Modal & Shortcuts ───────────────────────────────────────────────

let _shortcuts    = { addTile: 'n', search: '/' };
let _scListening  = null; // { el, action, oldKey }
let _modalDark    = false;

function openSettingsModal(tab) {
  document.getElementById('settings-modal').classList.remove('hidden');
  document.getElementById('theme-swatches').classList.add('hidden');
  _switchSettingsTab(tab || 'general');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
  if (_scListening) _cancelShortcutListen();
}

function _switchSettingsTab(pane) {
  document.querySelectorAll('.stab').forEach(t => t.classList.toggle('active', t.dataset.pane === pane));
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.toggle('hidden', p.id !== `spane-${pane}`));
}

function _startShortcutListen(el, action) {
  if (_scListening) _cancelShortcutListen();
  _scListening = { el, action, oldKey: _shortcuts[action] };
  el.textContent = '…';
  el.classList.add('listening');
  document.getElementById('sc-conflict-msg').textContent = '';
}

function _cancelShortcutListen() {
  if (!_scListening) return;
  _scListening.el.textContent = _scListening.oldKey;
  _scListening.el.classList.remove('listening');
  _scListening = null;
  document.getElementById('sc-conflict-msg').textContent = '';
}

function _updateShortcutDisplay() {
  document.querySelectorAll('.sc-key[data-action]').forEach(el => {
    if (_shortcuts[el.dataset.action]) el.textContent = _shortcuts[el.dataset.action];
  });
}

function applyModalDark(dark) {
  _modalDark = dark;
  document.body.classList.toggle('modal-dark', dark);
  document.querySelectorAll('.modal-style-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === (dark ? 'modal-style-dark' : 'modal-style-light'));
  });
  const slider = document.getElementById('tile-size-slider');
  if (slider) _updateSliderFill(slider);
}

async function loadModalDark() {
  const r = await chrome.storage.local.get('modalDark');
  applyModalDark(!!r.modalDark);
}

async function loadShortcuts() {
  const r = await chrome.storage.local.get('shortcuts');
  if (r.shortcuts?.addTile) _shortcuts.addTile = r.shortcuts.addTile;
  if (r.shortcuts?.search)  _shortcuts.search  = r.shortcuts.search;
  _updateShortcutDisplay();
}

// ─── Tile Size ────────────────────────────────────────────────────────────────

const TILE_SIZES = {
  xs: { tile: 72,  icon: 48, radius: 12 },
  s:  { tile: 80,  icon: 54, radius: 14 },
  m:  { tile: 88,  icon: 60, radius: 16 },
  l:  { tile: 104, icon: 72, radius: 18 },
  xl: { tile: 120, icon: 84, radius: 20 },
};
const SIZE_KEYS = ['xs', 's', 'm', 'l', 'xl'];

function _engineUrl(q) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

let _currentTileSize = 'm';

function _syncSizeSlider(key) {
  const slider = document.getElementById('tile-size-slider');
  if (!slider) return;
  const idx = SIZE_KEYS.indexOf(key);
  slider.value = idx < 0 ? 3 : idx + 1;
  _updateSliderFill(slider);
}

function _updateSliderFill(slider) {
  const pct = (slider.value - 1) / (slider.max - 1) * 100;
  const filled   = 'rgba(60,120,240,0.75)';
  const unfilled = document.body.classList.contains('modal-dark')
    ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.13)';
  slider.style.background =
    `linear-gradient(to right, ${filled} ${pct}%, ${unfilled} ${pct}%)`;
}

function applyTileSize(key) {
  const sz = TILE_SIZES[key] ?? TILE_SIZES.m;
  const root = document.documentElement;
  root.style.setProperty('--tile-size',      `${sz.tile}px`);
  root.style.setProperty('--tile-icon-size', `${sz.icon}px`);
  root.style.setProperty('--radius',         `${sz.radius}px`);
  _currentTileSize = key;
  _syncSizeSlider(key);
}

function saveTileSize(key) {
  chrome.storage.local.set({ tileSize: key });
}

async function loadTileSize() {
  const r = await chrome.storage.local.get('tileSize');
  const key = r.tileSize && TILE_SIZES[r.tileSize] ? r.tileSize : 'm';
  applyTileSize(key);
}

// ─── Marquee Selection ───────────────────────────────────────────────────────

const _selectedIds = new Set();

function _clearSel() {
  _selectedIds.clear();
  document.querySelectorAll('#grid .tile.sel').forEach(t => t.classList.remove('sel'));
}

function _updateTileSel(x1, y1, x2, y2) {
  _selectedIds.clear();
  document.querySelectorAll('#grid .tile').forEach(tile => {
    const r = tile.getBoundingClientRect();
    const hit = r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1;
    tile.classList.toggle('sel', hit);
    if (hit) _selectedIds.add(tile.dataset.id);
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
  _clearSel();
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  items.forEach(item => {
    grid.appendChild(item.type === 'group' ? buildGroupTile(item) : buildSiteTile(item));
  });
  // Restore focus ring — clear stale id if the tile no longer exists
  if (_focusedId) {
    const el = grid.querySelector(`[data-id="${_focusedId}"]`);
    if (el) el.classList.add('kb-focus');
    else _focusedId = null;
  }
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

  // Stored favicon → bookmark bar favicon (exact match) → external chain
  const sources = [
    ...(item.favicon ? [item.favicon] : []),
    ...(_bookmarkFavicons[item.url] ? [_bookmarkFavicons[item.url]] : []),
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
    _focusTile(item.id);
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

  const allSites  = item.items ?? [];
  const coverSite = item.cover ? allSites.find(s => s.id === item.cover) : null;

  if (coverSite) {
    // Cover mode: full-size favicon with a count badge
    const letter = (coverSite.name[0] ?? '?').toUpperCase();
    const bg     = tileGradient(coverSite.url);
    tile.innerHTML = `
      <div class="tile-icon group-cover-icon">
        <img alt="" draggable="false" style="display:none">
        <div class="tile-icon-fallback" style="display:flex;background:${bg}">${letter}</div>
        <span class="group-cover-badge">${allSites.length}</span>
      </div>
      <span class="tile-name">${escHtml(item.name)}</span>
    `;
    const img      = tile.querySelector('img');
    const fallback = tile.querySelector('.tile-icon-fallback');
    const sources  = [
      ...(coverSite.favicon ? [coverSite.favicon] : []),
      ...getFaviconSources(coverSite.url),
    ].filter((v, i, a) => a.indexOf(v) === i);
    tryFaviconChain(img, fallback, sources);

  } else {
    // Default 9-grid mode
    const sites = allSites.slice(0, 9);
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
  }

  tile.addEventListener('click', e => {
    if (e.defaultPrevented || _suppressClick) return;
    _focusTile(item.id);
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
    position: 'fixed', left: '0', top: '0',
    width: rect.width + 'px', height: rect.height + 'px',
    pointerEvents: 'none', zIndex: '1000',
    opacity: '0.92',
    transform: `translate(${rect.left}px,${rect.top}px) scale(1.08)`,
    transformOrigin: 'center center',
    filter: 'drop-shadow(0 18px 38px rgba(0,0,0,0.5))',
    willChange: 'transform',
  });
  document.body.appendChild(pdClone);
  el.style.opacity = '0';
}

function _moveDrag(cx, cy) {
  if (!pdClone) return;
  // GPU-composited movement — no layout triggered
  pdClone.style.transition = 'none';
  pdClone.style.transform  = `translate(${cx - pdOffX}px,${cy - pdOffY}px) scale(1.08)`;

  // Proportional auto-scroll — speed ramps up as cursor approaches edge
  const app = document.getElementById('app');
  const ZONE = 80, MAX_SPEED = 16;
  if      (cy < ZONE)                         app.scrollTop -= Math.ceil(MAX_SPEED * (1 - cy / ZONE));
  else if (cy > window.innerHeight - ZONE)    app.scrollTop += Math.ceil(MAX_SPEED * ((cy - (window.innerHeight - ZONE)) / ZONE));

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
        { transform: 'translate(0,0)' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)', fill: 'none' }
    );
  });
}

function _commitDrag() {
  const srcEl   = pdSrcEl;
  const clone   = pdClone;
  const dropTgt = pdDropTgt;
  const dropMode= pdDropMode;
  const srcId   = pdSrcId;

  pdClone = null; pdSrcEl = null;
  pdDropTgt = null; pdDropMode = null; pdActive = false; pdSrcId = null;

  // Drop animation: fade clone out while revealing the source tile
  if (clone) {
    clone.style.transition = 'opacity 0.16s, transform 0.16s cubic-bezier(0.25,0.46,0.45,0.94)';
    clone.style.opacity    = '0';
    clone.style.transform  = clone.style.transform.replace('scale(1.08)', 'scale(1)');
    setTimeout(() => clone.remove(), 160);
  }
  // Reveal source tile simultaneously (clone fades out on top of it)
  if (srcEl) srcEl.style.opacity = '';

  // Only remove group-highlight decoration; let in-flight FLIP animations complete naturally
  document.querySelectorAll('.drag-group-target').forEach(el => el.classList.remove('drag-group-target'));

  _suppressClick = true;
  requestAnimationFrame(() => { _suppressClick = false; });

  if (dropMode === 'group' && dropTgt) {
    // Group merge: need a full re-render since tile types change
    doGroup(srcId, dropTgt);
    render();
  } else {
    // Reorder: DOM already reflects the final order from live preview
    // Sync items[] from DOM without rebuilding — eliminates the rebuild flash
    const grid = document.getElementById('grid');
    const domOrder = [...grid.querySelectorAll('.tile')].map(t => t.dataset.id);
    items = domOrder.map(did => items.find(i => i.id === did)).filter(Boolean);
    save();
  }
}

// Returns true if the group was dissolved (removed or replaced), false if it survives.
function _dissolveGroupIfNeeded(groupId) {
  const group = items.find(i => i.id === groupId);
  if (!group || group.items.length > 1) return false;
  if (group.items.length === 1) {
    const rem = group.items[0];
    items = items.filter(i => i.id !== groupId);
    items.push({ id: uid(), type: 'site', name: rem.name, url: rem.url, favicon: rem.favicon });
  } else {
    items = items.filter(i => i.id !== groupId);
  }
  return true;
}

function _newGroupName() {
  const names = new Set(items.filter(i => i.type === 'group').map(i => i.name));
  if (!names.has('New Group')) return 'New Group';
  let n = 1;
  while (names.has(`New Group (${n})`)) n++;
  return `New Group (${n})`;
}

function doGroup(srcId, tgtId) {
  const src = items.find(i => i.id === srcId);
  const tgt = items.find(i => i.id === tgtId);
  if (!src || !tgt) return;

  _snapshotForUndo();

  if (tgt.type === 'group') {
    // Add src into existing group
    if (src.type === 'site') {
      tgt.items = tgt.items ?? [];
      tgt.items.push({ id: uid(), name: src.name, url: src.url });
      items = items.filter(i => i.id !== srcId);
    }
    save();
    _showToast(`Added to group · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
  } else if (src.type === 'site' && tgt.type === 'site') {
    // Create a new group from two sites
    const newGroup = {
      id: uid(), type: 'group', name: _newGroupName(),
      items: [
        { id: uid(), name: src.name, url: src.url },
        { id: uid(), name: tgt.name, url: tgt.url },
      ],
    };
    const tgtIdx = items.findIndex(i => i.id === tgtId);
    items.splice(tgtIdx, 1, newGroup);
    items = items.filter(i => i.id !== srcId);
    save();
    _showToast(`Grouped · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
  } else if (src.type === 'group' && tgt.type === 'site') {
    src.items = src.items ?? [];
    src.items.push({ id: uid(), name: tgt.name, url: tgt.url });
    items = items.filter(i => i.id !== tgtId);
    save();
    _showToast(`Added to group · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
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
    if (!e.defaultPrevented && !_gpSuppressClick) {
      _focusGroupTile(site.id);
      window.location.href = site.url;
    }
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

        _dissolveGroupIfNeeded(groupId);
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
  _gpFocusedSiteId = null;

  const titleEl = document.getElementById('group-title');
  titleEl.textContent = group.name;
  titleEl.ondblclick = () => promptRename(groupId);

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
  _updateGroupHints();
}

function closeGroup() {
  document.getElementById('group-overlay').classList.add('hidden');
  if (cleanupGroupDrag) { cleanupGroupDrag(); cleanupGroupDrag = null; }
  openGroupId = null;
  groupCurrentPage = 0;
  _gpFocusedSiteId = null;
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
  _updateGroupHints();
}

function _updateGroupHints() {
  const prev = document.getElementById('group-hint-prev');
  const next = document.getElementById('group-hint-next');
  if (!prev || !next) return;
  prev.classList.toggle('disabled', groupCurrentPage <= 0);
  next.classList.toggle('disabled', groupCurrentPage >= groupTotalPages - 1);
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
    _updateGroupHints();
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
  const group = items.find(i => i.id === groupId);
  if (!group) return;
  const isCover = group.cover === siteId;
  const menu = document.getElementById('context-menu');
  menu.innerHTML = `
    <button class="ctx-item" data-action="cover">${isCover ? 'Remove cover' : 'Set as cover'}</button>
    <button class="ctx-item ctx-danger" data-action="delete">Delete</button>
  `;
  menu.querySelector('[data-action="cover"]').addEventListener('click', () => {
    if (isCover) delete group.cover; else group.cover = siteId;
    save().then(render);
    closeCtxMenu();
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    _snapshotForUndo();
    if (group.cover === siteId) delete group.cover;
    group.items = group.items.filter(s => s.id !== siteId);
    _dissolveGroupIfNeeded(groupId);
    save();
    render();
    closeCtxMenu();
    closeGroup();
    _showToast(`Deleted · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
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

function _groupSelectedTiles(anchorId) {
  _snapshotForUndo();
  const selected = items.filter(i => _selectedIds.has(i.id));

  // Build flat list of site entries from selected tiles (flatten any nested groups)
  const groupItems = [];
  selected.forEach(item => {
    if (item.type === 'site') {
      groupItems.push({ id: uid(), name: item.name, url: item.url, favicon: item.favicon });
    } else if (item.type === 'group') {
      (item.items ?? []).forEach(s =>
        groupItems.push({ id: uid(), name: s.name, url: s.url, favicon: s.favicon })
      );
    }
  });

  // Determine insert position: where the anchor tile sits, accounting for removals
  const anchorOrigIdx = items.findIndex(i => i.id === anchorId);
  let insertIdx = 0;
  for (let i = 0; i < anchorOrigIdx; i++) {
    if (!_selectedIds.has(items[i].id)) insertIdx++;
  }

  const newGroup = { id: uid(), type: 'group', name: _newGroupName(), items: groupItems };
  items = items.filter(i => !_selectedIds.has(i.id));
  items.splice(insertIdx, 0, newGroup);

  _clearSel();
  closeCtxMenu();
  save().then(render);
  _showToast(`Grouped ${selected.length} tiles · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
}

function showCtxMenu(x, y, id) {
  const menu = document.getElementById('context-menu');

  // Multi-select actions: right-clicked tile is part of a multi-tile selection
  if (_selectedIds.size > 1 && _selectedIds.has(id)) {
    const count = _selectedIds.size;
    menu.innerHTML = `
      <button class="ctx-item" data-action="group-sel">Group ${count} tiles</button>
      <button class="ctx-item ctx-danger" data-action="delete-sel">Delete ${count} tiles</button>
    `;
    menu.querySelector('[data-action="group-sel"]').addEventListener('click', () => {
      _groupSelectedTiles(id);
    });
    menu.querySelector('[data-action="delete-sel"]').addEventListener('click', () => {
      _snapshotForUndo();
      items = items.filter(i => !_selectedIds.has(i.id));
      _clearSel();
      save().then(render);
      closeCtxMenu();
      _showToast(`${count} deleted · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
    });
    positionAndShow(menu, x, y);
    return;
  }

  const item = items.find(i => i.id === id);
  if (!item) return;
  const editBtn = item.type === 'site'
    ? `<button class="ctx-item" data-action="edit">Edit</button>` : '';
  const refreshIconBtn = item.type === 'site'
    ? `<button class="ctx-item" data-action="refresh-icon">Refresh icon</button>` : '';
  const removeCoverBtn = (item.type === 'group' && item.cover)
    ? `<button class="ctx-item" data-action="remove-cover">Remove cover</button>` : '';
  menu.innerHTML = `
    <button class="ctx-item" data-action="rename">Rename</button>
    ${editBtn}
    ${refreshIconBtn}
    ${removeCoverBtn}
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
  menu.querySelector('[data-action="refresh-icon"]')?.addEventListener('click', () => {
    // Use bookmark bar favicon if Chrome has one for this exact URL; otherwise re-run chain
    const bkmk = _bookmarkFavicons[item.url];
    if (bkmk) {
      item.favicon = bkmk;
    } else {
      delete item.favicon;
    }
    save().then(render);
    closeCtxMenu();
  });
  menu.querySelector('[data-action="remove-cover"]')?.addEventListener('click', () => {
    delete item.cover;
    save().then(render);
    closeCtxMenu();
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    _snapshotForUndo();
    items = items.filter(i => i.id !== id);
    save().then(render);
    closeCtxMenu();
    _showToast(`Deleted · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
  });
  positionAndShow(menu, x, y);
}

function positionAndShow(menu, x, y) {
  menu.classList.remove('hidden');
  const mw = 180, mh = menu.offsetHeight || 96;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth  - mw - 8))}px`;
  menu.style.top  = `${Math.max(8, Math.min(y, window.innerHeight - mh - 8))}px`;
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
    if (val) {
      item.name = val;
      save().then(render);
      // Also refresh the overlay title if this group is currently open
      if (openGroupId === id) document.getElementById('group-title').textContent = val;
    }
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
      render();
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
  document.querySelectorAll('.swatch-custom').forEach(s => s.style.removeProperty('background'));
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
  document.querySelectorAll('.swatch-custom').forEach(s => {
    s.classList.add('active');
    s.style.background = hex;
  });
}

function saveCustomColor(hex) {
  chrome.storage.local.set({ theme: 'custom', customColor: hex });
}

function saveTheme(theme) {
  chrome.storage.local.set({ theme });
}

async function loadTheme() {
  const r = await chrome.storage.local.get(['theme', 'customColor', 'bgImage', 'bgPosX', 'bgPosY', 'bgZoom']);
  if (r.theme === 'custom' && r.customColor) {
    applyCustomColor(r.customColor);
    const inp = document.getElementById('custom-color-input');
    if (inp) inp.value = r.customColor;
  } else if (r.theme === 'image' && r.bgImage) {
    applyBgImage(r.bgImage, r.bgPosX ?? 50, r.bgPosY ?? 50, r.bgZoom ?? 100);
  } else {
    const theme = (r.theme && THEMES.includes(r.theme)) ? r.theme : 'cream';
    applyTheme(theme);
  }
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
  document.querySelectorAll('.swatch-image').forEach(btn => {
    btn.style.removeProperty('background-image');
    btn.style.removeProperty('background-size');
    btn.style.removeProperty('background-position');
  });
}

let _bgDataUrl = null;
let _bgPosX    = 50;  // 0–100 %
let _bgPosY    = 50;  // 0–100 %
let _bgZoom    = 100; // 100–300 %

function applyBgImage(dataUrl, posX = _bgPosX, posY = _bgPosY, zoom = _bgZoom) {
  _bgDataUrl = dataUrl;
  _bgPosX = posX; _bgPosY = posY; _bgZoom = zoom;
  const size = zoom <= 100 ? 'cover' : `${zoom}%`;
  document.body.style.background = `url("${dataUrl}") ${posX.toFixed(1)}% ${posY.toFixed(1)}% / ${size} no-repeat`;
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
  document.querySelectorAll('.swatch-image').forEach(btn => {
    btn.classList.add('active');
    btn.style.backgroundImage    = `url("${dataUrl}")`;
    btn.style.backgroundSize     = 'cover';
    btn.style.backgroundPosition = 'center';
  });
}

function saveBgImage(dataUrl, posX, posY, zoom) {
  chrome.storage.local.set({ theme: 'image', bgImage: dataUrl, bgPosX: posX, bgPosY: posY, bgZoom: zoom });
}

// ─── Background Adjust Modal ─────────────────────────────────────────────────

let _bgAdjPrevDataUrl = null, _bgAdjPrevPosX = 50, _bgAdjPrevPosY = 50, _bgAdjPrevZoom = 100;
let _bgAdjDragging = false, _bgAdjDragStartX = 0, _bgAdjDragStartY = 0;
let _bgAdjTmpPosX = 50, _bgAdjTmpPosY = 50, _bgAdjTmpZoom = 100;

function _bgPreviewUpdate() {
  const p = document.getElementById('bg-adjust-preview');
  if (!p) return;
  const size = _bgAdjTmpZoom <= 100 ? 'cover' : `${_bgAdjTmpZoom}%`;
  p.style.backgroundSize     = size;
  p.style.backgroundPosition = `${_bgAdjTmpPosX.toFixed(1)}% ${_bgAdjTmpPosY.toFixed(1)}%`;
  const slider = document.getElementById('bg-zoom-slider');
  if (slider) slider.value = _bgAdjTmpZoom;
  const val = document.getElementById('bg-zoom-val');
  if (val) val.textContent = (_bgAdjTmpZoom / 100).toFixed(1) + '×';
}

function openBgAdjust(dataUrl) {
  // Save state for cancel
  _bgAdjPrevDataUrl = _bgDataUrl;
  _bgAdjPrevPosX   = _bgPosX;
  _bgAdjPrevPosY   = _bgPosY;
  _bgAdjPrevZoom   = _bgZoom;
  // Working copy
  _bgAdjTmpPosX = _bgPosX;
  _bgAdjTmpPosY = _bgPosY;
  _bgAdjTmpZoom = _bgZoom;
  // Set preview image
  const p = document.getElementById('bg-adjust-preview');
  p.style.backgroundImage = `url("${dataUrl}")`;
  _bgDataUrl = dataUrl;
  _bgPreviewUpdate();
  document.getElementById('bg-adjust-modal').classList.remove('hidden');
}

function closeBgAdjust() {
  document.getElementById('bg-adjust-modal').classList.add('hidden');
  _bgAdjDragging = false;
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

// ─── Import Bookmarks ─────────────────────────────────────────────────────────

function _existingUrls() {
  const s = new Set();
  for (const item of items) {
    if (item.type === 'site') s.add(item.url);
    else if (item.type === 'group') (item.items ?? []).forEach(c => s.add(c.url));
  }
  return s;
}

function _collectBmNodes(nodes, out, existingUrls) {
  for (const node of nodes) {
    if (node.url) {
      if (!/^https?:\/\//i.test(node.url)) continue;
      let hostname = node.url;
      try { hostname = new URL(node.url).hostname.replace(/^www\./, ''); } catch {}
      out.push({ id: node.id, name: node.title || hostname, url: node.url, hostname, exists: existingUrls.has(node.url) });
    } else if (node.children) {
      _collectBmNodes(node.children, out, existingUrls); // flatten nested sub-folders
    }
  }
}

async function openImportModal() {
  const modal = document.getElementById('import-modal');
  const list  = document.getElementById('import-list');
  const btn   = document.getElementById('confirm-import');

  modal.classList.remove('hidden');
  list.innerHTML = '<div class="bm-loading">Loading…</div>';
  btn.disabled = true;
  btn.textContent = 'Import';
  document.getElementById('import-sel-count').textContent = '0 selected';

  if (!chrome?.bookmarks) {
    list.innerHTML = `<div class="bm-empty" id="bm-no-access">
      書籤 API 不可用。<br>
      <button id="bm-reload-ext">重新載入擴充功能</button>
    </div>`;
    document.getElementById('bm-reload-ext').addEventListener('click', () => {
      chrome?.runtime?.reload?.();
    });
    return;
  }

  try {
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];
    const existing = _existingUrls();
    const sections = [];

    for (const chromeFolder of (root.children ?? [])) {
      if (!chromeFolder.children) continue;
      const folders = [];
      const loose   = [];

      for (const child of chromeFolder.children) {
        if (child.url) {
          if (/^https?:\/\//i.test(child.url)) {
            let hostname = child.url;
            try { hostname = new URL(child.url).hostname.replace(/^www\./, ''); } catch {}
            loose.push({ id: child.id, name: child.title || hostname, url: child.url, hostname, exists: existing.has(child.url) });
          }
        } else if (child.children) {
          const bookmarks = [];
          _collectBmNodes(child.children, bookmarks, existing);
          if (bookmarks.length > 0) folders.push({ id: child.id, name: child.title || 'Folder', bookmarks });
        }
      }

      if (folders.length > 0 || loose.length > 0)
        sections.push({ name: (chromeFolder.title || 'Bookmarks').toUpperCase(), folders, loose });
    }

    _renderImportList(sections);
  } catch {
    list.innerHTML = '<div class="bm-empty">Could not read bookmarks.</div>';
  }
}

function _bmItemHtml(bm) {
  const grad   = tileGradient(bm.url);
  const letter = (bm.name[0] ?? '?').toUpperCase();
  return `<label class="bm-item${bm.exists ? ' bm-exists' : ''}">
    <input type="checkbox" class="bm-check" data-url="${escHtml(bm.url)}" data-name="${escHtml(bm.name)}" ${bm.exists ? 'disabled' : 'checked'}>
    <div class="bm-icon" style="background:${grad}">${letter}</div>
    <div class="bm-text">
      <span class="bm-name">${escHtml(bm.name)}</span>
      <span class="bm-url">${escHtml(bm.hostname)}</span>
    </div>
    ${bm.exists ? '<span class="bm-exists-badge">Added</span>' : ''}
  </label>`;
}

function _renderImportList(sections) {
  const list = document.getElementById('import-list');

  if (!sections.length) {
    list.innerHTML = '<div class="bm-empty">No bookmarks found.</div>';
    return;
  }

  let html = '';
  for (const sec of sections) {
    html += `<div class="bm-section">${escHtml(sec.name)}</div>`;

    for (const folder of sec.folders) {
      const allExists = folder.bookmarks.every(b => b.exists);
      html += `<div class="bm-folder-group" data-folder-id="${escHtml(folder.id)}" data-folder-name="${escHtml(folder.name)}">
        <div class="bm-folder-header">
          <input type="checkbox" class="bm-folder-check" ${allExists ? 'disabled' : 'checked'}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" class="bm-folder-icon">
            <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
          </svg>
          <span class="bm-folder-label">${escHtml(folder.name)}</span>
          <span class="bm-group-badge">→ Group</span>
        </div>
        <div class="bm-folder-items">${folder.bookmarks.map(_bmItemHtml).join('')}</div>
      </div>`;
    }

    for (const bm of sec.loose) {
      html += _bmItemHtml(bm);
    }
  }

  list.innerHTML = html;

  // Wire folder checkbox ↔ item checkboxes
  list.querySelectorAll('.bm-folder-group').forEach(fg => {
    const fc         = fg.querySelector('.bm-folder-check');
    const itemChecks = [...fg.querySelectorAll('.bm-check:not(:disabled)')];
    if (!fc || fc.disabled || !itemChecks.length) return;

    fc.addEventListener('change', () => {
      itemChecks.forEach(cb => { cb.checked = fc.checked; });
      _updateImportCount();
    });

    const sync = () => {
      const n = itemChecks.filter(c => c.checked).length;
      fc.indeterminate = n > 0 && n < itemChecks.length;
      fc.checked       = n === itemChecks.length;
      _updateImportCount();
    };
    itemChecks.forEach(cb => cb.addEventListener('change', sync));
  });

  list.querySelectorAll('.bm-item:not(.bm-folder-group .bm-item) .bm-check').forEach(cb =>
    cb.addEventListener('change', _updateImportCount)
  );

  _updateImportCount();
}

function _updateImportCount() {
  const n   = document.querySelectorAll('.bm-check:checked').length;
  const btn = document.getElementById('confirm-import');
  document.getElementById('import-sel-count').textContent = `${n} selected`;
  btn.disabled   = n === 0;
  btn.textContent = n > 0 ? `Import ${n} site${n > 1 ? 's' : ''}` : 'Import';
}

function _bmSelectAll(checked) {
  document.querySelectorAll('.bm-check:not(:disabled)').forEach(cb => { cb.checked = checked; });
  document.querySelectorAll('.bm-folder-check:not(:disabled)').forEach(fc => {
    fc.checked = checked; fc.indeterminate = false;
  });
  _updateImportCount();
}

function doImportBookmarks() {
  const newItems = [];
  let siteCount = 0, groupCount = 0;

  // Folders → Groups (or single site if only 1 item checked)
  document.querySelectorAll('.bm-folder-group').forEach(fg => {
    const checked = [...fg.querySelectorAll('.bm-check:checked:not(:disabled)')];
    if (!checked.length) return;
    if (checked.length === 1) {
      const cb = checked[0];
      newItems.push({ id: uid(), type: 'site', name: cb.dataset.name, url: cb.dataset.url });
      siteCount++;
    } else {
      newItems.push({
        id: uid(), type: 'group', name: fg.dataset.folderName,
        items: checked.map(cb => ({ id: uid(), type: 'site', name: cb.dataset.name, url: cb.dataset.url })),
      });
      groupCount++;
    }
  });

  // Loose (top-level) bookmarks → individual sites
  document.querySelectorAll('.bm-item:not(.bm-folder-group .bm-item) .bm-check:checked:not(:disabled)').forEach(cb => {
    newItems.push({ id: uid(), type: 'site', name: cb.dataset.name, url: cb.dataset.url });
    siteCount++;
  });

  if (!newItems.length) return;
  items.push(...newItems);
  save().then(render);
  closeImportModal();

  const parts = [];
  if (groupCount > 0) parts.push(`${groupCount} group${groupCount > 1 ? 's' : ''}`);
  if (siteCount  > 0) parts.push(`${siteCount} site${siteCount > 1 ? 's' : ''}`);
  _showToast(`Imported ${parts.join(' + ')}`);
}

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
}

async function importBookmarksBar() {
  if (!chrome?.bookmarks) {
    _showToast('Bookmarks API not available');
    return;
  }
  try {
    const tree    = await chrome.bookmarks.getTree();
    const root    = tree[0];
    // Bookmarks bar is always id "1" in Chrome
    const barNode = (root.children ?? []).find(n => n.id === '1') ?? root.children?.[0];
    if (!barNode?.children?.length) {
      _showToast('Bookmarks bar is empty');
      return;
    }

    const existing = _existingUrls(); // Set of already-added URLs
    const newItems = [];
    let siteCount = 0, groupCount = 0;

    for (const node of barNode.children) {
      if (node.url) {
        // Direct bookmark on the bar
        if (!/^https?:\/\//i.test(node.url) || existing.has(node.url)) continue;
        let name = node.title || node.url;
        try { if (!node.title) name = new URL(node.url).hostname.replace(/^www\./, ''); } catch {}
        newItems.push({ id: uid(), type: 'site', name, url: node.url });
        existing.add(node.url);
        siteCount++;
      } else if (node.children) {
        // Subfolder → collect new sites recursively (handles nested sub-subfolders)
        const collected = [];
        _collectBmNodes(node.children, collected, existing);
        const fresh = collected.filter(bm => !bm.exists);
        if (!fresh.length) continue;
        fresh.forEach(bm => existing.add(bm.url));
        const folderSites = fresh.map(bm => ({ id: uid(), name: bm.name, url: bm.url }));
        if (folderSites.length === 1) {
          newItems.push({ id: uid(), type: 'site', name: folderSites[0].name, url: folderSites[0].url });
          siteCount++;
        } else {
          newItems.push({ id: uid(), type: 'group', name: node.title || 'Folder', items: folderSites });
          groupCount++;
        }
      }
    }

    if (!newItems.length) {
      _showToast('All bookmarks bar items already added');
      return;
    }

    _snapshotForUndo();
    items.push(...newItems);
    save().then(render);

    const parts = [];
    if (groupCount > 0) parts.push(`${groupCount} group${groupCount > 1 ? 's' : ''}`);
    if (siteCount  > 0) parts.push(`${siteCount} site${siteCount > 1 ? 's' : ''}`);
    _showToast(`Synced ${parts.join(' + ')} · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
  } catch {
    _showToast('Could not read bookmarks');
  }
}

async function syncAllBookmarks() {
  if (!chrome?.bookmarks) {
    _showToast('Bookmarks API not available');
    return;
  }
  try {
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];
    const existing = _existingUrls();
    const newItems = [];
    let siteCount = 0, groupCount = 0;

    for (const chromeFolder of (root.children ?? [])) {
      if (!chromeFolder.children) continue;

      for (const child of chromeFolder.children) {
        if (child.url) {
          // Direct bookmark inside a top-level Chrome folder
          if (!/^https?:\/\//i.test(child.url) || existing.has(child.url)) continue;
          let name = child.title || child.url;
          try { if (!child.title) name = new URL(child.url).hostname.replace(/^www\./, ''); } catch {}
          newItems.push({ id: uid(), type: 'site', name, url: child.url });
          existing.add(child.url);
          siteCount++;
        } else if (child.children) {
          // Subfolder → group; _collectBmNodes flattens any nested sub-sub-folders
          const collected = [];
          _collectBmNodes(child.children, collected, existing);
          const fresh = collected.filter(bm => !bm.exists);
          if (!fresh.length) continue;
          fresh.forEach(bm => existing.add(bm.url));
          const folderSites = fresh.map(bm => ({ id: uid(), name: bm.name, url: bm.url }));
          if (folderSites.length === 1) {
            newItems.push({ id: uid(), type: 'site', name: folderSites[0].name, url: folderSites[0].url });
            siteCount++;
          } else {
            newItems.push({ id: uid(), type: 'group', name: child.title || 'Folder', items: folderSites });
            groupCount++;
          }
        }
      }
    }

    if (!newItems.length) {
      _showToast('All bookmarks already added');
      return;
    }

    _snapshotForUndo();
    items.push(...newItems);
    save().then(render);

    const parts = [];
    if (groupCount > 0) parts.push(`${groupCount} group${groupCount > 1 ? 's' : ''}`);
    if (siteCount  > 0) parts.push(`${siteCount} site${siteCount > 1 ? 's' : ''}`);
    _showToast(`Synced ${parts.join(' + ')} · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
  } catch {
    _showToast('Could not read bookmarks');
  }
}

// ─── Clock / Date Widget ─────────────────────────────────────────────────────

const _CLOCK_DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const _CLOCK_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _tickClock() {
  const now    = new Date();
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  if (!timeEl) return;
  const h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  timeEl.textContent = `${h}:${m}:${s}`;
  dateEl.textContent =
    `${_CLOCK_DAYS[now.getDay()]} · ${_CLOCK_MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

// ─── Export / Import JSON Backup ─────────────────────────────────────────────

async function doExportJson() {
  const stored = await chrome.storage.local.get(['items', 'theme', 'customColor']);
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: stored.items ?? items,
    theme: stored.theme ?? null,
    customColor: stored.customColor ?? null,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `foyer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  _showToast('Backup downloaded');
}

function _showConfirm(title, body, labelOk, onOk) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-body').textContent  = body;
  document.getElementById('confirm-modal-ok').textContent    = labelOk;
  modal.classList.remove('hidden');

  const okBtn  = document.getElementById('confirm-modal-ok');
  const canBtn = document.getElementById('confirm-modal-cancel');
  const close  = () => {
    modal.classList.add('hidden');
    okBtn.removeEventListener('click', handleOk);
    canBtn.removeEventListener('click', close);
  };
  const handleOk = () => { close(); onOk(); };
  okBtn.addEventListener('click', handleOk);
  canBtn.addEventListener('click', close);
}

function doExportBookmarksHtml() {
  let inner = '';
  for (const item of items) {
    if (item.type === 'group') {
      inner += `    <DT><H3>${escHtml(item.name)}</H3>\n    <DL><p>\n`;
      for (const site of (item.items ?? [])) {
        inner += `        <DT><A HREF="${escHtml(site.url)}">${escHtml(site.name)}</A>\n`;
      }
      inner += `    </DL><p>\n`;
    } else if (item.type === 'site') {
      inner += `    <DT><A HREF="${escHtml(item.url)}">${escHtml(item.name)}</A>\n`;
    }
  }

  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Exported from Foyer on ${new Date().toISOString().slice(0,10)} -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Foyer</H3>
    <DL><p>
${inner}    </DL><p>
</DL><p>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `foyer-bookmarks-${new Date().toISOString().slice(0,10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
  _showToast('Bookmarks HTML downloaded');
}

function doImportJson(file) {
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try {
      data = JSON.parse(e.target.result);
      if (!Array.isArray(data.items)) throw new Error();
    } catch {
      _showToast('Invalid backup file');
      return;
    }

    const tileCount = data.items.length;
    _showConfirm(
      'Restore Backup',
      `Replace your current ${items.length} tile${items.length !== 1 ? 's' : ''} with ${tileCount} tile${tileCount !== 1 ? 's' : ''} from the backup?`,
      'Restore',
      () => {
        _snapshotForUndo();
        items = data.items;
        save().then(() => {
          if (data.theme && data.theme !== 'custom') { applyTheme(data.theme); saveTheme(data.theme); }
          else if (data.theme === 'custom' && data.customColor) { applyCustomColor(data.customColor); saveCustomColor(data.customColor); }
          render();
          _showToast(`Restored ${items.length} tile${items.length !== 1 ? 's' : ''} · ${_isMac ? '⌘Z' : 'Ctrl+Z'} to undo`);
        });
      }
    );
  };
  reader.readAsText(file);
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
  try { await load();        } catch { items = sampleItems(); }
  try { await loadTheme();   } catch { applyTheme('cream'); }
  try { await loadTileSize(); } catch { applyTileSize('m'); }
  try { await loadModalDark(); } catch { applyModalDark(false); }
  try { await loadShortcuts(); } catch { /* use defaults */ }
  _loadBookmarkFavicons(); // fire-and-forget; populates _bookmarkFavicons for "Refresh icon"
  render();

  // Clock — tick immediately; pause when tab is hidden to save CPU
  _tickClock();
  let _clockInterval = setInterval(_tickClock, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(_clockInterval);
    } else {
      _tickClock();
      _clockInterval = setInterval(_tickClock, 1000);
    }
  });

  // Weather — fire and forget (updates UI async)
  _loadWeather();

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
    if (!document.getElementById('theme-picker').contains(e.target) &&
        !document.getElementById('settings-modal').contains(e.target)) {
      document.getElementById('theme-swatches').classList.add('hidden');
    }
  });

  document.addEventListener('keydown', e => {
    const tag      = document.activeElement?.tagName;
    const isInput  = tag === 'INPUT' || tag === 'TEXTAREA';

    // ── Shortcut listening mode (remapping) ──
    if (_scListening) {
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); _cancelShortcutListen(); return; }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        e.preventDefault();
        const key = e.key;
        const conflict = Object.entries(_shortcuts).find(([a, k]) => k === key && a !== _scListening.action);
        if (conflict) {
          const names = { addTile: 'Add tile', search: 'Search' };
          document.getElementById('sc-conflict-msg').textContent =
            `"${key}" is already used by "${names[conflict[0]] || conflict[0]}"`;
          return;
        }
        _shortcuts[_scListening.action] = key;
        _scListening.el.textContent = key;
        _scListening.el.classList.remove('listening');
        _scListening = null;
        document.getElementById('sc-conflict-msg').textContent = '';
        chrome.storage.local.set({ shortcuts: { ..._shortcuts } });
        return;
      }
      return;
    }

    const anyOverlayOpen = [
      'add-modal','edit-modal','rename-modal',
      'import-modal','location-modal','confirm-modal',
      'search-overlay','tutorial-overlay','settings-modal','bg-adjust-modal',
    ].some(id => !document.getElementById(id).classList.contains('hidden'));

    const groupOpen = !document.getElementById('group-overlay').classList.contains('hidden');
    // Grid navigation active when no overlay and no text input is focused
    const navActive = !isInput && !anyOverlayOpen && !groupOpen;

    // ── Escape ──
    if (e.key === 'Escape') {
      if (!document.getElementById('settings-modal').classList.contains('hidden'))      { closeSettingsModal(); return; }
      if (!document.getElementById('bg-adjust-modal').classList.contains('hidden'))    { document.getElementById('bg-adjust-cancel').click(); return; }
      if (groupOpen)                                                                      { closeGroup();     return; }
      if (_selectedIds.size > 0)                                                         { _clearSel();      return; }
      if (_focusedId)                                                                     { _focusTile(null); return; }
      if (!document.getElementById('search-overlay').classList.contains('hidden'))      { closeSearch();    return; }
      if (!document.getElementById('import-modal').classList.contains('hidden'))        { closeImportModal(); return; }
      if (!document.getElementById('location-modal').classList.contains('hidden'))      { closeLocationModal(); return; }
      if (!document.getElementById('confirm-modal').classList.contains('hidden'))       { document.getElementById('confirm-modal').classList.add('hidden'); return; }
      if (!document.getElementById('tutorial-overlay').classList.contains('hidden'))    { _tutDone();       return; }
      closeCtxMenu(); closeGroup(); closeAddModal(); closeEditModal();
      document.getElementById('theme-swatches').classList.add('hidden');
      return;
    }

    // ── Group overlay keyboard navigation ──
    if (groupOpen && !isInput) {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
        _navGroupGrid(e.key);
        return;
      }
      if (e.key === 'Enter' && _gpFocusedSiteId) {
        const group = items.find(i => i.id === openGroupId);
        const site  = group?.items?.find(s => s.id === _gpFocusedSiteId);
        if (site) { window.location.href = site.url; }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && _gpFocusedSiteId) {
        e.preventDefault();
        const group = items.find(i => i.id === openGroupId);
        if (!group) return;
        const pages = document.querySelectorAll('#group-pages-track .group-page');
        const curPage = pages[groupCurrentPage];
        const tiles = curPage ? [...curPage.querySelectorAll('.group-site-tile')] : [];
        const tileIdx = tiles.findIndex(t => t.dataset.siteId === _gpFocusedSiteId);
        _snapshotForUndo();
        group.items = group.items.filter(s => s.id !== _gpFocusedSiteId);
        if (_dissolveGroupIfNeeded(openGroupId)) {
          save(); render(); closeGroup();
        } else {
          const savedGroupId  = openGroupId;
          const savedPage     = groupCurrentPage;
          save();
          openGroup(savedGroupId);
          if (savedPage > 0) goToGroupPage(savedPage);
          const np = document.querySelectorAll('#group-pages-track .group-page')[groupCurrentPage];
          const nt = np ? [...np.querySelectorAll('.group-site-tile')] : [];
          if (nt.length) _focusGroupTile(nt[Math.min(tileIdx, nt.length - 1)].dataset.siteId);
        }
        _showToast('Deleted · ' + (_isMac ? '⌘' : 'Ctrl') + '+Z to undo');
        return;
      }
    }

    // ── A / D: group page navigation ──
    if (groupOpen && !isInput) {
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (groupCurrentPage > 0) goToGroupPage(groupCurrentPage - 1);
        _updateGroupHints();
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (groupCurrentPage < groupTotalPages - 1) goToGroupPage(groupCurrentPage + 1);
        _updateGroupHints();
        return;
      }
    }

    // ── Arrow keys: grid navigation ──
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && navActive) {
      e.preventDefault();
      _clearSel();
      _navGrid(e.key);
      return;
    }

    // ── Enter: open focused tile ──
    if (e.key === 'Enter' && navActive && _focusedId) {
      const item = items.find(i => i.id === _focusedId);
      if (item?.type === 'site')  { window.location.href = item.url; return; }
      if (item?.type === 'group') { openGroup(item.id);              return; }
    }

    // ── Delete / Backspace: delete focused tile ──
    if ((e.key === 'Delete' || e.key === 'Backspace') && navActive && _focusedId) {
      e.preventDefault();
      const tileEls = [...document.querySelectorAll('#grid .tile')];
      const idx     = tileEls.findIndex(t => t.dataset.id === _focusedId);
      _snapshotForUndo();
      items      = items.filter(i => i.id !== _focusedId);
      _focusedId = null;
      save();
      render();
      const remaining = [...document.querySelectorAll('#grid .tile')];
      if (remaining.length) _focusTile(remaining[Math.min(idx, remaining.length - 1)].dataset.id);
      _showToast('Deleted · ' + (_isMac ? '⌘' : 'Ctrl') + '+Z to undo');
      return;
    }

    // ── ⌘Z / Ctrl+Z: undo ──
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      doUndo();
      return;
    }

    // ── add tile shortcut (to group if open, else main grid) ──
    if (e.key === _shortcuts.addTile && !isInput && !anyOverlayOpen) {
      e.preventDefault();
      if (groupOpen) openAddModalForGroup(openGroupId);
      else           openAddModal();
      return;
    }

    // ── ⌘K / Ctrl+K or search shortcut ──
    if (!anyOverlayOpen && !groupOpen) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); return; }
      if (e.key === _shortcuts.search && !isInput) { e.preventDefault(); openSearch(); return; }
    }
  });

  // Marquee (rubber-band) selection on grid background
  document.getElementById('app').addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.tile')) return; // tile drag handled separately
    _clearSel();
    _focusTile(null);
    const anchor = { x: e.clientX, y: e.clientY };
    const selBox = document.getElementById('sel-box');
    Object.assign(selBox.style, { left: e.clientX+'px', top: e.clientY+'px', width: '0', height: '0', display: 'block' });

    function onMove(ev) {
      const x1 = Math.min(anchor.x, ev.clientX), x2 = Math.max(anchor.x, ev.clientX);
      const y1 = Math.min(anchor.y, ev.clientY), y2 = Math.max(anchor.y, ev.clientY);
      Object.assign(selBox.style, { left: x1+'px', top: y1+'px', width: (x2-x1)+'px', height: (y2-y1)+'px' });
      if (x2-x1 > 4 || y2-y1 > 4) _updateTileSel(x1, y1, x2, y2);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      selBox.style.display = 'none';
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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

  // Top search bar → open search overlay
  document.getElementById('top-search-bar').addEventListener('click', () => openSearch());

  document.getElementById('history-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://history' });
  });
  document.getElementById('downloads-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://downloads' });
  });

  // Engine search bar
  const engineInput = document.getElementById('engine-input');
  engineInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = engineInput.value.trim();
      if (!q) return;
      window.open(_engineUrl(q), '_self');
      engineInput.value = '';
    }
    if (e.key === 'Escape') {
      engineInput.blur();
      engineInput.value = '';
    }
  });


  // Config button → open settings modal
  document.getElementById('config-btn').addEventListener('click', e => {
    e.stopPropagation();
    openSettingsModal();
  });

  // Settings modal close button + backdrop
  document.getElementById('close-settings').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSettingsModal();
  });

  // Settings tabs
  document.querySelectorAll('.stab').forEach(tab => {
    tab.addEventListener('click', () => _switchSettingsTab(tab.dataset.pane));
  });

  // Settings → data buttons
  document.getElementById('settings-import-bm').addEventListener('click', () => {
    closeSettingsModal(); openImportModal();
  });
  document.getElementById('settings-sync-bar').addEventListener('click', () => {
    closeSettingsModal(); importBookmarksBar();
  });
  document.getElementById('settings-sync-all').addEventListener('click', () => {
    closeSettingsModal(); syncAllBookmarks();
  });
  document.getElementById('settings-export-bm').addEventListener('click', () => {
    doExportBookmarksHtml(); closeSettingsModal();
  });
  document.getElementById('settings-export-json').addEventListener('click', () => {
    doExportJson(); closeSettingsModal();
  });
  const jsonImportInput = document.getElementById('json-import-input');
  document.getElementById('settings-import-json').addEventListener('click', () => {
    jsonImportInput.click(); closeSettingsModal();
  });
  jsonImportInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) doImportJson(file);
    e.target.value = '';
  });

  // Import bookmarks modal
  document.getElementById('cancel-import').addEventListener('click', closeImportModal);
  document.getElementById('confirm-import').addEventListener('click', doImportBookmarks);
  document.getElementById('import-select-all').addEventListener('click', () => _bmSelectAll(true));
  document.getElementById('import-deselect-all').addEventListener('click', () => _bmSelectAll(false));
  document.getElementById('import-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeImportModal();
  });

  // Window style (light / dark modals)
  document.getElementById('modal-style-light').addEventListener('click', () => {
    applyModalDark(false);
    chrome.storage.local.set({ modalDark: false });
  });
  document.getElementById('modal-style-dark').addEventListener('click', () => {
    applyModalDark(true);
    chrome.storage.local.set({ modalDark: true });
  });

  // Shortcut key remapping
  document.querySelectorAll('.sc-key.editable').forEach(el => {
    el.addEventListener('click', () => _startShortcutListen(el, el.dataset.action));
  });

  // Theme picker (quick-access button stays)
  const themeBtn      = document.getElementById('theme-btn');
  const themeSwatches = document.getElementById('theme-swatches');
  themeBtn.addEventListener('click', e => {
    e.stopPropagation();
    themeSwatches.classList.toggle('hidden');
  });
  document.querySelectorAll('.swatch[data-theme]').forEach(swatch => {
    swatch.addEventListener('click', e => {
      e.stopPropagation();
      applyTheme(swatch.dataset.theme);
      saveTheme(swatch.dataset.theme);
      themeSwatches.classList.add('hidden');
    });
  });

  const colorInput = document.getElementById('custom-color-input');
  document.querySelectorAll('.swatch-custom').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); colorInput.click(); });
  });
  colorInput.addEventListener('input', e => {
    applyCustomColor(e.target.value);
    saveCustomColor(e.target.value);
  });

  // Image background picker
  const bgImageInput = document.getElementById('bg-image-input');
  document.querySelectorAll('.swatch-image').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (document.body.classList.contains('theme-image') && _bgDataUrl) {
        // Re-adjust existing image without picking a new file
        themeSwatches.classList.add('hidden');
        openBgAdjust(_bgDataUrl);
      } else {
        bgImageInput.click();
      }
    });
  });
  bgImageInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    if (!dataUrl) return;
    e.target.value = '';
    themeSwatches.classList.add('hidden');
    // Reset position for new image
    _bgPosX = 50; _bgPosY = 50; _bgZoom = 100;
    openBgAdjust(dataUrl);
  });

  // Background adjust modal wiring
  const bgPreview = document.getElementById('bg-adjust-preview');

  bgPreview.addEventListener('mousedown', e => {
    _bgAdjDragging  = true;
    _bgAdjDragStartX = e.clientX;
    _bgAdjDragStartY = e.clientY;
    bgPreview.classList.add('dragging');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!_bgAdjDragging) return;
    const pr = bgPreview.getBoundingClientRect();
    const dx = e.clientX - _bgAdjDragStartX;
    const dy = e.clientY - _bgAdjDragStartY;
    _bgAdjDragStartX = e.clientX;
    _bgAdjDragStartY = e.clientY;
    // Dragging left = show more right side (posX increases); inverted for natural pan feel
    _bgAdjTmpPosX = Math.max(0, Math.min(100, _bgAdjTmpPosX - (dx / pr.width)  * 100));
    _bgAdjTmpPosY = Math.max(0, Math.min(100, _bgAdjTmpPosY - (dy / pr.height) * 100));
    _bgPreviewUpdate();
  });
  document.addEventListener('mouseup', () => {
    if (!_bgAdjDragging) return;
    _bgAdjDragging = false;
    bgPreview.classList.remove('dragging');
  });

  document.getElementById('bg-zoom-slider').addEventListener('input', e => {
    _bgAdjTmpZoom = Number(e.target.value);
    _bgPreviewUpdate();
  });

  document.getElementById('bg-adjust-apply').addEventListener('click', () => {
    applyBgImage(_bgDataUrl, _bgAdjTmpPosX, _bgAdjTmpPosY, _bgAdjTmpZoom);
    saveBgImage(_bgDataUrl, _bgAdjTmpPosX, _bgAdjTmpPosY, _bgAdjTmpZoom);
    closeBgAdjust();
  });

  document.getElementById('bg-adjust-cancel').addEventListener('click', () => {
    // Restore previous state
    if (_bgAdjPrevDataUrl) {
      applyBgImage(_bgAdjPrevDataUrl, _bgAdjPrevPosX, _bgAdjPrevPosY, _bgAdjPrevZoom);
    } else {
      applyTheme('cream');
      chrome.storage.local.set({ theme: 'cream' });
    }
    closeBgAdjust();
  });

  document.getElementById('bg-adjust-change').addEventListener('click', () => {
    bgImageInput.click();
  });

  document.getElementById('bg-adjust-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      // treat backdrop click as cancel
      document.getElementById('bg-adjust-cancel').click();
    }
  });

  // Weather: temp click → toggle °C/°F
  document.getElementById('weather-temp').addEventListener('click', () => {
    _weatherUnit = _weatherUnit === 'C' ? 'F' : 'C';
    chrome.storage.local.set({ weatherUnit: _weatherUnit });
    _renderWeather();
  });

  // Weather: city button → location modal
  document.getElementById('weather-city-btn').addEventListener('click', openLocationModal);

  // Location modal
  document.getElementById('cancel-location').addEventListener('click', closeLocationModal);
  document.getElementById('location-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLocationModal();
  });
  const locationInput = document.getElementById('location-input');
  locationInput.addEventListener('input', e => {
    clearTimeout(_locationSearchTimer);
    _locationSearchTimer = setTimeout(() => _doLocationSearch(e.target.value), 340);
  });
  locationInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLocationModal();
  });
  document.getElementById('location-use-gps').addEventListener('click', () => {
    closeLocationModal();
    if (!navigator.geolocation) return;
    _weatherSetStatus('Detecting…');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const geo = await _reverseGeocode(lat, lon);
        await _applyLocation(lat, lon, geo.city, geo.country);
      },
      () => { document.getElementById('weather-city').textContent = 'Set location'; },
      { timeout: 8000 }
    );
  });

  // Tile size slider
  const tileSizeSlider = document.getElementById('tile-size-slider');
  tileSizeSlider.addEventListener('input', () => {
    const key = SIZE_KEYS[tileSizeSlider.value - 1];
    applyTileSize(key);
    saveTileSize(key);
  });

  // Confirm modal dismiss
  document.getElementById('confirm-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('confirm-modal').classList.add('hidden');
  });
});

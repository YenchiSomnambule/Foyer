// Foyer background service worker — collects badge counts from content scripts

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'badge_update') return;
  const { hostname, count } = msg;
  if (typeof hostname !== 'string' || !hostname) return;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return;

  const rounded = Math.round(count);
  chrome.storage.local.get('badges', ({ badges = {} }) => {
    if ((badges[hostname] ?? 0) === rounded) return; // skip unchanged
    badges[hostname] = rounded;
    chrome.storage.local.set({ badges });
  });
});

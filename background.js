// Foyer background service worker — collects badge counts from content scripts

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'badge_update') return;
  const { hostname, count } = msg;
  if (typeof hostname !== 'string' || typeof count !== 'number') return;

  chrome.storage.local.get('badges', ({ badges = {} }) => {
    if ((badges[hostname] ?? 0) === count) return; // skip unchanged
    badges[hostname] = count;
    chrome.storage.local.set({ badges });
  });
});

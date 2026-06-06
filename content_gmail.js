// Foyer content script — reports Gmail unread count from the page title

function getUnreadCount() {
  const m = document.title.match(/^\((\d+)\)/);
  return m ? parseInt(m[1], 10) : 0;
}

function report() {
  chrome.runtime.sendMessage({
    type: 'badge_update',
    hostname: 'mail.google.com',
    count: getUnreadCount(),
  });
}

report();

// Observe only the <title> text node — not the entire <head> subtree
const titleEl = document.querySelector('title');
if (titleEl) {
  new MutationObserver(report).observe(titleEl, { childList: true, characterData: true, subtree: true });
} else {
  // Fallback: watch <head> for a title element to appear, then re-attach
  new MutationObserver((_, obs) => {
    const t = document.querySelector('title');
    if (!t) return;
    obs.disconnect();
    new MutationObserver(report).observe(t, { childList: true, characterData: true, subtree: true });
  }).observe(document.head, { childList: true });
}

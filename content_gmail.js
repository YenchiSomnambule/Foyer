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

// Gmail updates the title dynamically; observe the <title> element for changes
new MutationObserver(report).observe(
  document.querySelector('title')?.parentNode ?? document.head,
  { subtree: true, childList: true, characterData: true }
);

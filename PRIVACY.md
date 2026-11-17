# Privacy Policy — Foyer New Tab

**Last updated: November 2026**

Foyer is a Chrome extension that replaces your new tab page with a personal site-grid dashboard. This policy explains what data the extension accesses and how it is handled.

---

## Data stored locally

All user data is stored exclusively on your device using `chrome.storage.local`. Nothing is uploaded to any server operated by this extension.

| Data | Purpose |
|---|---|
| Your site list, groups, and pages (including custom page names) | Persists your grid layout across browser sessions |
| Sticky notes, and whether the notes column is collapsed | Shows your notes on each new tab |
| Automatic backups (up to 10 snapshots of your tiles, up to 5 of your notes) | Lets you restore tiles or notes from Settings → Restore from backup |
| Custom tile icons you upload | Displayed in place of the site's favicon; stored only on this device |
| Theme and tile-size preference | Restores your visual settings on each new tab |
| Search engine choice | Restores your preferred engine for the search bar |
| Weather location and cache | Avoids redundant API calls; refreshes every 30 minutes |
| Keyboard shortcut configuration | Restores your custom key bindings on each new tab |
| Language preference | Restores your chosen interface language on each new tab |
| Local usage counters (install date, new-tab count) | Decides when to show the optional one-time "rate us" reminder — never leaves your device |

You can clear all stored data at any time by removing the extension or clearing its storage from Chrome's extension management page.

---

## Cross-device sync (optional, off by default)

If you enable **Sync across devices** in Settings → Data, your site list, page names and sticky notes are also written to `chrome.storage.sync`. This data is replicated between your devices by **Chrome's own sync infrastructure**, tied to the Google account you use for Chrome sync — the extension itself still sends nothing to any server of its own, and no third-party service is involved. Uploaded custom icons and large cached favicons are excluded from the synced payload and remain local. Turning the toggle off stops this device from reading or writing sync data.

---

## External requests

The extension makes outbound requests for exactly two things: **site icons** and the **weather widget**. It has no server of its own and sends no analytics.

### Site icons

To show an icon on each tile, the browser loads image files for the sites **you added** to your grid. For each tile it tries, in order:

| Source | What the request reveals |
|---|---|
| The site itself (`<site>/apple-touch-icon.png`, `<site>/favicon.ico`) | That you have this site on your grid — the same as visiting its address |
| Google's public favicon services (`t2.gstatic.com/faviconV2`, `www.google.com/s2/favicons`) | The site's domain name |

These are ordinary image loads (no cookies are set by the extension and nothing else is attached). Sites with an uploaded custom icon skip these requests. The search-engine picker loads the six engines' icons the same way.

### Weather

Weather requests go only to the following three public APIs:

| API | Data sent | Purpose |
|---|---|---|
| `api.open-meteo.com` | Latitude, longitude | Fetches current temperature and weather condition |
| `geocoding-api.open-meteo.com` | City name (user-typed) | Converts a city name to geographic coordinates |
| `api.bigdatacloud.net` | Latitude, longitude | Converts GPS coordinates to a human-readable city name |

Latitude and longitude are derived from your browser's Geolocation API **only if you click "Auto-detect" and grant location permission**. You may instead type a city name manually, in which case no GPS coordinates are ever used. Until you set a location, no weather request is made.

These APIs are third-party services with their own privacy policies. No API key tied to your identity is transmitted.

---

## Bookmarks

The extension can read your Chrome bookmarks via the `bookmarks` permission when you choose to import them. Bookmarks are read locally and added to your grid — they are never sent to any external server.

If you turn on **Mirror to Chrome bookmarks** (off by default), the extension creates and maintains a single folder named "Foyer" in Other bookmarks that reflects your tiles, plus a "Foyer Archive" folder that keeps previous versions when many tiles are removed at once. It only creates, edits, or deletes bookmarks inside those two folders and never touches any other bookmark. Like all Chrome bookmarks, these folders sync through your Google account only if you have enabled Chrome Sync.

## Sticky notes

Notes you write in the sticky-notes column are stored in local extension storage on your device. If you turn on **Sync across devices**, they are also stored in Chrome's sync storage for your Google account (like your tiles) so they appear on your other computers; they are never sent to any other server. They are included in a backup file only when you choose Export backup.

## Automatic backups

The extension keeps up to 10 snapshots of your tiles in local extension storage (once a day and before large changes such as clearing or importing) so you can restore them from Settings. These backups stay on your device and are never uploaded.

---

## Most-visited sites (optional permission)

The extension declares `topSites` as an **optional** permission. It is only requested if you click "Suggest my most visited sites" in the Add Site dialog, and Chrome asks for your explicit approval at that moment. When granted, your most-visited list is read locally to show suggestion chips — it is never transmitted anywhere.

---

## What we do not collect

- No personal information
- No browsing history
- No analytics or telemetry
- No cookies
- No advertising identifiers

---

## Contact

This extension is open source. If you have questions or concerns, please open an issue at:  
https://github.com/YenchiSomnambule/Foyer

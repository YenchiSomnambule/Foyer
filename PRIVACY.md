# Privacy Policy — Foyer New Tab

**Last updated: July 2026**

Foyer is a Chrome extension that replaces your new tab page with a personal site-grid dashboard. This policy explains what data the extension accesses and how it is handled.

---

## Data stored locally

All user data is stored exclusively on your device using `chrome.storage.local`. Nothing is uploaded to any server operated by this extension.

| Data | Purpose |
|---|---|
| Your site list, groups, and pages (including custom page names) | Persists your grid layout across browser sessions |
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

If you enable **Sync across devices** in Settings → Data, your site list and page names are also written to `chrome.storage.sync`. This data is replicated between your devices by **Chrome's own sync infrastructure**, tied to the Google account you use for Chrome sync — the extension itself still sends nothing to any server of its own, and no third-party service is involved. Uploaded custom icons and large cached favicons are excluded from the synced payload and remain local. Turning the toggle off stops this device from reading or writing sync data.

---

## External API calls

The extension makes outbound requests **only** for the weather widget, and only to the following three public APIs:

| API | Data sent | Purpose |
|---|---|---|
| `api.open-meteo.com` | Latitude, longitude | Fetches current temperature and weather condition |
| `geocoding-api.open-meteo.com` | City name (user-typed) | Converts a city name to geographic coordinates |
| `api.bigdatacloud.net` | Latitude, longitude | Converts GPS coordinates to a human-readable city name |

Latitude and longitude are derived from your browser's Geolocation API **only if you grant location permission**. You may instead type a city name manually, in which case no GPS coordinates are ever used.

These APIs are third-party services with their own privacy policies. No API key tied to your identity is transmitted.

---

## Bookmarks

The extension can read your Chrome bookmarks via the `bookmarks` permission when you choose to import them. Bookmarks are read locally and added to your grid — they are never sent to any external server. The extension never creates, edits, or deletes bookmarks.

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

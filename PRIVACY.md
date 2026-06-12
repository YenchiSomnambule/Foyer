# Privacy Policy — Foyer New Tab

**Last updated: June 2026**

Foyer is a Chrome extension that replaces your new tab page with a personal site-grid dashboard. This policy explains what data the extension accesses and how it is handled.

---

## Data stored locally

All user data is stored exclusively on your device using `chrome.storage.local`. Nothing is uploaded to any server operated by this extension.

| Data | Purpose |
|---|---|
| Your site list, groups, and pages (including custom page names) | Persists your grid layout across browser sessions |
| Theme and tile-size preference | Restores your visual settings on each new tab |
| Weather location and cache | Avoids redundant API calls; refreshes every 30 minutes |
| Keyboard shortcut configuration | Restores your custom key bindings on each new tab |

You can clear all stored data at any time by removing the extension or clearing its storage from Chrome's extension management page.

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

# Chrome Web Store — Privacy practices（隱私權做法分頁）

Developer Dashboard → Foyer → **Privacy practices**. Paste each block into the matching field.
Keep this file in step with `PRIVACY.md` and `manifest.json` whenever permissions or network requests change.

---

## Single purpose（單一用途說明）

```
Foyer replaces Chrome's new tab page with a personal start page: a grid of the websites you choose, organised into pages and folders, with quick search, a clock and weather, and sticky notes.
```

---

## Permission justification（權限理由）

### storage

```
Saves the user's tiles, pages, folders, sticky notes, settings (theme, language, tile size, shortcuts, search engine), weather location and automatic backups in chrome.storage.local. When the user turns on "Sync across devices", tiles, page names and sticky notes are also written to chrome.storage.sync so Chrome Sync can copy them to the user's other computers. Nothing is sent to any server of ours.
```

### bookmarks

```
Used only when the user asks for it: (1) "Sync bookmarks bar", "Sync all bookmarks" and "Import bookmarks" read the user's bookmarks to add them as tiles; (2) the optional "Mirror to Chrome bookmarks" setting (off by default) keeps one folder named "Foyer" (plus a "Foyer Archive" folder) in step with the tiles. The extension never edits any bookmark outside those two folders, and bookmarks are never sent anywhere.
```

### topSites（optional permission — fill in if the dashboard asks）

```
Optional and requested only when the user clicks "Suggest my most visited sites" in the Add Site dialog. The most-visited list is read on the device to show one-click suggestions; it is never stored or transmitted.
```

### Host permissions（主機權限理由）

```
Used only by the optional weather widget, after the user sets a location: api.open-meteo.com (current weather for the chosen coordinates), geocoding-api.open-meteo.com (turns a city name the user types into coordinates), and api.bigdatacloud.net (turns coordinates into a city name when the user clicks "Auto-detect" and allows location access). No other hosts are requested.
```

---

## Remote code（遠端程式碼）

Select **"No, I am not using remote code."**
（All JavaScript ships inside the package. Favicons and weather data are images/JSON, not code.）

---

## Data usage（資料使用）

### What user data do you plan to collect from users now or in the future?

| Category | Check? | Why |
|---|---|---|
| Personally identifiable information | ☐ | No names, emails, accounts or IDs. |
| Health information | ☐ | |
| Financial and payment information | ☐ | |
| Authentication information | ☐ | |
| Personal communications | ☐ | Sticky notes stay on the device (or in the user's own Chrome Sync); we never receive them. |
| **Location** | **☑** | When the user sets a weather location, its coordinates (or the typed city name) are sent to the weather APIs to get the forecast. |
| Web history | ☐ | The optional most-visited list is read on-device only and never transmitted. |
| User activity | ☐ | No analytics, clicks or keystrokes are recorded or sent. |
| Website content | ☐ | |

> Note on site icons: to draw each tile, the browser loads the icon image of the sites the user added — from the site itself and from Google's public favicon service, which receives the site's domain. This is disclosed in the privacy policy. It is not listed as "collection" above because the developer receives no data; if a reviewer asks, point them to the "Site icons" section of the policy.

### Certifications（三個都要勾）

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## Privacy policy URL（隱私權政策網址）

```
https://github.com/YenchiSomnambule/Foyer/blob/main/PRIVACY.md
```

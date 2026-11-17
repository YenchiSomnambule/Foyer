# Chrome Web Store — Store listing（商店資訊分頁）

Developer Dashboard → Foyer → **Store listing** → *Description*.
The store shows plain text: line breaks and "•" bullets are kept, Markdown is not rendered.
Keep claims in step with the code — reviewers check them.

> The listing can only be in **one language** for now: `manifest.json` has no `default_locale`
> (no `_locales/` folder), which the store requires before it offers per-language listings.

---

## Summary（摘要，≤ 132 字元）

The summary is **not** typed in the dashboard — it is the `"description"` in `manifest.json`.

Current (2.7.3, 107 chars — doesn't mention notes):

```
Your websites in a clean new-tab grid — pages, folders, quick search, weather, and free cross-device sync.
```

Suggested for the next release (119 chars):

```
Your websites in a clean new-tab grid — pages, folders, sticky notes, quick search, weather and free cross-device sync.
```

---

## Description — English (recommended)

```
Foyer turns every new tab into a calm, organised home for the sites you use most — no account, no ads, no analytics.

YOUR SITES, YOUR WAY
• A clean grid of your favourite websites with crisp icons (sites without one get a tidy letter tile)
• 10 pages — name them "Work", "Study", "Fun"… and jump between them with keys 1–9 and 0
• Drag to reorder, drop one tile onto another to make a folder, or drag a whole selection onto another page
• Folders open as a neat 3×3 grid
• Upload your own icon for any tile; middle-click to open a site in a new tab

FIND ANYTHING FAST
• Press / or Ctrl+K to search across every page of tiles
• Search the web with Google, Bing, DuckDuckGo, Baidu, Yahoo! JAPAN or Ecosia
• Keyboard-friendly: arrow keys, Enter, Delete and customisable shortcuts

STICKY NOTES
• Jot down to-dos and ideas right on your new tab, in five colours
• Don't need them? Tuck the notes column away with one click

BRING YOUR BOOKMARKS
• Import your bookmarks bar or all your bookmarks in one click — folders become tile folders
• Optional: keep a "Foyer" folder in Chrome bookmarks in step with your tiles

SAFE AND IN SYNC
• Free cross-device sync of tiles, page names and notes through your own Chrome Sync — no sign-up
• Automatic daily backups with one-click restore, plus undo (Ctrl+Z) that survives closing the tab
• Export or import a backup file at any time

MAKE IT YOURS
• Five themes, any custom colour, or your own background photo
• Light, dark or automatic window style; adjustable tile size
• Clock and weather (°C / °F) for any city
• Available in English, 繁體中文, 简体中文 and 日本語

PRIVACY FIRST
Foyer has no servers and no analytics. Your tiles and notes stay on your device — and in your own Chrome Sync only if you turn sync on. The weather widget connects only after you choose a location.
Privacy policy: https://github.com/YenchiSomnambule/Foyer/blob/main/PRIVACY.md

Foyer is open source: https://github.com/YenchiSomnambule/Foyer
```

---

## Description — 繁體中文（若主要客群在台灣／香港，可改用這版）

```
Foyer 把每一個新分頁，變成整齊又安靜的個人起始頁——不用註冊帳號、沒有廣告、不做任何追蹤分析。

你的網站，照你的方式排
• 把常用網站排成乾淨的格子，圖示清楚；抓不到圖示的網站會顯示簡潔的字母方塊
• 10 個頁面，可以取名成「工作」「讀書」「娛樂」，用數字鍵 1–9、0 快速切換
• 拖曳排序；把一個網站拖到另一個上面就變成資料夾；也能多選後一起拖到別的頁面
• 資料夾打開是整齊的 3×3 格子
• 可以替任何網站上傳自己的圖示；按滑鼠中鍵用新分頁開啟

快速找到任何東西
• 按 / 或 Ctrl+K，搜尋所有頁面上的網站
• 用 Google、Bing、DuckDuckGo、百度、Yahoo! JAPAN 或 Ecosia 搜尋網路
• 完整鍵盤操作：方向鍵、Enter、Delete，快速鍵也能自訂

便條紙
• 直接在新分頁上記下待辦和靈感，有五種顏色
• 用不到？一鍵把便條欄收起來

匯入你的書籤
• 一鍵匯入書籤列或所有書籤，書籤資料夾會變成網站資料夾
• 選用：讓 Chrome 書籤裡的「Foyer」資料夾跟著你的網站自動更新

安全又同步
• 免費跨裝置同步網站、頁面名稱和便條，透過你自己的 Chrome 同步，不用註冊
• 每天自動備份、一鍵還原；Ctrl+Z 復原，關掉分頁後也還能用
• 隨時匯出或匯入備份檔

打造你的風格
• 五種主題、任意自訂顏色，或用自己的照片當背景
• 淺色、深色或跟隨系統；網站圖示大小可調整
• 時鐘與天氣（°C / °F），任何城市都可以設定
• 支援 English、繁體中文、简体中文、日本語

重視隱私
Foyer 沒有自己的伺服器，也不做任何分析。你的網站和便條只存在你的電腦上；只有在你開啟同步時，才會存進你自己的 Chrome 同步空間。天氣小工具要等你選好地點後才會連線。
隱私權政策：https://github.com/YenchiSomnambule/Foyer/blob/main/PRIVACY.md

Foyer 是開放原始碼專案：https://github.com/YenchiSomnambule/Foyer
```

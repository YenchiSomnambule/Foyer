# Foyer 自動測試

用無頭（看不到視窗的）Chromium 開啟 `newtab.html`，搭配一個假的 `chrome.*` API，自動點按、打字並檢查結果。每次改完程式、上架前先跑一次。

## 第一次使用

```bash
npm install
```

```bash
npx playwright install chromium
```

## 執行

```bash
npm test
```

只跑部分測試（檔名包含關鍵字即可）：

```bash
node tests/run.js notes backup
```

沒有網路時，跳過需要真的去抓網站圖示的檢查：

```bash
FOYER_OFFLINE=1 npm test
```

一次只跑一個檔案（預設同時跑 3 個）：

```bash
TEST_JOBS=1 npm test
```

截圖會存在 `tests/screenshots/`（不會 commit）。

## 測試清單

| 檔案 | 測什麼 |
|---|---|
| `smoke.test.js` | 基本功能：格子排列、新增、改名、刪除、右鍵選單、拖曳（原本的 `verify.js`） |
| `group-grid.test.js` | Group 視窗 3×3、每頁 9 個、超過自動分頁 |
| `backups.test.js` | 自動備份、從備份還原、關掉分頁後仍能 Ctrl+Z、備份容量上限 |
| `bookmark-mirror.test.js` | 同步到 Chrome 書籤：最少量修改、清除全部時封存、不碰其他書籤（英文＋繁中） |
| `blank-names.test.js` | 沒名字就留白，不自動填網址 |
| `hostname-cleanup.test.js` | 一次性清除「名字等於網址」的舊 tiles |
| `page-names.test.js` | 頁籤顯示名稱取代數字、數字鍵仍可切換、雙擊改名 |
| `letter-icons.test.js` | 讀不到圖示時顯示黑底白字的字母方塊（**需要網路**） |
| `notes.test.js` | 便條：版面、打字不觸發快捷鍵、顏色、保存、刪除確認、收起／展開（淺色＋深色主題） |
| `notes-sync.test.js` | 便條跨裝置同步：三台模擬電腦、打字中不被覆蓋、合併、備份、容量上限 |
| `tutorial.test.js` | 新手教學：10 步、「便條」步驟會指向便條欄／收起時的小標籤／窄視窗時置中 |
| `whats-new.test.js` | 一次性「新功能」小卡片：只給更新的舊使用者、知道了／我不需要便條、忽略 3 次後不再出現、不和評分卡片同時出現 |
| `compatibility.test.js` | 功能之間的衝突：書籤封存不會被匯回、過期裝置不覆蓋雲端、圖示快取不算修改、匯入備份含便條 |

## 寫新測試

在 `tests/` 新增 `xxx.test.js`，`run.js` 會自動找到它。共用工具在 `helpers.js`：

```js
const { launch, openDevice, reporter, baseLocal, emptyPages, site } = require('./helpers');

(async () => {
  const r = reporter('My feature');
  const browser = await launch();
  const pages = emptyPages();
  pages['1'] = [site('GitHub', 'https://github.com/')];
  const dev = await openDevice(browser, r, { local: baseLocal({ pages }) });
  r.ok(await dev.page.locator('#grid .tile').count() === 1, 'one tile');
  // dev.store.local 就是擴充功能的 chrome.storage.local，可以直接讀寫檢查
  await browser.close();
  r.done();
})();
```

- `openDevice(..., { bookmarks: true })`：附帶假的書籤（書籤列有「My Bank」，其他書籤有「Recipes/Pasta」）。
- `openDevice(..., { cloud })`：多台裝置傳入同一個 `new Cloud()`，就像登入同一個 Google 帳號，同步變更會即時送到其他裝置。
- `dev.open()`：在同一台「電腦」再開一個新分頁。

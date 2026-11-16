# Foyer — 發佈 Checklist

每次上傳 Chrome Web Store 前，按順序完成以下步驟。

---

## 1. 功能測試

- [ ] 先跑自動測試，全部通過（說明見 `tests/README.md`）：
  ```
  npm test
  ```
- [ ] 開新分頁，確認頁面正常載入（無 freeze、無紅色 console 錯誤）
- [ ] 新增 tile、重新命名、刪除
- [ ] **便條**（時間＋天氣下方的左欄）：新增便條、輸入文字（含數字、`/`、Ctrl+Z 不會觸發快捷鍵或復原 tiles）、換顏色、空白便條失焦自動消失、刪除有內容的便條會先確認；重開分頁後保留；tiles 從便條欄右邊開始排；視窗寬度 < 720px 時便條欄隱藏
- [ ] **便條跨裝置同步**（需開「跨裝置同步」）：A 寫便條 → B 開新分頁看到；B 正在打字時不會被 A 蓋掉；第一次在兩台都有便條的電腦開同步 → 兩邊便條合併；被同步取代前的便條在「從備份還原」裡找得到（標示「從其他裝置同步便條之前」）
- [ ] **沒有名字就留白**：新增網站只填網址、同步／匯入沒有標題的書籤 → tile 下方空白（不會自動填網址）；改名可清空名字
- [ ] **讀不到圖示的網站**（內網、demo、新網域）：顯示名字第一個字母的方塊，不是地球圖；所有主題一律黑底白字；group 內與搜尋結果同樣
- [ ] 拖曳排序、拖曳合併成 group
- [ ] 右鍵選單（Edit / Rename / Delete）
- [ ] Group overlay：開啟（3×3、每頁 9 格）、拖曳排序、超過 9 個自動分頁、關閉；開啟時 page bar 隱藏
- [ ] **10 頁系統**：點數字按鈕、鍵盤 1–9/0 切換；default 進入頁面 1
- [ ] **拖 tile 到數字按鈕**移到該頁；多選拖曳一起移動（clone 顯示數量 badge）
- [ ] **頁面命名**：雙擊或右鍵數字 → 命名；有名字的頁籤**直接顯示名稱取代數字**（所有頁籤，不只當前頁），太長會顯示「…」；hover 顯示完整名稱與對應數字鍵；數字鍵 1–9/0 照常切換；清空輸入 = 恢復數字
- [ ] 換頁、放 tiles、reload 後確認 tiles 留在正確的頁
- [ ] Quick pills：Sync bookmarks bar、Sync all bookmarks（**Clear all 不在首頁**，只在設定 → 資料）
- [ ] 設定 → 資料 → 清除所有圖示：清空**全部 10 頁**、確認 dialog 提到自動備份、可 Undo
- [ ] **自動備份**：清除全部後，關掉分頁再開仍可 Ctrl+Z／⌘Z；設定 → 資料 → 從備份還原 列出備份（時間、原因、網站數），還原後 tiles、自訂圖示、頁面名稱都回來
- [ ] Settings → Data：所有按鈕逐一測試（Sync / Import / Export / Clear）
- [ ] Export JSON → Import 還原（含 pages + 頁面名稱）；舊版 v1 備份（items）匯入後進到頁面 1
- [ ] Settings → Help：Restart tutorial 正常啟動；Rate Foyer 開啟商店評價頁
- [ ] Rate 卡片：條件觸發正常（安裝 7 天 + 開 30 次、tutorial 完成後）；Rate now / Later / No thanks 三鍵行為正確、不再重複騷擾
- [ ] Tutorial：9 步驟全部走完（Enter 鍵可逐步前進），Skip / Esc 正常
- [ ] 搜尋（`/` 或 Ctrl+K）：輸入關鍵字、鍵盤選擇、Enter 跳轉；結果涵蓋**所有頁面**的 tiles
- [ ] 主題切換（5 個 preset + 自訂色 + 背景圖）
- [ ] Window style 切換（Light / Dark）
- [ ] Tile size slider 調整
- [ ] 天氣 widget：顯示、點擊切換 °C/°F、更改城市（不應自動跳出定位權限）
- [ ] Undo（Ctrl+Z / ⌘Z）：含跨頁操作（移頁、清空全部）
- [ ] 鍵盤導航（方向鍵、Enter、Delete、Esc）
- [ ] 語言切換（設定 → 一般 → 語言）：English／繁體中文／简体中文／日本語 即時切換，重開分頁後保留；toast、tutorial、右鍵選單、天氣、確認框都跟著翻譯；搜尋列 placeholder 也跟著翻譯
- [ ] **搜尋引擎選擇**：點搜尋列左側圖示 → 選單顯示 6 個引擎（Google／Bing／DuckDuckGo／百度／Yahoo! JAPAN／Ecosia）；選擇後圖示與 placeholder 更新、Enter 用該引擎搜尋、重開分頁後保留
- [ ] **快搜網頁搜尋**（`/` 或 Ctrl+K）：輸入無結果的關鍵字 → 顯示「用 {引擎} 搜尋」列、Enter 直接搜尋；有結果時該列排在最後
- [ ] **跨裝置同步**（設定 → 資料）：開啟 toggle → toast 確認；改動 tiles 後在另一部裝置（或另一個 profile）確認同步；自訂圖示不同步（僅本機）；關閉 toggle 後此裝置不再同步
- [ ] **最常造訪建議**（新增網站視窗）：首次點「推薦我最常造訪的網站」→ Chrome 權限確認 → 顯示建議 chips；點 chip 直接加入；已在格子上的網站不出現
- [ ] **自訂圖示**（右鍵 → Edit）：上傳圖片 → 預覽更新、儲存後 tile 顯示自訂圖示；「重設圖示」恢復 favicon
- [ ] **視窗樣式 Auto**：跟隨系統深色模式即時切換；重開分頁後保留
- [ ] **同步到 Chrome 書籤**（設定 → 資料，預設關閉）：開啟後「其他書籤 → Foyer」出現，每頁一個子資料夾、group 是子資料夾；改名、排序、刪除單一 tile 後書籤跟著變；**其他書籤完全沒被動到**
- [ ] 書籤同步 + 清除全部：舊的 Foyer 資料夾整包搬到「Foyer 封存」（內容完整），新的 Foyer 資料夾是空的；Ctrl+Z 後重建
- [ ] 關閉書籤同步後，改動 tiles 不再影響書籤
- [ ] 書籤同步開啟並清除全部後，按「同步所有書籤」／開「匯入書籤」：**不會**把「Foyer」「Foyer 封存」資料夾匯回來
- [ ] 兩台裝置開跨裝置同步：在 A 改 tiles，久沒開的 B 打開新分頁 → B 拿到 A 的版本，A 的改動沒被蓋掉

---

## 2. 版本號更新

- [ ] 更新 `manifest.json` 中的 `"version"`
- [ ] 確認 `PRIVACY.md` 內容為最新（年份、功能描述正確；含跨裝置同步、topSites、書籤同步與自動備份說明）
- [ ] `optional_permissions` 只有 `topSites`（不要把它移進 `permissions`，否則所有用戶會看到權限警告）

---

## 3. 推送到 GitHub

- [ ] 所有變更已 commit（`git status` 確認乾淨）
- [ ] Push 到 `main` branch（透過 MCP 或 git push）
- [ ] 確認 GitHub 上 `main` branch 為最新 commit

---

## 4. 打包 ZIP

- [ ] 在 Foyer 資料夾執行打包，**只包含**擴充功能需要的檔案（避免把 node_modules、開發檔案、demo 檔包進去）：
  ```
  zip -r foyer-vX.X.X.zip manifest.json newtab.html newtab.js newtab.css background.js icons
  ```
- [ ] 解壓縮確認內容正確（manifest.json、newtab.html、newtab.js、newtab.css、background.js、icons/，**沒有其他檔案**）

---

## 5. 上傳 Chrome Web Store

- [ ] 前往 [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [ ] 選擇 Foyer → **Package** → 上傳新 ZIP
- [ ] 確認 Privacy Policy URL 有效：`https://github.com/YenchiSomnambule/Foyer/blob/main/PRIVACY.md`
- [ ] 填寫版本說明（What's new）
- [ ] 點擊 **Submit for review**

---

## 6. 上傳後確認

- [ ] Web Store 頁面顯示新版本號
- [ ] 安裝後測試：點 Enable now 不 freeze、功能正常
- [ ] 確認 Privacy Policy 連結可正常開啟
- [ ] 更新本檔案底部的「上次發佈版本」

---

*上次發佈版本：2.1.0*

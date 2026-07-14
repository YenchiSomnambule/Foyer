# Foyer — 發佈 Checklist

每次上傳 Chrome Web Store 前，按順序完成以下步驟。

---

## 1. 功能測試

- [ ] 開新分頁，確認頁面正常載入（無 freeze、無紅色 console 錯誤）
- [ ] 新增 tile、重新命名、刪除
- [ ] 拖曳排序、拖曳合併成 group
- [ ] 右鍵選單（Edit / Rename / Delete）
- [ ] Group overlay：開啟（4×4、每頁 16 格）、拖曳排序、超過 16 個自動分頁、關閉；開啟時 page bar 隱藏
- [ ] **10 頁系統**：點數字按鈕、鍵盤 1–9/0 切換；default 進入頁面 1
- [ ] **拖 tile 到數字按鈕**移到該頁；多選拖曳一起移動（clone 顯示數量 badge）
- [ ] **頁面命名**：右鍵數字 → 命名；當前頁顯示「數字 · 名稱」，其他頁 hover 有 tooltip；清空輸入 = 移除名稱
- [ ] 換頁、放 tiles、reload 後確認 tiles 留在正確的頁
- [ ] Quick pills：Sync bookmarks bar、Sync all bookmarks、Clear all tiles（清空**全部 10 頁**、確認 dialog、可 Undo）
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

---

## 2. 版本號更新

- [ ] 更新 `manifest.json` 中的 `"version"`
- [ ] 確認 `PRIVACY.md` 內容為最新（年份、功能描述正確；含跨裝置同步與 topSites 說明）
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

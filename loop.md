# Foyer — 發佈 Checklist

每次上傳 Chrome Web Store 前，按順序完成以下步驟。

---

## 1. 功能測試

- [ ] 開新分頁，確認頁面正常載入（無 freeze、無紅色 console 錯誤）
- [ ] 新增 tile、重新命名、刪除
- [ ] 拖曳排序、拖曳合併成 group
- [ ] 右鍵選單（Edit / Rename / Delete）
- [ ] Group overlay：開啟、拖曳排序、關閉
- [ ] Quick pills：Sync bookmarks bar、Sync all bookmarks、Clear all tiles（需確認 dialog）
- [ ] Settings → Data：所有按鈕逐一測試（Sync / Import / Export / Clear）
- [ ] Settings → Help：Restart tutorial 正常啟動
- [ ] Tutorial：7 步驟全部走完，Skip 正常
- [ ] 搜尋（`/` 或 Ctrl+K）：輸入關鍵字、鍵盤選擇、Enter 跳轉
- [ ] 主題切換（5 個 preset + 自訂色 + 背景圖）
- [ ] Window style 切換（Light / Dark）
- [ ] Tile size slider 調整
- [ ] 天氣 widget：顯示、點擊切換 °C/°F、更改城市
- [ ] Undo（Ctrl+Z / ⌘Z）
- [ ] 鍵盤導航（方向鍵、Enter、Delete、Esc）

---

## 2. 版本號更新

- [ ] 更新 `manifest.json` 中的 `"version"`
- [ ] 確認 `PRIVACY.md` 內容為最新（年份、功能描述正確）

---

## 3. 推送到 GitHub

- [ ] 所有變更已 commit（`git status` 確認乾淨）
- [ ] Push 到 `main` branch（透過 MCP 或 git push）
- [ ] 確認 GitHub 上 `main` branch 為最新 commit

---

## 4. 打包 ZIP

- [ ] 在 Foyer 資料夾執行打包，排除不必要的檔案：
  ```
  zip -r foyer-vX.X.X.zip . \
    --exclude "*.git*" \
    --exclude "*.DS_Store" \
    --exclude "loop.md" \
    --exclude "*.md"
  ```
- [ ] 解壓縮確認內容正確（manifest.json、newtab.html、newtab.js、newtab.css、background.js、icons/）

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

---

*上次發佈版本：2.1.0*

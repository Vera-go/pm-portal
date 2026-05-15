# PM 工作流程 Portal

Jira 工單查詢 + AI 分析工具

## 部署步驟

### 1. 上傳到 GitHub

1. 去 https://github.com/new 建立新 repo（例如 `pm-portal`）
2. 把這個資料夾的所有檔案上傳上去

   **方法 A（網頁上傳）：**
   - 進入新建的 repo
   - 點 "uploading an existing file"
   - 把 `index.html`、`vercel.json`、`api/` 資料夾拖進去
   - Commit changes

   **方法 B（Git 指令）：**
   ```bash
   git init
   git add .
   git commit -m "init pm portal"
   git remote add origin https://github.com/你的帳號/pm-portal.git
   git push -u origin main
   ```

### 2. 部署到 Vercel

1. 去 https://vercel.com 登入（用 GitHub 帳號）
2. 點 "Add New Project"
3. 選擇剛才建立的 `pm-portal` repo
4. 點 "Deploy"（不需要改任何設定）

### 3. 設定環境變數（重要！）

部署完成後：
1. 進入 Vercel 專案設定 → **Settings → Environment Variables**
2. 新增一個變數：
   - Name: `ANTHROPIC_API_KEY`
   - Value: 你的 Anthropic API Key（從 https://console.anthropic.com/settings/keys 取得）
3. 點 Save
4. 回到 Deployments，點 **Redeploy** 讓新設定生效

### 4. 完成！

Vercel 會給你一個網址（例如 `https://pm-portal-xxx.vercel.app`），
把這個連結分享給你的部門成員，大家都可以直接使用。

## 專案結構

```
pm-portal/
├── api/
│   ├── jira.js       ← 代理 n8n Webhook（查詢 Jira）
│   └── analyze.js    ← 代理 Claude API（AI 分析）
├── index.html        ← Portal 前端介面
├── vercel.json       ← Vercel 部署設定
└── README.md
```

## 功能

- 輸入 Jira 單號查詢 Summary / Description
- AI 產出需求 Checklist
- AI 產出主管摘要
- 最近查詢記錄
- 一鍵複製 / 在 Jira 開啟

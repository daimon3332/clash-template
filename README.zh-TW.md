# Clash Template

一個用於產生 Clash/Mihomo 設定的 Web 工具，支援範本管理、機場訂閱注入、靜態節點匯入，以及常見節點 URI 與 YAML 節點互轉。專案面向 Cloudflare Pages 部署，範本資料使用 Cloudflare KV 持久化。

[English](README.md) · [简体中文](README.zh-CN.md) · [**繁體中文**](README.zh-TW.md)

> 🌐 **示範網址：** [https://f903c54c.clash-template-dja.pages.dev/](https://f903c54c.clash-template-dja.pages.dev/)
>
> 🔑 **示範密碼：** `admin`

## 功能

- 內建 3 個不可刪除的範本：Windows、Linux 中國、Linux 全球
- 預設範本可線上編輯，自訂範本可新增、上傳、編輯、刪除
- 支援直接輸入完整 Clash/Mihomo YAML 作為範本
- 支援多條機場訂閱，自動寫入 `proxy-providers`、`节点选择`、機場策略群組
- 支援靜態節點輸入：多行 URI、帶有 `proxies:` 的 YAML、純 YAML 節點清單
- 提供 URI ↔ YAML 節點轉換頁面
- 支援存取密碼與管理員密碼
- 支援 Cloudflare Pages Functions + KV

## 支援協定

URI/YAML 轉換支援常見協定：

- `ss`
- `ssr`
- `vmess`
- `vless`
- `trojan`
- `hysteria`
- `hysteria2` / `hy2`
- `tuic`
- `socks` / `socks5`
- `http` / `https`
- `snell`
- `anytls`
- `ssh`
- `wireguard` / `wg`
- `mieru`

## 🚀 部署到 Cloudflare Pages

建議使用 Cloudflare Pages 的 Git 整合部署，不需要命令列，也不需要 `wrangler.toml`。

### 1️⃣ Fork 倉庫

[![Fork on GitHub](https://img.shields.io/badge/Fork_on_GitHub-181717?logo=github&logoColor=white)](https://github.com/daimon3332/clash-template/fork)

請先將本倉庫 Fork 到自己的 GitHub 帳號。Cloudflare 應連接你 Fork 後的倉庫，方便後續自行更新和部署。

### 2️⃣ 匯入 Cloudflare Pages

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy_to_Cloudflare_Pages-F38020?logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/workers-and-pages)

進入 **Workers & Pages**，依序選擇 **Create application** -> **Pages** -> **Connect to Git**，然後選擇剛才 Fork 的倉庫。

### 3️⃣ 設定建置參數

```text
Framework preset: Vite 或 None
Build command: npm run build
Build output directory: dist
Root directory: 留空
Production branch: main
```

確認設定後點擊 **Save and Deploy**。

### 4️⃣ 設定環境變數

進入 **Settings** -> **Variables and Secrets**，新增以下變數並選擇加密儲存：

| 變數 | 說明 |
| --- | --- |
| `ACCESS_PASSWORD` | 一般存取密碼 |
| `ADMIN_PASSWORD` | 管理員密碼，可進入範本管理 |
| `TOKEN_SECRET` | Token 簽章金鑰，建議設定隨機長字串 |

如果沒有設定 `ACCESS_PASSWORD` 和 `ADMIN_PASSWORD`，本機開發預設可用 `admin` 作為管理員密碼。正式環境建議務必設定上述變數。

### 5️⃣ 綁定 Cloudflare KV

進入 **Storage & Databases** -> **Workers KV** -> **Create namespace** 建立 KV，然後在 Pages 專案中新增綁定：

```text
Settings -> Bindings -> Add -> KV namespace
Variable name: TEMPLATE_KV
KV namespace: 你建立的 KV namespace
```

綁定名稱必須是 `TEMPLATE_KV`，否則範本儲存不會持久化。

### 6️⃣ 重新部署並驗證

新增或修改環境變數、KV 綁定後，進入 **Deployments** 並選擇 **Retry deployment**。

1. 使用 `ADMIN_PASSWORD` 登入。
2. 進入右上角 **範本管理**。
3. 修改任意範本並儲存。
4. 重新整理頁面後再次進入範本管理。
5. 如果修改仍然存在，表示 KV 綁定成功。

## 本機開發

建議一鍵啟動（前端建置 + Pages Functions，包含 `/api`）：

```bash
npm install
npm run dev:full
```

使用瀏覽器開啟終端顯示的本機位址（預設 `http://127.0.0.1:8788`）。本機未設定密碼時，可用 `admin` 登入（管理員）。

僅使用前端熱更新（`vite`，連接埠通常為 5173）時，需要**另開終端**先啟動 API：

```bash
# 終端 1：API（8788）
npm run dev:full

# 終端 2：前端 HMR（會將 /api 代理至 8788）
npm run dev
```

型別檢查與建置：

```bash
npm run typecheck
npm run build
```

沒有綁定 `TEMPLATE_KV` 時，範本資料使用記憶體儲存；重新啟動本機預覽後會遺失。頁面右上角會顯示「記憶體儲存」提示。

## 範本注入規則

- 靜態節點會寫入頂層 `proxies`
- 機場訂閱會寫入頂層 `proxy-providers`
- 機場名稱會加入 `节点选择` 策略群組
- 每個機場會自動新增一個 `type: select` 且 `use: [機場名稱]` 的策略群組
- 如果範本不存在對應的頂層欄位，會自動建立

## 專案結構

```text
src/                  前端頁面與轉換邏輯
functions/api/         Cloudflare Pages API
functions/_shared/     產生、驗證、範本儲存等共用邏輯
windows.yaml           預設 Windows 範本
linux-cn.yaml          預設 Linux 中國範本
linux-global.yaml      預設 Linux 全球範本
```

---

## 友情連結

- [linux.do](https://linux.do)：**學AI，上L站！！！**
- [Nodeseek.com](https://www.nodeseek.com)：**Nodeseek 是一個面向 Web 開發、託管、VPS/伺服器及其他極客技術愛好者的社群。**

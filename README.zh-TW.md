# Clash Template

一個用於產生 Clash/Mihomo 設定的 Web 工具，支援範本管理、機場訂閱注入、靜態節點匯入，以及常見節點 URI 與 YAML 節點互轉。專案面向 Cloudflare Pages 部署，範本資料使用 Cloudflare KV 持久化。

[English](README.md) · [简体中文](README.zh-CN.md) · [**繁體中文**](README.zh-TW.md)

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

## Cloudflare Pages 部署

建議使用 Cloudflare Dashboard 的 Git 整合部署，不需要命令列，也不需要 `wrangler.toml`。本倉庫已移除 `wrangler.toml`，KV 綁定由 Cloudflare 網頁後台管理。

1. 開啟 Cloudflare Dashboard，進入 **Workers & Pages**。
2. 點擊 **Create application**。
3. 選擇 **Pages**。
4. 選擇 **Connect to Git**，連接本倉庫。
5. 建置設定：

```text
Framework preset: Vite 或 None
Build command: npm run build
Build output directory: dist
Root directory: 留空
Production branch: master
```

6. 點擊 **Save and Deploy**。

## 環境變數

進入 Pages 專案：

```text
Settings -> Variables and Secrets
```

新增以下變數，建議全部選擇加密儲存：

| 變數 | 說明 |
| --- | --- |
| `ACCESS_PASSWORD` | 一般存取密碼 |
| `ADMIN_PASSWORD` | 管理員密碼，可進入範本管理 |
| `TOKEN_SECRET` | Token 簽章金鑰，建議設定隨機長字串 |

如果沒有設定 `ACCESS_PASSWORD` 和 `ADMIN_PASSWORD`，本機開發預設可用 `admin` 作為管理員密碼。正式環境建議務必設定上述變數。

## Cloudflare KV 綁定

先在 Cloudflare Dashboard 建立 KV：

```text
Storage & Databases / Workers KV -> Create namespace
```

然後進入 Pages 專案新增綁定：

```text
Settings -> Bindings -> Add -> KV namespace
Variable name: TEMPLATE_KV
KV namespace: 你建立的 KV namespace
```

注意：綁定名稱必須是 `TEMPLATE_KV`，否則範本儲存不會持久化。

新增或修改環境變數、KV 綁定後，需要重新部署一次：

```text
Pages 專案 -> Deployments -> Retry deployment
```

## 部署後驗證

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

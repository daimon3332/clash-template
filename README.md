# Clash Template

A web tool for generating Clash/Mihomo configurations. It supports template management, proxy provider subscription injection, static node imports, and conversion between common node URIs and YAML nodes. The project is designed for deployment on Cloudflare Pages, with template data persisted in Cloudflare KV.

[**English**](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

> 🌐 **Live demo:** [https://f903c54c.clash-template-dja.pages.dev/](https://f903c54c.clash-template-dja.pages.dev/)
>
> 🔑 **Demo password:** `admin`

## Features

- Three built-in templates that cannot be deleted: Windows, Linux China, and Linux Global
- Online editing for default templates, plus creation, upload, editing, and deletion of custom templates
- Direct input of complete Clash/Mihomo YAML configurations as templates
- Multiple proxy provider subscriptions, automatically added to `proxy-providers`, `节点选择`, and provider policy groups
- Static node input as multiline URIs, YAML containing `proxies:`, or bare YAML node lists
- URI ↔ YAML node conversion
- Access and administrator passwords
- Cloudflare Pages Functions + KV

## Supported Protocols

URI/YAML conversion supports common protocols:

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

## 🚀 Deploy to Cloudflare Pages

Cloudflare Pages Git integration is recommended. No command line or `wrangler.toml` is required.

### 1️⃣ Fork the repository

[![Fork on GitHub](https://img.shields.io/badge/Fork_on_GitHub-181717?logo=github&logoColor=white)](https://github.com/daimon3332/clash-template/fork)

Fork this repository to your own GitHub account first. Cloudflare should connect to your fork so that future updates and deployments remain under your control.

### 2️⃣ Import the fork into Cloudflare Pages

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy_to_Cloudflare_Pages-F38020?logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/workers-and-pages)

Open **Workers & Pages**, select **Create application** -> **Pages** -> **Connect to Git**, then choose your forked repository.

### 3️⃣ Configure the build

```text
Framework preset: Vite or None
Build command: npm run build
Build output directory: dist
Root directory: leave blank
Production branch: main
```

Click **Save and Deploy** after confirming the settings.

### 4️⃣ Set environment variables

Open **Settings** -> **Variables and Secrets**, then add the following encrypted values:

| Variable | Description |
| --- | --- |
| `ACCESS_PASSWORD` | Standard access password |
| `ADMIN_PASSWORD` | Administrator password for template management |
| `TOKEN_SECRET` | Token signing secret; use a long random string |

If neither `ACCESS_PASSWORD` nor `ADMIN_PASSWORD` is set, local development uses `admin` as the default administrator password. Set these variables in production.

### 5️⃣ Bind Cloudflare KV

Create a namespace under **Storage & Databases** -> **Workers KV** -> **Create namespace**. Then open the Pages project and add a binding:

```text
Settings -> Bindings -> Add -> KV namespace
Variable name: TEMPLATE_KV
KV namespace: your KV namespace
```

The binding name must be `TEMPLATE_KV`; otherwise, saved template changes will not persist.

### 6️⃣ Redeploy and verify

After adding or changing environment variables or the KV binding, open **Deployments** and select **Retry deployment**.

1. Sign in with `ADMIN_PASSWORD`.
2. Open **Template Management** in the upper-right corner.
3. Edit and save any template.
4. Refresh the page and reopen Template Management.
5. If the change remains, the KV binding is working.

## Local Development

For a one-command startup that builds the frontend and runs Pages Functions, including `/api`:

```bash
npm install
npm run dev:full
```

Open the local address shown in the terminal (default: `http://127.0.0.1:8788`). If no local password is configured, sign in as an administrator with `admin`.

For frontend-only hot module replacement with `vite` (usually on port 5173), start the API in a separate terminal first:

```bash
# Terminal 1: API (8788)
npm run dev:full

# Terminal 2: frontend HMR (proxies /api to 8788)
npm run dev
```

Type-check and build:

```bash
npm run typecheck
npm run build
```

Without a `TEMPLATE_KV` binding, template data is stored in memory and is lost when the local preview restarts. The upper-right corner of the page displays an “In-memory storage” indicator.

## Template Injection Rules

- Static nodes are written to the top-level `proxies` field
- Proxy provider subscriptions are written to the top-level `proxy-providers` field
- Provider names are added to the `节点选择` policy group
- Each provider gets a `type: select` policy group with `use: [provider name]`
- Missing top-level fields are created automatically

## Project Structure

```text
src/                  Frontend pages and conversion logic
functions/api/         Cloudflare Pages API
functions/_shared/     Shared generation, authentication, and template storage logic
windows.yaml           Default Windows template
linux-cn.yaml          Default Linux China template
linux-global.yaml      Default Linux Global template
```

---

## Community

- [linux.do](https://linux.do): **Learn AI on L-Station!!!**
- [Nodeseek.com](https://www.nodeseek.com): **Nodeseek is a place for people who love web development, hosting, VPS/server, and other geek topics.**

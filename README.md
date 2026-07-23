# Clash Template

一个用于生成 Clash/Mihomo 配置的 Web 工具，支持模板管理、机场订阅注入、静态节点导入，以及常见节点 URI 与 YAML 节点互转。项目面向 Cloudflare Pages 部署，模板数据使用 Cloudflare KV 持久化。

## 功能

- 内置 3 个不可删除模板：Windows、Linux 国内、Linux 国外
- 默认模板可在线编辑，自定义模板可新增、上传、编辑、删除
- 支持直接输入完整 Clash/Mihomo YAML 作为模板
- 支持多条机场订阅，自动写入 `proxy-providers`、`节点选择`、机场策略组
- 支持静态节点输入：多行 URI、带 `proxies:` 的 YAML、裸 YAML 节点列表
- 提供 URI ↔ YAML 节点转换页面
- 支持访问密码与管理员密码
- 支持 Cloudflare Pages Functions + KV

## 支持协议

URI/YAML 转换支持常见协议：

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

推荐使用 Cloudflare Dashboard 的 Git 集成部署，不需要命令行，也不需要 `wrangler.toml`。本仓库已移除 `wrangler.toml`，KV 绑定由 Cloudflare 网页后台管理。

1. 打开 Cloudflare Dashboard，进入 **Workers & Pages**。
2. 点击 **Create application**。
3. 选择 **Pages**。
4. 选择 **Connect to Git**，连接本仓库。
5. 构建设置：

```text
Framework preset: Vite 或 None
Build command: npm run build
Build output directory: dist
Root directory: 留空
Production branch: master
```

6. 点击 **Save and Deploy**。

## 环境变量

进入 Pages 项目：

```text
Settings -> Variables and Secrets
```

添加以下变量，建议都选择加密保存：

| 变量 | 说明 |
| --- | --- |
| `ACCESS_PASSWORD` | 普通访问密码 |
| `ADMIN_PASSWORD` | 管理员密码，可进入模板管理 |
| `TOKEN_SECRET` | Token 签名密钥，建议设置随机长字符串 |

如果没有设置 `ACCESS_PASSWORD` 和 `ADMIN_PASSWORD`，本地开发默认可用 `admin` 作为管理员密码。生产环境建议务必设置上述变量。

## Cloudflare KV 绑定

先在 Cloudflare Dashboard 创建 KV：

```text
Storage & Databases / Workers KV -> Create namespace
```

然后进入 Pages 项目添加绑定：

```text
Settings -> Bindings -> Add -> KV namespace
Variable name: TEMPLATE_KV
KV namespace: 你创建的 KV namespace
```

注意：绑定名必须是 `TEMPLATE_KV`，否则模板保存不会持久化。

添加或修改环境变量、KV 绑定后，需要重新部署一次：

```text
Pages 项目 -> Deployments -> Retry deployment
```

## 部署后验证

1. 用 `ADMIN_PASSWORD` 登录。
2. 进入右上角 **模板管理**。
3. 修改任意模板并保存。
4. 刷新页面后再次进入模板管理。
5. 如果修改仍然存在，说明 KV 绑定成功。

## 本地开发

推荐一键启动（前端构建 + Pages Functions，含 `/api`）：

```bash
npm install
npm run dev:full
```

浏览器打开终端提示的本地地址（默认 `http://127.0.0.1:8788`）。本地未设置密码时，可用 `admin` 登录（管理员）。

仅前端热更新（`vite`，端口通常 5173）时，需要**另开终端**先启动 API：

```bash
# 终端 1：API（8788）
npm run dev:full

# 终端 2：前端 HMR（会把 /api 代理到 8788）
npm run dev
```

类型检查与构建：

```bash
npm run typecheck
npm run build
```

没有绑定 `TEMPLATE_KV` 时，模板数据使用内存存储；重启本地预览后会丢失。页面右上角会显示「内存存储」提示。

## 模板注入规则

- 静态节点会写入顶层 `proxies`
- 机场订阅会写入顶层 `proxy-providers`
- 机场名称会加入 `节点选择` 策略组
- 每个机场会自动新增一个 `type: select` 且 `use: [机场名]` 的策略组
- 如果模板不存在对应顶层字段，会自动创建

## 项目结构

```text
src/                  前端页面与转换逻辑
functions/api/         Cloudflare Pages API
functions/_shared/     生成、鉴权、模板存储等共享逻辑
windows.yaml           默认 Windows 模板
linux-cn.yaml          默认 Linux 国内模板
linux-global.yaml      默认 Linux 国外模板
```

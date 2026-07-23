# 前端技术栈

前端使用轻量技术栈实现，核心是 `Vite + React + TypeScript + 原生 CSS`，没有引入 Ant Design、Element、Tailwind、shadcn/ui 等 UI 框架。

## 技术组成

| 技术 | 作用 |
| --- | --- |
| `Vite` | 前端开发与生产构建，输出静态资源到 `dist` |
| `React` | 页面组件、状态管理与交互逻辑 |
| `TypeScript` | 类型约束，管理模板、订阅、角色、API 返回值等数据结构 |
| 原生 CSS | 手写 UI 样式，控制浅色蓝绿工具站风格、双栏布局、卡片、圆角和代码编辑器式预览 |
| `yaml` | 解析 YAML 节点，用于 URI 与 YAML 节点互转 |
| 浏览器原生 API | 使用 `fetch`、`localStorage`、`FileReader`、`Blob`、`Clipboard API` 实现请求、登录状态、上传、下载和复制 |

## 前端目录

```text
src/App.tsx              主页面、页面切换、表单状态、API 调用
src/main.tsx             React 入口
src/styles.css           全局 UI 样式
src/lib/nodeConverter.ts URI / YAML 节点转换逻辑
src/lib/types.ts         前端类型定义
public/favicon.svg       网站图标
```

## UI 风格

整体 UI 采用浅色、蓝绿、简洁工具站风格：全宽双栏布局、轻量卡片、圆角控件、低透明玻璃感，以及等宽字体的代码编辑器式预览区域。

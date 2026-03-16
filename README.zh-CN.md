<p align="center">
  <img src="public/icons/tinydo-logo-dark.svg" width="80" height="80" alt="TinyDo Logo" />
</p>

<h1 align="center">TinyDo</h1>

<p align="center">
  轻量、优雅的桌面待办应用，基于 Tauri&nbsp;v2&nbsp;+&nbsp;React&nbsp;+&nbsp;TypeScript 构建。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-2.0.0-blue?style=flat-square" />
  <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-24C8D8?style=flat-square&logo=tauri&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows&logoColor=white" />
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

<p align="center">
  <img src="public/poster.png" width="720" alt="TinyDo 截图" />
</p>

---

## 功能特性

- **任务管理** — 创建、编辑、拖拽排序、完成任务，全程丝滑动画
- **优先级指示** — 数字编号 + 渐变色条，一眼看清任务轻重
- **子任务** — 将任务拆分为子任务并跟踪进度；逾期未完成的子任务自动拆分到第二天
- **多日持续** — 任务可跨越最多 5 天，自动在对应日期显示
- **交互式时间轴** — 可视化日程安排；拖拽调整时间段和时间点
- **标签与筛选** — 彩色标签分组管理，支持任意组合筛选
- **Mini 模式** — 紧凑的置顶小窗口，支持真透明，随时掌握今日进度
- **深色 / 浅色主题** — 无缝切换主题，应用图标随主题变化
- **系统托盘** — 关闭窗口自动最小化到托盘，单击恢复
- **任务提醒** — Rust 端精确定时提醒，窗口最小化时也能可靠触发
- **导入 / 导出** — 通过 JSON 文件完整导入导出数据，文件 IO 由 Rust 后端处理
- **双语界面** — 中文 / 英文即时切换
- **今天 / 明天规划** — 双面板规划，可配置明日规划解锁时间
- **全局快捷键** — `Ctrl+Shift+T` 快速显示/隐藏窗口
- **开机自启动** — 可在设置中开启，登录系统时自动启动

## v2.0 更新内容

- **SQLite 持久化** — 数据从 localStorage 迁移至本地 SQLite 数据库，突破容量限制，提升可靠性。从 v1 升级时数据自动迁移。
- **Rust 端提醒系统** — 提醒调度从前端 15 秒轮询改为 Rust 端 `tokio` 精确定时器，窗口最小化/隐藏时仍可靠工作。
- **Rust 端文件 IO** — 导出、导入、海报保存全部在 Rust 端执行，性能更好、更安全。
- **全局快捷键** — 按 `Ctrl+Shift+T` 可在任何地方呼出/隐藏 TinyDo 窗口。
- **开机自启动** — 可选的系统登录时自动启动，在设置面板中配置。
- **安全加固** — 启用 Content Security Policy，前端文件系统权限已移除（所有 IO 通过 Rust invoke 命令）。
- **结构化错误处理** — 统一 `AppError` 类型（thiserror），文件日志（tauri-plugin-log）。
- **模块化 Rust 架构** — 后端代码按职责拆分为 models/error/db/commands/reminders 模块，含 26 个单元测试。

## 下载安装

前往 [**Releases**](https://github.com/Hanziwww/tinydo/releases) 页面下载最新安装包，开箱即用。

## 从源码构建

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install)（stable 工具链）
- [Tauri v2 系统依赖](https://v2.tauri.app/start/prerequisites/)

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/Hanziwww/tinydo.git
cd tinydo

# 安装前端依赖
npm install

# 开发模式运行
npm run tauri dev

# 构建生产版本
npm run tauri build
```

安装包将生成在 `src-tauri/target/release/bundle/nsis/` 目录下。

## 项目结构

```
tinydo/
├── public/                     # 静态资源（图标、海报）
├── src/                        # 前端（React + TypeScript）
│   ├── components/             # React UI 组件
│   ├── hooks/                  # 自定义 React Hooks
│   ├── i18n/                   # 国际化（中文 / 英文）
│   ├── lib/
│   │   ├── backend.ts          # Rust invoke 命令的类型化封装
│   │   ├── init.ts             # 应用初始化 & localStorage→SQLite 迁移
│   │   ├── export.ts           # 导入导出编排（dialog + invoke）
│   │   ├── poster.ts           # 海报渲染（html-to-image + invoke）
│   │   └── utils.ts            # 日期/时间工具函数
│   ├── stores/                 # Zustand 状态管理（内存状态，SQLite 持久化）
│   ├── types/                  # TypeScript 类型定义
│   ├── App.tsx                 # 根组件（含后端数据注入）
│   └── main.tsx                # 入口文件
├── src-tauri/                  # 后端（Rust）
│   ├── src/
│   │   ├── main.rs             # 入口
│   │   ├── lib.rs              # 应用初始化、插件注册、托盘、全局快捷键
│   │   ├── models.rs           # Serde 数据模型（镜像 TS 类型）
│   │   ├── error.rs            # AppError 枚举（thiserror）
│   │   ├── db.rs               # SQLite 建表、连接管理、CRUD 操作
│   │   ├── reminders.rs        # 基于 tokio 的提醒调度器
│   │   └── commands/           # Tauri invoke 命令处理
│   │       ├── todos.rs        # 待办 CRUD 命令
│   │       ├── tags.rs         # 标签 & 标签组命令
│   │       ├── settings.rs     # 设置 & 旧数据迁移命令
│   │       └── export.rs       # 导出/导入/海报文件 IO
│   ├── capabilities/           # Tauri 权限配置
│   └── Cargo.toml              # Rust 依赖
├── package.json
└── README.md
```

## 开源协议

[MIT](LICENSE)

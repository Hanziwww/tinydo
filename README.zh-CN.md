<p align="center">
  <img src="public/icons/tinydo-logo-dark.svg" width="80" height="80" alt="TinyDo Logo" />
</p>

<h1 align="center">TinyDo</h1>

<p align="center">
  轻量、优雅的桌面待办应用，基于 Tauri&nbsp;v2&nbsp;+&nbsp;React&nbsp;+&nbsp;TypeScript 构建。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-3.0.1-blue?style=flat-square" />
  <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-24C8D8?style=flat-square&logo=tauri&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D4?style=flat-square" />
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
- **任务关联** — 设置任务间的依赖、阻塞、相关关系
- **事件记录** — 每条任务变更自动记入事件日志，可追溯完整操作历史
- **完成预测** — 基于历史模式预测任务按时完成的概率
- **跨设备同步** — 可选的自建同步服务器，多台设备间同步数据，端到端加密
- **Mini 模式** — 紧凑的置顶小窗口，支持真透明，随时掌握今日进度
- **深色 / 浅色主题** — 无缝切换主题，应用图标随主题变化
- **系统托盘** — 关闭窗口自动最小化到托盘，单击恢复
- **任务提醒** — Rust 端精确定时提醒，窗口最小化时也能可靠触发
- **导入 / 导出** — 通过 JSON 文件完整导入导出数据，文件 IO 由 Rust 后端处理
- **双语界面** — 中文 / 英文即时切换
- **今天 / 明天规划** — 双面板规划，可配置明日规划解锁时间
- **历史归档** — 按日期浏览已完成和归档的任务
- **全局快捷键** — `Ctrl+Shift+T` 快速显示/隐藏窗口
- **开机自启动** — 可在设置中开启，登录系统时自动启动
- **多平台** — 支持 Windows、macOS、Linux

## v3.0 更新内容

- **跨设备同步** — 可选的同步功能，通过自建同步服务器在多台电脑间同步数据。使用同步码配对设备，无需注册账号。
- **端到端加密** — 所有同步数据在客户端使用 AES-256-GCM 加密（密钥由同步码通过 Argon2id 派生），服务器无法读取明文。
- **冲突解决** — 同一任务在两台设备上同时修改时，弹窗展示两个版本供用户选择。
- **自建同步服务器** — 独立的二进制文件（`tinydo-sync`），SQLite 存储，零配置即可运行。
- **事件追踪** — 每条任务变更自动记录到事件日志，以人类可读的方式展示。
- **完成预测** — 基于历史行为模式预测任务按时完成的概率。
- **任务关联** — 支持任务间的依赖 / 阻塞 / 相关关系。
- **多日任务** — 任务可跨越多天，支持逐日完成追踪。
- **历史归档** — 按日期浏览已完成和归档的任务记录。
- **多平台构建** — GitHub Actions CI 在每次发布时自动构建 Windows、macOS、Linux 三端安装包。

## 下载安装

前往 [**Releases**](https://github.com/Hanziwww/tinydo/releases) 页面下载最新安装包：

| 平台 | 文件 |
|------|------|
| Windows | `TinyDo_x.x.x_x64-setup.exe` (NSIS) |
| macOS | `TinyDo_x.x.x_aarch64.dmg` |
| Linux | `TinyDo_x.x.x_amd64.AppImage` / `.deb` |

## 同步服务器

TinyDo Sync 是一个可选的自建同步服务器，用于在多台设备间同步数据。

### 快速开始

1. 从 [Releases](https://github.com/Hanziwww/tinydo/releases) 下载 `tinydo-sync`（Windows `.exe` 或 Linux 二进制）。
2. 运行：

```bash
./tinydo-sync --port 8745
```

3. 在 TinyDo 中进入 **设置 → 数据同步**，填入服务器地址和同步码。
4. 在所有需要同步的设备上使用相同的同步码。

### 服务器参数

| 参数 | 环境变量 | 默认值 | 说明 |
|------|---------|--------|------|
| `--port` | `TINYDO_SYNC_PORT` | `8745` | 监听端口 |
| `--db-path` | `TINYDO_SYNC_DB` | `./tinydo-sync.db` | SQLite 数据库路径 |
| `--version` | — | — | 输出版本号并退出 |

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

### 构建同步服务器

```bash
cd sync-server
cargo build --release
# 二进制文件：target/release/tinydo-sync(.exe)
```

## 项目结构

```
tinydo/
├── public/                     # 静态资源（图标、海报）
├── src/                        # 前端（React + TypeScript）
│   ├── components/             # React UI 组件
│   │   └── sync/               # 同步设置、冲突对话框、状态指示器
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
│   │   ├── predict.rs          # 完成预测引擎
│   │   ├── reminders.rs        # 基于 tokio 的提醒调度器
│   │   ├── sync/               # 同步模块（客户端、加密、引擎、模型）
│   │   └── commands/           # Tauri invoke 命令处理
│   ├── capabilities/           # Tauri 权限配置
│   └── Cargo.toml              # Rust 依赖
├── sync-server/                # 自建同步服务器（Rust）
│   ├── src/
│   │   ├── main.rs             # 服务器入口（Axum + clap）
│   │   ├── db.rs               # 服务端 SQLite（同步组、设备、变更记录）
│   │   ├── routes.rs           # REST API 处理函数
│   │   └── models.rs           # 请求/响应类型
│   └── Cargo.toml
├── .github/workflows/          # CI（多平台测试）& Release（三平台构建）
├── package.json
└── README.md
```

## 开源协议

[MIT](LICENSE)

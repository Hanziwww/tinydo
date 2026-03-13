<p align="center">
  <img src="public/icons/tinydo-logo-dark.svg" width="80" height="80" alt="TinyDo Logo" />
</p>

<h1 align="center">TinyDo</h1>

<p align="center">
  轻量、优雅的桌面待办应用，基于 Tauri&nbsp;v2&nbsp;+&nbsp;React&nbsp;+&nbsp;TypeScript 构建。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" />
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
- **任务提醒** — 可配置的开始/结束前通知提醒
- **导入 / 导出** — 通过 JSON 文件完整导入导出数据，使用系统原生文件对话框
- **双语界面** — 中文 / 英文即时切换
- **今天 / 明天规划** — 双面板规划，可配置明日规划解锁时间

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
├── public/                  # 静态资源（图标、海报）
├── src/
│   ├── components/          # React UI 组件
│   ├── hooks/               # 自定义 React Hooks
│   ├── i18n/                # 国际化（中文 / 英文）
│   ├── lib/                 # 工具函数、导入导出逻辑
│   ├── stores/              # Zustand 状态管理
│   ├── types/               # TypeScript 类型定义
│   ├── App.tsx              # 根组件
│   ├── globals.css          # 全局样式与主题变量
│   └── main.tsx             # 入口文件
├── src-tauri/               # Tauri / Rust 后端
│   ├── src/lib.rs           # 应用初始化、托盘、窗口事件
│   ├── capabilities/        # 权限配置
│   └── icons/               # 打包图标
├── package.json
└── README.md
```

## 开源协议

[MIT](LICENSE)

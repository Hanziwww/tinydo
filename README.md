

# TinyDo

A lightweight, elegant desktop to-do app built with Tauri v2 + React + TypeScript.



[简体中文](README.zh-CN.md)

<img width="3399" height="2489" alt="poster" src="https://github.com/user-attachments/assets/d854419e-4fe7-4c4b-8fdd-ccefd61c5ff0" />


---

## Features

- **Task Management** — Create, edit, drag-to-reorder, and complete tasks with smooth animations
- **Priority Indicators** — Visual numbered priority and color-coded importance bars
- **Subtasks** — Break tasks into subtasks with progress tracking; overdue subtasks auto-split overnight
- **Multi-day Duration** — Tasks can span up to 5 days with cross-day visibility
- **Interactive Timeline** — Visualize your schedule; drag to adjust time ranges and points
- **Tags & Filters** — Organize with color-coded tags and tag groups; filter by any combination
- **Mini Mode** — Compact always-on-top window with real transparency for focus tracking
- **Dark / Light Theme** — Seamless theme switching with custom app icons per theme
- **System Tray** — Minimize to tray on close; restore with a single click
- **Notifications** — Configurable reminders before task start/end times
- **Import / Export** — Full data portability via JSON with native save/open dialogs
- **Bilingual UI** — Chinese and English interface with instant switching
- **Today / Tomorrow Planning** — Dual-board planning with configurable unlock hour

## Download

Grab the latest installer from the [**Releases**](https://github.com/Hanziwww/tinydo/releases) page — no build tools required.

## Getting Started

> If you prefer to build from source:

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/Hanziwww/tinydo.git
cd tinydo

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

The installer will be generated in `src-tauri/target/release/bundle/nsis/`.

## Project Structure

```
tinydo/
├── public/                  # Static assets (icons, poster)
├── src/
│   ├── components/          # React UI components
│   ├── hooks/               # Custom React hooks
│   ├── i18n/                # Internationalization (zh / en)
│   ├── lib/                 # Utilities & export/import logic
│   ├── stores/              # Zustand state stores
│   ├── types/               # TypeScript type definitions
│   ├── App.tsx              # Root component
│   ├── globals.css          # Global styles & theme variables
│   └── main.tsx             # Entry point
├── src-tauri/               # Tauri / Rust backend
│   ├── src/lib.rs           # App setup, tray, window events
│   ├── capabilities/        # Permission definitions
│   └── icons/               # Bundle icons
├── package.json
└── README.md
```

## License

[MIT](LICENSE)

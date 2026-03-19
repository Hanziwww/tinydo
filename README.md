<p align="center">
  <img src="public/icons/tinydo-logo-dark.svg" width="80" height="80" alt="TinyDo Logo" />
</p>

<h1 align="center">TinyDo</h1>

<p align="center">
  A lightweight, elegant desktop to-do app built with Tauri v2 + React + TypeScript.
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
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="public/poster_eng.png" width="720" alt="TinyDo Screenshot" />
</p>

## Download

Grab the latest installer from the [**Releases**](https://github.com/Hanziwww/tinydo/releases) page:

| Platform | File |
|----------|------|
| Windows  | `TinyDo_x.x.x_x64-setup.exe` (NSIS) |
| macOS    | `TinyDo_x.x.x_aarch64.dmg` |
| Linux    | `TinyDo_x.x.x_amd64.AppImage` / `.deb` |

## What's New in v3.0

- **Cross-device sync** — Optional sync via a self-hosted sync server. Pair devices with a shared sync key, no account needed.
- **End-to-end encryption** — All synced data is encrypted client-side with AES-256-GCM (key derived from the sync key via Argon2id). The server never sees plaintext.
- **Conflict resolution** — When the same item is modified on two devices, a dialog shows both versions and lets you choose which to keep.
- **Self-hosted sync server** — Standalone binary (`tinydo-sync`) with SQLite storage. Single file, zero config, just run it.
- **Event tracking** — Every task change is recorded in an event log with human-readable descriptions.
- **Completion prediction** — Predicts on-time completion probability based on your historical patterns.
- **Task relations** — Link tasks with depends-on / blocks / related-to relationships.
- **Multi-day tasks** — Tasks can span up to 5 days with per-day completion tracking.
- **History & archive** — Browse completed and archived tasks by date.
- **Multi-platform builds** — GitHub Actions CI produces installers for Windows, macOS, and Linux on every release.

## Sync Server

TinyDo Sync is an optional, self-hosted server for syncing data across devices.

### Quick Start

1. Download `tinydo-sync` from the [Releases](https://github.com/Hanziwww/tinydo/releases) page (Windows `.exe` or Linux binary).
2. Run it:

```bash
./tinydo-sync --port 8745
```

3. In TinyDo, go to **Settings → Data Sync**, enter the server address and a sync key.
4. Use the same sync key on all devices you want to sync.

### Server Options

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `--port` | `TINYDO_SYNC_PORT` | `8745` | Listen port |
| `--db-path` | `TINYDO_SYNC_DB` | `./tinydo-sync.db` | SQLite database path |
| `--version` | — | — | Print version and exit |

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

### Build the Sync Server

```bash
cd sync-server
cargo build --release
# Binary: target/release/tinydo-sync(.exe)
```

## Architecture

```
tinydo/
├── public/                     # Static assets (icons, poster)
├── src/                        # Frontend (React + TypeScript)
│   ├── components/             # React UI components
│   │   └── sync/               # Sync settings, conflict dialog, indicator
│   ├── i18n/                   # Internationalization (zh / en)
│   ├── lib/
│   │   ├── backend.ts          # Typed invoke() wrappers for all Rust commands
│   │   ├── init.ts             # App init & localStorage-to-SQLite migration
│   │   ├── export.ts           # Export/import orchestration (dialog + invoke)
│   │   ├── poster.ts           # Poster rendering (html-to-image + invoke)
│   │   └── utils.ts            # Date/time helpers
│   ├── stores/                 # Zustand state stores (in-memory, backed by SQLite)
│   ├── types/                  # TypeScript type definitions
│   ├── App.tsx                 # Root component with backend hydration
│   └── main.tsx                # Entry point
├── src-tauri/                  # Backend (Rust)
│   ├── src/
│   │   ├── main.rs             # Entry point
│   │   ├── lib.rs              # App setup, plugins, tray, global shortcut
│   │   ├── models.rs           # Serde data models (mirrors TS types)
│   │   ├── error.rs            # AppError enum (thiserror)
│   │   ├── db.rs               # SQLite schema, connection, CRUD operations
│   │   ├── predict.rs          # Completion prediction engine
│   │   ├── reminders.rs        # Tokio-based reminder scheduler
│   │   ├── sync/               # Sync module (client, crypto, engine, models)
│   │   └── commands/           # Tauri invoke command handlers
│   ├── capabilities/           # Tauri permission definitions
│   └── Cargo.toml              # Rust dependencies
├── sync-server/                # Self-hosted sync server (Rust)
│   ├── src/
│   │   ├── main.rs             # Server entry (Axum + clap)
│   │   ├── db.rs               # Server-side SQLite (sync groups, devices, changes)
│   │   ├── routes.rs           # REST API handlers
│   │   └── models.rs           # Request/response types
│   └── Cargo.toml
├── .github/workflows/          # CI (multi-platform test) & Release (3-platform build)
├── package.json
└── README.md
```

## License

[MIT](LICENSE)

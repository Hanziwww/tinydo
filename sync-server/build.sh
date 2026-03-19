#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p dist

echo "=== Building tinydo-sync for Linux (x86_64) ==="
if command -v cross &>/dev/null; then
    cross build --release --target x86_64-unknown-linux-gnu
    cp target/x86_64-unknown-linux-gnu/release/tinydo-sync dist/tinydo-sync-linux-amd64
    echo "  -> dist/tinydo-sync-linux-amd64"
else
    echo "  'cross' not found. Install with: cargo install cross"
    echo "  Skipping Linux build."
fi

echo ""
echo "=== Building tinydo-sync for Windows (x86_64) ==="
cargo build --release --target x86_64-pc-windows-msvc
cp target/x86_64-pc-windows-msvc/release/tinydo-sync.exe dist/tinydo-sync-windows-amd64.exe
echo "  -> dist/tinydo-sync-windows-amd64.exe"

echo ""
echo "=== Build complete ==="
ls -lh dist/

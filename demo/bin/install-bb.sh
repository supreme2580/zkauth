#!/bin/bash
set -euo pipefail

BB_VERSION="${BB_VERSION:-0.82.2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$PROJECT_DIR/bin/bb"

if [ -x "$DEST" ]; then
  echo "[bb] already installed at $DEST"
  exit 0
fi

echo "[bb] downloading v${BB_VERSION} for x86_64-linux..."
mkdir -p "$PROJECT_DIR/bin"
curl -sL "https://github.com/AztecProtocol/barretenberg/releases/download/v${BB_VERSION}/bb-x86_64-linux.tar.gz" | tar xz -C "$PROJECT_DIR/bin"
chmod +x "$DEST"
echo "[bb] installed at $DEST"

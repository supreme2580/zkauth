#!/bin/bash
set -euo pipefail

BB_VERSION="${BB_VERSION:-0.87.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$PROJECT_DIR/bin/bb"

if [ -x "$DEST" ]; then
  echo "[bb] already installed at $DEST"
  exit 0
fi

echo "[bb] downloading v${BB_VERSION} for amd64-linux..."
mkdir -p "$PROJECT_DIR/bin"

# Try primary repo first, fall back to aztec-packages
URL="https://github.com/AztecProtocol/barretenberg/releases/download/v${BB_VERSION}/barretenberg-amd64-linux.tar.gz"
FALLBACK_URL="https://github.com/AztecProtocol/aztec-packages/releases/download/v${BB_VERSION}/barretenberg-amd64-linux.tar.gz"

if ! curl -sL --fail "$URL" -o /dev/null 2>/dev/null; then
  URL="$FALLBACK_URL"
fi

curl -sL "$URL" | tar xz -C "$PROJECT_DIR/bin"
chmod +x "$DEST"
echo "[bb] installed at $DEST"

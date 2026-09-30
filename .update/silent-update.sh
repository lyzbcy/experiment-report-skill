#!/usr/bin/env bash
# Legacy entry point. Native Windows can invoke updater.cjs directly.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || exit 0
command -v node >/dev/null 2>&1 || exit 0
node "$SCRIPT_DIR/updater.cjs" "$@"

#!/usr/bin/env bash
set -euo pipefail

if command -v node >/dev/null 2>&1; then
  exec node server.js
fi

BUNDLED_NODE="/Users/zenvix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ -x "$BUNDLED_NODE" ]; then
  exec "$BUNDLED_NODE" server.js
fi

echo "Node.js is required to run this website."
exit 1

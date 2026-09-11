#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "请先安装 Node.js 24 LTS。"
  exit 1
fi
exec node --env-file-if-exists=.env server.mjs

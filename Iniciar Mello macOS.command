#!/bin/bash
set -e
cd "$(dirname "$0")"
# Finder shells may omit the Homebrew paths used by Node on Apple Silicon/Intel.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo 'Instale o Node.js 22 ou mais recente em nodejs.org e tente novamente.'
  read -r -p 'Pressione Enter para sair…'
  exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
npm run build
npm run app

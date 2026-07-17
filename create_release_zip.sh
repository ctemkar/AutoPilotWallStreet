#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
zip -r AutopilotAlpha_important.zip \
  README.md DETAILED_DOCUMENT.md AGENTS.md package.json tsconfig.json next.config.mjs postcss.config.mjs tailwind.config.js \
  server.ts server.js app/MarketTerminal.tsx app/tickerList.ts app/page.tsx app/layout.tsx app/globals.css \
  app/api/alpaca/route.ts app/api/gemini/analyze/route.ts SYSTEM_DOC.md

echo "Created: $(pwd)/AutopilotAlpha_important.zip"
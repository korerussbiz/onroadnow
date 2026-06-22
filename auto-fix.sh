#!/bin/bash
cd ~/onroadnow

# Run all auto‑fix tools quietly
ai-review-pipeline --fix api/*.js public/*.html > /dev/null 2>&1 &
devnog scan --fix > /dev/null 2>&1 &
npx eslint --fix api/*.js public/*.html > /dev/null 2>&1 &
npx prettier --write "api/*.js" "public/*.html" > /dev/null 2>&1 &

# Wait a moment for tools to start, then commit fixes
sleep 5
git add .
git commit -m "Auto-fix: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null
git push origin main 2>/dev/null

#!/bin/bash
cd ~/onroadnow || exit 1
LOG_FILE="$HOME/auto-heal.log"
touch "$LOG_FILE"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
log "===== Auto-Heal started ====="
MISSING=()
for pkg in axios yahoo-finance2 jsonwebtoken cookie google-auth-library ethers firebase-admin qrcode @solana/web3.js @walletconnect/modal express cors dotenv; do
  if ! npm list "$pkg" --depth=0 --silent 2>/dev/null | grep -q "$pkg@"; then
    MISSING+=("$pkg")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  log "Missing packages: ${MISSING[*]}. Installing..."
  npm install "${MISSING[@]}" --save --legacy-peer-deps >> "$LOG_FILE" 2>&1
fi
if ! node -c api/index.js 2>/dev/null; then
  log "⚠️ Syntax error. Attempting repair..."
  cp api/index.js "api/index.js.broken_$(date +%s)"
  sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' api/index.js
  echo '};' >> api/index.js
  if ! node -c api/index.js 2>/dev/null; then
    log "❌ Still broken. Reverting to Git."
    git checkout HEAD -- api/index.js 2>/dev/null
  else
    log "✅ Syntax fixed."
  fi
else
  log "✅ api/index.js syntax valid."
fi
if [ ! -f .env ]; then
  if [ -f .env.example ]; then cp .env.example .env; else echo "# Environment" > .env; fi
  log "✅ Created .env"
fi
HEALTH_URL="https://onroadnow.vercel.app/api/health"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" --max-time 10)
if [ "$HTTP_STATUS" != "200" ]; then
  log "⚠️ Health check failed (HTTP $HTTP_STATUS). Pushing fixes..."
  git add . && git commit -m "Auto-heal: fixes applied" >> "$LOG_FILE" 2>&1
  git push origin main >> "$LOG_FILE" 2>&1
  log "✅ Redeploy triggered."
fi
if ! pgrep -f "bridge.js" > /dev/null; then
  log "ℹ️ Starting local bridge..."
  node bridge.js >> "$LOG_FILE" 2>&1 &
  log "✅ Bridge started."
else
  log "✅ Bridge already running."
fi
log "===== Auto-Heal finished ====="

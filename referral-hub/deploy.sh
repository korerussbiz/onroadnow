#!/data/data/com.termux/files/usr/bin/bash
cd ~/referral-hub
if ! command -v vercel >/dev/null 2>&1; then
  npm i -g vercel
fi
vercel --prod --yes

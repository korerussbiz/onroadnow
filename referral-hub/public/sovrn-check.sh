#!/data/data/com.termux/files/usr/bin/bash
SECRET="${SOVRN_SECRET:?Set SOVRN_SECRET first}"
DOMAINS="$@"

if [ -z "$DOMAINS" ]; then
  echo "Usage: ./sovrn-check.sh amazon.com walmart.com nike.com"
  exit 1
fi

for d in $DOMAINS; do
  echo "── $d ──"
  curl -s -H "Authorization: secret $SECRET" \
    "https://publishers.viglink.com/api/merchant/search?domain=$d" \
    | jq -r '.merchants[]? | "\(.name) | approved:\(.approved) | CPA:\(.affiliateCPA) | CPC:\(.affiliateCPC) | domains:\(.domains | join(","))"' 2>/dev/null \
    || echo "  no result / not in network"
  sleep 3   # API rate limit: 1 query per 3 seconds
done

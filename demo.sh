#!/usr/bin/env bash
# demo.sh — GS1 Linkset Management Layer PoC walkthrough
# Usage: bash demo.sh
set -euo pipefail

BASE="http://localhost:8080"
GTIN="08859999000018"
TOKEN="demo-secret"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'

step() { echo -e "\n${YELLOW}▶ Step $1 — $2${NC}"; }
info() { echo -e "${CYAN}$1${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }

# ─── Kill any existing server on :8080 ───────────────────────────────────────
if lsof -ti:8080 > /dev/null 2>&1; then
  echo -e "${RED}Port 8080 in use — stopping old process...${NC}"
  kill "$(lsof -ti:8080)" 2>/dev/null || true
  sleep 1
fi

# ─── Start server with Ingest API enabled ────────────────────────────────────
echo -e "${CYAN}Starting server (INGEST_TOKEN=$TOKEN)...${NC}"
INGEST_TOKEN="$TOKEN" LOG_REQUESTS=0 npm start &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

# ─── Wait for server ready ───────────────────────────────────────────────────
for i in $(seq 1 30); do
  curl -sf "$BASE/health" > /dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "$BASE/health" > /dev/null 2>&1 || { echo "Server not ready after 15s — check logs"; exit 1; }
echo -e "${GREEN}Server ready.${NC}"

# ─── Step 0: Health check ────────────────────────────────────────────────────
step 0 "Health check"
info "GET $BASE/health"
curl -sf "$BASE/health" | python3 -m json.tool
ok "Service up"

# ─── Step 1: Resolver Description File ───────────────────────────────────────
step 1 "Resolver Description File"
info "GET $BASE/.well-known/gs1resolver"
curl -sf "$BASE/.well-known/gs1resolver" | python3 -m json.tool
ok "Resolver description returned"

# ─── Step 2: Ingest — create a linkset via PUT ───────────────────────────────
step 2 "Ingest — PUT linkset for GTIN $GTIN"
info "PUT $BASE/api/v1/linksets/01/$GTIN"
curl -sf -X PUT "$BASE/api/v1/linksets/01/$GTIN" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "links": {
      "https://gs1.org/voc/defaultLink": [
        {
          "href": "https://smartcatalog.example/catalog/Product/'"$GTIN"'?lang=th",
          "title": "ข้อมูลผลิตภัณฑ์",
          "hreflang": ["th"],
          "type": "text/html"
        }
      ],
      "https://gs1.org/voc/pip": [
        {
          "href": "https://smartcatalog.example/api/product/'"$GTIN"'",
          "title": "Product Info Page",
          "type": "application/json"
        }
      ]
    }
  }' | python3 -m json.tool
ok "Linkset ingested"

# ─── Step 3: Resolve — fetch linkset as application/linkset+json ─────────────
step 3 "Resolve — GET linkset JSON"
info "GET $BASE/01/$GTIN  (Accept: application/linkset+json)"
curl -sf "$BASE/01/$GTIN" \
  -H "Accept: application/linkset+json" | python3 -m json.tool
ok "Linkset resolved"

# ─── Step 4: Redirect — follow defaultLink ───────────────────────────────────
step 4 "Redirect — follow defaultLink"
info "GET $BASE/01/$GTIN  (Accept: text/html)"
curl -sv "$BASE/01/$GTIN" \
  -H "Accept: text/html" 2>&1 | grep -E "^(> GET|< HTTP|< [Ll]ocation)"
ok "Redirect issued (307 → defaultLink target)"

echo -e "\n${GREEN}Demo complete.${NC}"

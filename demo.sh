#!/usr/bin/env bash
# demo.sh — สาธิตชั้นจัดการชุดลิงก์ (ต้นแบบ) ตามโครงร่าง §4.2 และกรณีทดสอบในตาราง 4.2
#
#   bash demo.sh                สาธิตทีละขั้น กด Enter เพื่อไปขั้นถัดไป
#   bash demo.sh --auto         รันรวดเดียวไม่หยุด (ใช้ซ้อมก่อนสาธิต)
#   bash demo.sh --keep         ไม่ปิด server ตอนจบ จะได้เปิดดูใน Browser ต่อได้
#   bash demo.sh --no-browser   ไม่เปิดแท็บ Browser อัตโนมัติ
#   ROUNDS=1 bash demo.sh       จำนวนรอบของชุดทดสอบในขั้นที่ 5 (ค่าเริ่มต้น 3)
#
# ถ้ามี server ของต้นแบบทำงานอยู่ที่ PORT แล้ว (เช่นเปิดไว้ใน Terminal A ด้วย npm run demo:server)
# สคริปต์จะใช้ตัวนั้น และจะไม่ปิดหรือฆ่าโปรแกรมอื่นที่ใช้พอร์ตนั้นอยู่
# ข้อมูลที่สร้างในขั้นที่ 4 ถูกลบตอนจบขั้น ข้อมูลตัวอย่างของ T-01–T-12 จึงไม่ถูกแตะ
set -uo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
B="http://localhost:$PORT"
TOKEN="${INGEST_TOKEN:-demo-secret}"
ROUNDS="${ROUNDS:-3}"
G=08859999000018          # GTIN ตัวอย่างของ T-01–T-12
NEW=08859999000032        # GTIN ที่ลงทะเบียนใหม่ในขั้นที่ 4

AUTO=0; KEEP=0; BROWSER=1
for a in "$@"; do
  case "$a" in
    --auto) AUTO=1 ;;
    --keep) KEEP=1 ;;
    --no-browser) BROWSER=0 ;;
    -h|--help) sed -n 2,13p "$0"; exit 0 ;;
    *) echo "ไม่รู้จักตัวเลือก $a (ดู --help)"; exit 1 ;;
  esac
done
[ "$(uname)" = "Darwin" ] || BROWSER=0
[ "$AUTO" = 1 ] && BROWSER=0

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YEL=$'\033[1;33m'; CYN=$'\033[0;36m'; NC=$'\033[0m'
else
  BOLD=; DIM=; RED=; GRN=; YEL=; CYN=; NC=
fi

PASS=0; FAIL=0; STARTED=0; SERVER_PID=; MARK=

# ── helpers ────────────────────────────────────────────────────────────────
title()  { echo; echo "${BOLD}${YEL}━━ ขั้นที่ $1  $2 ━━${NC}"; }
say()    { echo "${CYN}พูด: $*${NC}"; }
note()   { echo "${DIM}$*${NC}"; }
pause()  { [ "$AUTO" = 1 ] && return 0; printf "\n${DIM}กด Enter เพื่อไปต่อ…${NC}"; read -r _ || true; }
openurl(){ [ "$BROWSER" = 1 ] && open "$1" >/dev/null 2>&1; return 0; }
pretty() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{s=s.trim();if(!s)return;try{console.log(JSON.stringify(JSON.parse(s),null,2))}catch{console.log(s)}})'; }
# sets MARK and counts the result (not called in a subshell, so the counters survive)
mark()   { if [ "$1" = 1 ]; then PASS=$((PASS+1)); MARK="${GRN}✓${NC}"; else FAIL=$((FAIL+1)); MARK="${RED}✗ คาดว่า $2${NC}"; fi; }

# Short form of the request: method, path, headers
describe() {
  local m=GET url="" h="" prev=""
  for a in "$@"; do
    case "$prev" in -H) h="$h [$a]" ;; -X) m="$a" ;; esac
    case "$a" in http*) url="${a#"$B"}" ;; esac
    prev="$a"
  done
  echo "$m $url$h"
}

# check ID "คำอธิบาย" สถานะที่คาด "ข้อความที่ต้องอยู่ใน Location (หรือว่าง)" [curl args…]
check() {
  local id="$1" desc="$2" want="$3" lwant="$4"; shift 4
  local hdr code loc vary ok=1
  hdr=$(curl -s -o /dev/null -D - "$@" | tr -d '\r')
  code=$(printf '%s\n' "$hdr" | awk 'NR==1{print $2}')
  loc=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="location:"{sub(/^[^ ]+ /,"");print}')
  vary=$(printf '%s\n' "$hdr" | awk 'tolower($1)=="vary:"{sub(/^[^ ]+ /,"");print}')
  [ "$code" = "$want" ] || ok=0
  if [ -n "$lwant" ]; then case "$loc" in *"$lwant"*) ;; *) ok=0 ;; esac; fi
  echo "  ${BOLD}${id}${NC}  ${DIM}$(describe "$@")${NC}"
  mark $ok "$want${lwant:+ และ Location มี $lwant}"
  echo "        ${BOLD}${code:-ไม่มีคำตอบ}${NC} $MARK  $desc"
  [ -n "$loc" ] && echo "        → $loc"
  [ -n "$vary" ] && echo "        Vary: $vary"
  return 0
}

# call ID "คำอธิบาย" สถานะที่คาด [curl args…] — แสดงสถานะและเนื้อหาคำตอบ
call() {
  local id="$1" desc="$2" want="$3"; shift 3
  local res code body ok=1
  res=$(curl -s -w $'\n%{http_code}' "$@")
  code="${res##*$'\n'}"; body="${res%$'\n'*}"
  [ "$code" = "$want" ] || ok=0
  echo "  ${BOLD}${id}${NC}  ${DIM}$(describe "$@")${NC}"
  mark $ok "$want"
  echo "        ${BOLD}${code}${NC} $MARK  $desc"
  [ -n "$body" ] && printf '%s' "$body" | pretty | head -n "${MAXLINES:-14}" | sed 's/^/        /'
  return 0
}

cleanup() {
  if [ "$STARTED" = 1 ] && [ -n "$SERVER_PID" ]; then
    if [ "$KEEP" = 1 ]; then
      echo; note "server ยังทำงานอยู่ (PID $SERVER_PID) ปิดด้วย: kill $SERVER_PID"
    else
      kill "$SERVER_PID" 2>/dev/null || true
    fi
  fi
}
trap cleanup EXIT
trap 'echo; exit 130' INT

# ── ขั้นที่ 0 ────────────────────────────────────────────────────────────────
title 0 "เตรียมระบบ"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 20 ]; then echo "${RED}ต้องใช้ Node 20 ขึ้นไป (ตอนนี้: $(node -v 2>/dev/null || echo ไม่พบ))${NC}"; exit 1; fi
echo "  Node $(node -v)"
echo "  unit test: $(node --test tests/unit.test.js tests/ingest.test.js 2>&1 | awk '/^# pass/{p=$3} /^# fail/{f=$3} END{printf "ผ่าน %s ไม่ผ่าน %s", p, f}')"

if curl -sf "$B/health" >/dev/null 2>&1; then
  echo "  ใช้ server ที่เปิดอยู่แล้วที่ $B"
  ing=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$B/api/v1/linksets/01/$G")
  case "$ing" in
    200) ;;
    404) echo "${RED}server นี้ไม่ได้เปิด Link Ingest API ให้ปิดแล้วเปิดใหม่ด้วย: npm run demo:server${NC}"; exit 1 ;;
    403) echo "${RED}โทเค็นไม่ตรงกับ server ให้รันด้วย INGEST_TOKEN=<โทเค็นของ server> bash demo.sh${NC}"; exit 1 ;;
    *)   echo "${RED}ตรวจ Link Ingest API ไม่ผ่าน (HTTP $ing)${NC}"; exit 1 ;;
  esac
else
  if lsof -ti ":$PORT" >/dev/null 2>&1; then
    echo "${RED}พอร์ต $PORT มีโปรแกรมอื่นใช้อยู่ (ไม่ใช่ต้นแบบ) ให้ปิดก่อน หรือรันด้วย PORT=8090 bash demo.sh${NC}"; exit 1
  fi
  mkdir -p results
  PORT="$PORT" RESOLVER_ROOT="$B" INGEST_TOKEN="$TOKEN" LOG_REQUESTS=1 node src/server.js > results/demo-server.log 2>&1 &
  SERVER_PID=$!; STARTED=1
  for _ in $(seq 1 50); do curl -sf "$B/health" >/dev/null 2>&1 && break; sleep 0.2; done
  if ! curl -sf "$B/health" >/dev/null 2>&1; then echo "${RED}เปิด server ไม่สำเร็จ ดู results/demo-server.log${NC}"; exit 1; fi
  echo "  เปิด server ให้แล้วที่ $B (PID $SERVER_PID)"
  note "  ให้ Terminal A แสดง log คำขอด้วย: tail -f results/demo-server.log"
fi

# ข้อมูลตัวอย่างต้องเป็นของเดิม (demo.sh รุ่นก่อนเคย PUT ทับ GTIN นี้)
pip=$(curl -s -o /dev/null -w '%{redirect_url}' -H 'Accept: text/html' "$B/01/$G?linkType=gs1:pip")
case "$pip" in
  *brand.example/th/products*) ;;
  *) echo "${YEL}คำเตือน: ข้อมูลของ GTIN $G ใน server ถูกแก้ไขไปแล้ว ให้ปิดแล้วเปิด server ใหม่ก่อนสาธิต${NC}" ;;
esac

echo; call "/health" "server ทำงานและโหลดลิงก์แล้ว" 200 "$B/health"
echo; call "T-09" "แฟ้มพรรณนารีโซลเวอร์ (ระบบปัจจุบันได้ 404)" 200 "$B/.well-known/gs1resolver"
openurl "$B/.well-known/gs1resolver"
pause

# ── ขั้นที่ 1 ────────────────────────────────────────────────────────────────
title 1 "สถาปัตยกรรม: ท่อประมวลผล 5 ชั้น (รูป 4.3)"
for row in "1|URI Parser|แยกกุญแจหลัก ตัวขยายกุญแจ และพารามิเตอร์|src/pipeline/parser.js" \
           "2|Identifier Validator|ไวยากรณ์ Mod-10 และช่วงเลขบ่งชี้บริษัท|src/pipeline/validator.js" \
           "3|Linkset Resolver|ค้นชุดลิงก์ เลือก linkType หรือลิงก์ปริยาย|src/pipeline/linksetResolver.js" \
           "4|Content Negotiator|Accept / Accept-Language และ Vary|src/pipeline/contentNegotiator.js" \
           "5|Response Builder|3xx / 200 ชุดลิงก์ / 400 / 404|src/pipeline/responseBuilder.js"; do
  IFS='|' read -r n name what file <<<"$row"
  printf "  ${BOLD}%s  %-21s${NC} %s\n" "$n" "$name" "$file ($(wc -l <"$file" | tr -d ' ') บรรทัด)"
  echo "     ${DIM}$what${NC}"
done
echo
echo "  เส้นทางเขียน: Link Ingest API → parser + validator ตัวเดียวกัน → Linkset Store   ${DIM}src/ingest/, src/store/${NC}"
say "ชั้นนี้แทรกหน้า GS1TH Smart Catalog โดยไม่แก้ระบบเดิม ลำดับชั้นตั้งใจให้ตรวจความถูกต้องก่อนค้นข้อมูลเสมอ"
pause

# ── ขั้นที่ 2 ────────────────────────────────────────────────────────────────
title 2 "ที่อยู่เดียว คำตอบหลายแบบ"
H='Accept: text/html'
check "T-01" "สแกนโดยไม่ระบุอะไร → ลิงก์ปริยาย (ไทย)" 307 "lang=th" -H "$H" -H 'Accept-Language: th' "$B/01/$G"
check "T-03" "ขอ linkType=gs1:pip → หน้าแบรนด์" 307 "brand.example" -H "$H" "$B/01/$G?linkType=gs1:pip"
check "T-07" "ภาษาอังกฤษ → Location เปลี่ยนตามภาษา" 307 "lang=en" -H "$H" -H 'Accept-Language: en' "$B/01/$G"
check "T-06" "เครื่องขอ JSON-LD → ข้อมูลสำหรับเครื่อง" 307 ".jsonld" -H 'Accept: application/ld+json' "$B/01/$G"
check "T-08" "มีตัวขยายกุญแจ /10/LOT01 → ลิงก์ระดับรุ่นการผลิต" 307 "/lot/LOT01" -H "$H" "$B/01/$G/10/LOT01"
check "T-12" "GTIN 13 หลัก → แปลงเป็น 14 หลัก ได้ผลเดียวกับ T-01" 307 "lang=th" -H "$H" -H 'Accept-Language: th' "$B/01/${G#0}"
check "S-01" "มีทับปิดท้าย → ได้ผลเดียวกับ T-01" 307 "lang=th" -H "$H" -H 'Accept-Language: th' "$B/01/$G/"
echo
echo "  ${BOLD}T-02 / T-05${NC}  ขอชุดลิงก์ทั้งชุด"
MAXLINES=22 call "T-05" "Accept: application/linkset+json → 200 ชุดลิงก์" 200 -H 'Accept: application/linkset+json' "$B/01/$G"
openurl "$B/01/$G?linkType=linkset"
say "ที่อยู่บน QR มีที่เดียว ผู้เรียกแต่ละกลุ่มได้ทรัพยากรต่างกัน ระบบปัจจุบันตอบ 302 ไปหน้าสแกนเดียวกันทุกกรณี"
pause

# ── ขั้นที่ 3 ────────────────────────────────────────────────────────────────
title 3 "ชั้นตรวจสอบ: คำขอผิดได้รหัสที่สื่อความหมาย"
call "T-10" "เลขตรวจสอบผิด → 400 (ระบบปัจจุบันได้ 302)" 400 -H "$H" "$B/01/08859999000019"
call "T-11" "อยู่นอกช่วงเลขบ่งชี้บริษัท 885 → 404 (ADR-003)" 404 -H "$H" "$B/01/09506000134352"
call "T-04" "ขอประเภทลิงก์ที่ไม่มี → 404" 404 -H "$H" "$B/01/$G?linkType=gs1:epil"
call "S-02" "ใส่ AI 17 (ข้อมูลประกอบ) ใน path → 400" 400 -H "$H" "$B/01/$G/17/261231"
call "—" "POST ที่ path ของเส้นทางอ่าน → 405" 405 -X POST "$B/01/$G"
openurl "$B/01/08859999000019"
say "ตัวระบุที่ผิดถูกตอบตั้งแต่ชั้นที่ 2 ไม่ถูกส่งต่อไปยังที่จัดเก็บหรือระบบปลายทาง ดูได้จาก log ใน Terminal A"
pause

# ── ขั้นที่ 4 ────────────────────────────────────────────────────────────────
title 4 "เส้นทางเขียน: Link Ingest API ใช้กฎเดียวกับเส้นทางอ่าน (ADR-001, ADR-008)"
AUTH="Authorization: Bearer $TOKEN"; CT='Content-Type: application/json'
curl -s -o /dev/null -X DELETE -H "$AUTH" "$B/api/v1/linksets/01/$NEW"   # เผื่อเหลือจากรอบก่อน
BODY='{"itemDescription":"สินค้าตัวอย่างสำหรับสาธิต","links":{
  "gs1:defaultLink":[{"href":"https://smartcatalog.example/catalog/Product/'"$NEW"'","title":"ข้อมูลผลิตภัณฑ์"}],
  "gs1:pip":[{"href":"https://brand.example/th/products/'"$NEW"'","title":"หน้าผลิตภัณฑ์ของแบรนด์","hreflang":["th"],"type":"text/html"}]}}'
call "PUT" "ลงทะเบียน GTIN ใหม่ → 201" 201 -X PUT -H "$AUTH" -H "$CT" -d "$BODY" "$B/api/v1/linksets/01/$NEW"
check "GET" "แปลงลิงก์ได้ทันทีหลังลงทะเบียน" 307 "$NEW" -H "$H" "$B/01/$NEW"
check "GET" "ประเภท gs1:pip ของสินค้าใหม่" 307 "brand.example" -H "$H" "$B/01/$NEW?linkType=gs1:pip"
echo
call "PUT" "เลขตรวจสอบผิด → 422 (validator ตัวเดียวกับ T-10)" 422 -X PUT -H "$AUTH" -H "$CT" -d "$BODY" "$B/api/v1/linksets/01/08859999000033"
call "PUT" "นอกช่วงเลขบ่งชี้บริษัท → 422" 422 -X PUT -H "$AUTH" -H "$CT" -d "$BODY" "$B/api/v1/linksets/01/09506000134352"
MAXLINES=20 call "PUT" "href ไม่ใช่ http(s) และประเภทลิงก์นอก GS1 → 422 บอกตำแหน่งที่ผิด" 422 -X PUT -H "$AUTH" -H "$CT" \
  -d '{"links":{"gs1:defaultLink":[{"href":"javascript:alert(1)","title":"x"}],"x:custom":[{"href":"https://a.example"}]}}' \
  "$B/api/v1/linksets/01/$NEW"
call "PUT" "ไม่มีโทเค็น → 401" 401 -X PUT -H "$CT" -d "$BODY" "$B/api/v1/linksets/01/$NEW"
call "PUT" "โทเค็นผิด → 403" 403 -X PUT -H 'Authorization: Bearer wrong' -H "$CT" -d "$BODY" "$B/api/v1/linksets/01/$NEW"
echo
call "DELETE" "ลบข้อมูลที่สร้างในขั้นนี้ → 204" 204 -X DELETE -H "$AUTH" "$B/api/v1/linksets/01/$NEW"
call "GET" "หลังลบ → 404" 404 -H "$H" "$B/01/$NEW"
say "ตัวระบุที่ผิดถูกปฏิเสธตั้งแต่ตอนลงทะเบียน ด้วยกฎชุดเดียวกับที่ใช้ตอบคำขอ เมื่อมาตรฐานเปลี่ยนก็แก้ที่เดียว"
pause

# ── ขั้นที่ 5 ────────────────────────────────────────────────────────────────
title 5 "ชุดทดสอบอัตโนมัติ T-01–T-12 + S-01–S-05 ($ROUNDS รอบ)"
note "  สคริปต์ตัวเดียวกันนี้ใช้กับระบบปัจจุบันและ Resolver CE ได้ด้วย"
BASE_URL="$B" node tests/run-cases.js --label demo --rounds "$ROUNDS"
say "ไฟล์ผลบันทึกเวลา คำสั่ง รุ่นซอฟต์แวร์ และสภาพแวดล้อมของทุกรอบไว้ตามขั้นตอน 7.7"
pause

# ── ขั้นที่ 6 ────────────────────────────────────────────────────────────────
title 6 "เวลาตอบสนอง (ผลที่วัดไว้แล้ว)"
node -e '
const fs = require("fs"), dir = "results";
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^bench-.*\.json$/.test(f)) : [];
const good = [], skipped = [];
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
    const miss = (d.overall.statuses["404"] || 0) / d.overall.n;
    (d.overall.errors === 0 && miss < 0.2 ? good : skipped).push({ f, d, miss });
  } catch { skipped.push({ f }); }
}
if (!good.length) { console.log("  ยังไม่มีผลที่ใช้ได้ ให้รัน: npm run data แล้ว npm run start:100k และ npm run bench:100k"); process.exit(0); }
good.sort((a, b) => (b.d.meta.identifiersInDataset - a.d.meta.identifiersInDataset) || b.d.meta.finishedAt.localeCompare(a.d.meta.finishedAt));
const { f, d } = good[0], o = d.overall;
console.log(`  ไฟล์: results/${f}`);
console.log(`  ชุดข้อมูล: ${d.meta.dataset} (${d.meta.identifiersInDataset.toLocaleString()} ตัวระบุ)  วัดเมื่อ ${d.meta.finishedAt.slice(0, 16).replace("T", " ")} UTC`);
console.log(`  ${o.n.toLocaleString()} คำขอ ส่งพร้อมกัน ${d.meta.concurrency}  ไม่มีข้อผิดพลาด: ${o.errors === 0 ? "ใช่" : "ไม่"}`);
console.log(`\n  P50 ${o.p50} ms   P95 ${o.p95} ms   P99 ${o.p99} ms   ≈ ${o.throughputRps.toLocaleString()} คำขอ/วินาที\n`);
for (const [name, x] of Object.entries(d.byScenario)) console.log(`    ${name.padEnd(22)} P50 ${String(x.p50).padStart(5)}   P95 ${String(x.p95).padStart(5)} ms`);
if (skipped.length) console.log(`\n  ข้ามไฟล์ที่ใช้ไม่ได้ ${skipped.length} ไฟล์ (เช่น 404 เกิน 20% เพราะ server โหลดข้อมูลไม่ตรงกับชุดที่วัด)`);
'
note "  วัดบนเครื่องเดียวกัน ยังไม่ได้จำกัดทรัพยากรเท่ากับ Resolver CE ใช้ดูภาพรวม ยังไม่ใช่ผลเปรียบเทียบ"
pause

# ── ขั้นที่ 7 ────────────────────────────────────────────────────────────────
title 7 "การตัดสินใจเชิงสถาปัตยกรรม และข้อจำกัด"
for f in docs/adr/ADR-0*.md; do
  id=$(basename "$f" | cut -d- -f1-2)
  name=$(head -1 "$f" | sed 's/^# ADR-[0-9]*: //')
  dec=$(awk '/^## การตัดสินใจ/{f=1;next} /^## /{f=0} f && NF{print; exit}' "$f" | sed 's/\*\*//g; s/`//g')
  echo "  ${BOLD}$id${NC} $name"
  echo "         ${DIM}$dec${NC}"
done
echo
echo "  ${BOLD}ข้อจำกัดที่ยังเหลือ${NC}"
echo "  - เกณฑ์ผ่านของ T-03 และ T-06–T-08 เป็นการตรวจเชิงพฤติกรรม (เทียบ Location กับ T-01)"
echo "  - ยังไม่ได้ตรวจรายข้อกับหมวด 5 ของ GS1-Conformant Resolver Standard (25 ข้อ) ซึ่งเป็นงานของขั้นตอน 7.2"
echo "  - ผลเปรียบเทียบกับ Resolver CE และระบบปัจจุบันอยู่ในขั้นตอน 7.7"
echo "  - ที่จัดเก็บเป็น JSON ในหน่วยความจำ (ADR-006)"

echo
if [ "$FAIL" = 0 ]; then
  echo "${BOLD}${GRN}ตรวจระหว่างสาธิตผ่าน $PASS/$((PASS + FAIL)) รายการ${NC}"
else
  echo "${BOLD}${RED}ตรวจระหว่างสาธิตผ่าน $PASS/$((PASS + FAIL)) รายการ ดูรายการที่มี ✗ ด้านบน${NC}"
fi
[ "$STARTED" = 1 ] && [ "$KEEP" = 0 ] && note "ปิด server ที่สคริปต์เปิดให้แล้ว (ใช้ --keep ถ้าต้องการเปิดค้างไว้)"
exit 0

# ต้นแบบชั้นจัดการชุดลิงก์ (Linkset Management Layer) — PoC v0.2

ต้นแบบชั้นจัดการชุดลิงก์ตามหัวข้อ 4.2 ของโครงร่างโครงงาน เขียนด้วย Node.js ไม่มี dependency ภายนอก (Node 20 ขึ้นไป)

## ส่วนของโค้ดที่ตรงกับโครงร่าง

| หัวข้อในโครงร่าง | ส่วนประกอบ | ไฟล์ |
|---|---|---|
| 4.2.2 ชั้นที่ 1 | URI Parser แยกกุญแจหลัก / ตัวขยายกุญแจ / พารามิเตอร์ | `src/pipeline/01_parser.js` |
| 4.2.2 ชั้นที่ 2 | Identifier Validator ตรวจไวยากรณ์, Mod-10, ช่วงเลขบ่งชี้บริษัท | `src/pipeline/02_validator.js` |
| 4.2.2 ชั้นที่ 3 | Linkset Resolver ค้นชุดลิงก์ เลือก linkType หรือลิงก์ปริยาย | `src/pipeline/03_linksetResolver.js` |
| 4.2.2 ชั้นที่ 4 | Content Negotiator ใช้ Accept / Accept-Language เลือกลิงก์ และกำหนด Vary | `src/pipeline/04_contentNegotiator.js` |
| 4.2.2 ชั้นที่ 5 | Response Builder ตอบ 3xx / 200 ชุดลิงก์ / 400 / 404 | `src/pipeline/05_responseBuilder.js` |
| 4.2.1 | ที่จัดเก็บชุดลิงก์ (Linkset Store) | `src/store/linksetStore.js` |
| 4.2.1 | ส่วนต่อประสานนำเข้าลิงก์ (Link Ingest API) ใช้กฎตรวจสอบชุดเดียวกับชั้นที่ 2 | `src/ingest/ingestApi.js`, `src/ingest/linksetSchema.js` |
| 4.2.1, 4.2.4 | แฟ้มพรรณนารีโซลเวอร์ `/.well-known/gs1resolver` | `src/app.js` |
| 7.5 | ADR 10 รายการ (โครงร่างกำหนดไม่น้อยกว่า 8) | `docs/adr/` |
| 7.6 | ข้อมูลสังเคราะห์ 10,000 และ 100,000 ลิงก์ | `scripts/generate-data.js`, `scripts/profile.default.json` |
| 7.7 | ชุดกรณีทดสอบเดียวกันสำหรับทั้งสามระบบ รันหลายรอบ บันทึกสภาพแวดล้อม | `tests/cases.js`, `tests/run-cases.js` |
| 7.7 | เวลาตอบสนอง P50 / P95 (ต้นแบบ กับ Resolver CE) | `tests/bench.js` |
| 7.7 | นำข้อมูลชุดเดียวกันเข้า Resolver CE | `scripts/export-ce.js` |

## รัน

```bash
npm start                      # หรือ docker compose up --build
npm test                       # unit test (16 กรณี)
npm run probe                  # T-01–T-12 + กรณีเสริม กับ http://localhost:8080
npm run probe:3rounds          # รันซ้ำ 3 รอบ
```

## สาธิต

```bash
npm run demo           # สาธิตทีละขั้น กด Enter เพื่อไปต่อ (เปิด server ให้เองถ้ายังไม่เปิด)
npm run demo:auto      # ซ้อมรอบเดียวแบบไม่หยุด
npm run demo:server    # เปิด server พร้อม Link Ingest API (โทเค็น demo-secret) ไว้ใน Terminal อีกหน้าต่าง
```

`GET /health` ตอบสถานะและจำนวนลิงก์ที่โหลด

## ข้อมูลสังเคราะห์ (ขั้นตอน 7.6)

```bash
npm run data      # สร้าง data/generated/linksets-10000.json และ linksets-100000.json
DATA_FILE=data/generated/linksets-100000.json LOG_REQUESTS=0 npm start
```

- จำนวนลิงก์ในไฟล์ตรงกับที่สั่งพอดี GTIN ทุกตัวผ่านเลขตรวจสอบ Mod-10 ด้วยฟังก์ชันเดียวกับชั้นที่ 2
- seed เดียวกันกับ profile เดียวกันจะได้ไฟล์ที่เหมือนกันทุกไบต์ จึงสร้างซ้ำได้ ไม่ต้องเก็บไฟล์ข้อมูลไว้
- สัดส่วนประเภทลิงก์ ภาษา และระดับรุ่นการผลิต กำหนดใน `scripts/profile.default.json` ตอนนี้เป็นค่าสมมติ **ให้แทนด้วยลักษณะทางสถิติของข้อมูลจริงของสถาบันฯ** (ค่ารวม ไม่ใช่ข้อมูลรายสินค้า) แล้วสร้างใหม่
- ไฟล์ `.meta.json` ที่สร้างคู่กันบันทึก seed, profile และการกระจายของประเภทลิงก์ ใช้อ้างในรายงานได้
- ข้อมูลตัวอย่างสำหรับ T-01–T-12 (`data/linksets.json`) ถูกรวมเข้าไปด้วย จึงรันชุดทดสอบกับข้อมูลขนาดใหญ่ได้
- เลขบ่งชี้บริษัท 8859990–8859999 เป็นค่าสมมติสำหรับการทดสอบ และโดเมนปลายทาง `*.example` ไม่มีอยู่จริง

## Link Ingest API (เส้นทางเขียน)

เปิดใช้เมื่อตั้งค่า `INGEST_TOKEN` แล้ว ตัวระบุผ่าน parser และ validator ชุดเดียวกับเส้นทางอ่าน ลิงก์ที่ตัวระบุไม่ถูกต้องจึงถูกปฏิเสธตั้งแต่ตอนลงทะเบียน (ADR-001)

```bash
INGEST_TOKEN=dev-token npm start

curl -X PUT http://localhost:8080/api/v1/linksets/01/08859999000032 \
  -H 'Authorization: Bearer dev-token' -H 'Content-Type: application/json' \
  -d '{"itemDescription":"ตัวอย่าง","links":{
        "gs1:defaultLink":[{"href":"https://smartcatalog.example/p/32","hreflang":["th"],"type":"text/html"}],
        "gs1:pip":[{"href":"https://brand.example/p/32","title":"Brand page"}]}}'
```

| เมธอด | ผล |
|---|---|
| `PUT /api/v1/linksets/01/{gtin}[/10/{lot}]` | 201 สร้างใหม่ / 200 แทนที่ของเดิม |
| `GET` ที่อยู่เดียวกัน | 200 พร้อมข้อมูลที่เก็บ / 404 |
| `DELETE` ที่อยู่เดียวกัน | 204 / 404 |
| ข้อผิดพลาด | 401 ไม่มีโทเค็น, 403 โทเค็นผิด, 415 ไม่ใช่ JSON, 422 ตัวระบุหรือเนื้อหาไม่ถูกต้อง (มีรายการ `errors` บอกตำแหน่ง) |

กฎของเนื้อหา: ต้องมี `gs1:defaultLink`, ประเภทลิงก์ต้องอยู่ใน GS1 Web Vocabulary, `href` ต้องเป็น URL แบบ http(s) เต็มรูป ค่าเริ่มต้นเก็บในหน่วยความจำ ถ้าตั้ง `PERSIST=1` จะเขียนกลับลง `DATA_FILE`

## ทดสอบทั้งสามระบบด้วยชุดเดียวกัน (ขั้นตอน 7.7)

```bash
# 1) ต้นแบบ
BASE_URL=http://localhost:8080 node tests/run-cases.js --label poc --rounds 3

# 2) ระบบปัจจุบัน (ใช้ GTIN จริงที่ได้รับอนุญาตเท่านั้น)
BASE_URL=https://<host>/catalog/resolver GTIN=<GTIN-14> LOT=<lot> \
  node tests/run-cases.js --label production --rounds 3 --core-only

# 3) GS1 DigitalLink Resolver CE รุ่น 3.0 (bf885fd) — ติดตั้งด้วย docker compose ของโครงการนั้น แล้วนำข้อมูลชุดเดียวกันเข้า
node scripts/export-ce.js --in data/linksets.json --upload http://localhost:<port> --token secret
BASE_URL=http://localhost:<port> node tests/run-cases.js --label resolver-ce --rounds 3
```

ผลทุกรอบบันทึกใน `results/cases-<label>-<เวลา>.json` พร้อม metadata ได้แก่ เวลาเริ่มและจบ คำสั่งที่ใช้ รุ่นของเครื่องมือ รุ่น Node ระบบปฏิบัติการ CPU และแฟ้มพรรณนารีโซลเวอร์ของระบบเป้าหมาย คอลัมน์ "คงที่ทุกรอบ" บอกว่าสถานะและ Location เหมือนกันทุกรอบหรือไม่

**กรณีเสริม S-01–S-05 เป็นค่าชั่วคราว** ต้องยืนยันกับเมทริกซ์การสอบทานย้อนกลับในขั้นตอน 7.2 และเติมเลขข้อกำหนดในฟิลด์ `requirements` ของ `tests/cases.js` ก่อนรายงานผล (T-01–T-12 ก็ต้องเติมเลขข้อเช่นกัน)

## วัดเวลาตอบสนอง P50 / P95

```bash
DATA_FILE=data/generated/linksets-100000.json LOG_REQUESTS=0 npm start
BASE_URL=http://localhost:8080 node tests/bench.js --data data/generated/linksets-100000.json --label poc-100k

# Resolver CE: นำข้อมูลชุดเดียวกันเข้าก่อน แล้ววัดด้วยคำสั่งเดียวกัน
node scripts/export-ce.js --in data/generated/linksets-100000.json --upload http://localhost:<port> --token secret
BASE_URL=http://localhost:<port> node tests/bench.js --data data/generated/linksets-100000.json --label ce-100k
```

ค่าเริ่มต้นคือ warm-up 500 คำขอ วัด 5,000 คำขอ ส่งพร้อมกัน 10 คำขอ ผสมคำขอ 4 กลุ่ม (เบราว์เซอร์ 60%, linkType=gs1:pip 15%, ขอชุดลิงก์ 15%, ภาษาอังกฤษ 10%) ใช้ percentile แบบ nearest-rank และรายงานแยกตามกลุ่ม คำตอบ 404 ในกลุ่ม gs1:pip เป็นเรื่องปกติ เพราะสินค้าบางรายการไม่มีลิงก์ประเภทนี้

ข้อควรระวังเพื่อความเป็นธรรม: จำกัดทรัพยากรคอนเทนเนอร์ให้เท่ากัน (1 CPU / 512 MB), ปิด log ของต้นแบบ, รันบนเครื่องเดียวกัน ค่าที่ได้ไม่รวมเวลาเครือข่าย จึงใช้เปรียบเทียบระหว่างระบบ ไม่ใช่ค่าสัมบูรณ์

## การแปลงข้อมูลไป Resolver CE

| ต้นแบบ | Resolver CE v3 |
|---|---|
| key `01/{gtin}/10/{lot}` | `anchor: "/01/{gtin}"`, `qualifiers: [{"10": "{lot}"}]` |
| `links["https://gs1.org/voc/pip"]` | `links[]` ที่มี `linktype: "gs1:pip"` |
| รายการ `gs1:defaultLink` | `linktype: "gs1:defaultLink"` และ `defaultLinktype: "gs1:defaultLink"` |
| ไม่มี `title` / `hreflang` | เติมชื่อประเภทลิงก์ / `["und"]` (CE บังคับ) |

ตรวจการแปลงนี้กับซอร์สโค้ด CE (`data_entry_logic.py`) แล้ว แต่ยังไม่ได้ทดสอบกับ CE ที่รันจริง ให้ตรวจว่า T-01 ของ CE ได้ลิงก์ปริยายตามคาดก่อนวัดผล และบันทึกความต่างของแบบจำลองข้อมูลไว้เป็นภัยคุกคามต่อความเที่ยงตรง

## ค่าที่ตั้งได้ (environment)

| ตัวแปร | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| `PORT` | 8080 | |
| `RESOLVER_ROOT` | http://localhost:8080 | ใช้ใน anchor ของชุดลิงก์และแฟ้มพรรณนารีโซลเวอร์ |
| `ALLOWED_PREFIXES` | 885 | ช่วงเลขบ่งชี้บริษัทที่รีโซลเวอร์รับผิดชอบ คั่นด้วย , |
| `REDIRECT_STATUS` | 307 | ADR-002 |
| `DATA_FILE` | data/linksets.json | |
| `INGEST_TOKEN` | (ว่าง) | ว่าง = ปิด Link Ingest API (ADR-008) |
| `PERSIST` | 0 | 1 = เขียนการเปลี่ยนแปลงจาก Ingest API ลง `DATA_FILE` |
| `LOG_REQUESTS` | 1 | 0 = ปิด log ระหว่างวัดเวลา |

## ข้อจำกัดที่ยังเหลือ

- รองรับเฉพาะกุญแจหลัก 01 (GTIN)
- ยังไม่ต่อกับชุดทดสอบความสอดคล้องอย่างเป็นทางการของ GS1
- เกณฑ์ "ผ่าน" ของ T-03, T-06–T-08 เทียบกับ Location ของ T-01 จึงเป็นการตรวจเชิงพฤติกรรม ไม่ใช่การทดสอบความสอดคล้องเต็มรูปแบบ
- ที่จัดเก็บเป็นแฟ้ม JSON ในหน่วยความจำ (ADR-006)

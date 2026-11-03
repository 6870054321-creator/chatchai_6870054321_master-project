# ADR-006: เทคโนโลยีของที่จัดเก็บชุดลิงก์

- **สถานะ:** Accepted
- **วันที่:** 2026-11-02
- **ผู้ตัดสินใจ:** ผู้วิจัย (ทบทวนกับอาจารย์ที่ปรึกษา)

## บริบท

ระบบต้องการที่จัดเก็บชุดลิงก์ที่ตอบสนองต่อคุณสมบัติสองด้าน:
- **เส้นทางอ่าน:** latency ต่ำ, throughput สูง, สามารถรองรับการ query พร้อมกันได้มาก
- **เส้นทางเขียน:** รับการอัปเดตจาก Link Ingest API, ยอมให้ข้อมูลใหม่ปรากฏช้าได้เล็กน้อย (eventual consistency ยอมรับได้)

POC นี้ต้องการ benchmark เปรียบเทียบกับ GS1 Resolver CE ซึ่งใช้ MongoDB ดังนั้นเทคโนโลยีของ store มีผลต่อผลการวัด

## ทางเลือกที่พิจารณา

1. **แฟ้ม JSON โหลดเข้าหน่วยความจำ (in-memory)** ✓ สำหรับ POC
   - ข้อดี: ไม่ต้องการ external dependency ใด ๆ ตั้งค่าง่าย latency ต่ำที่สุด
   - ข้อเสีย: ข้อมูลหายเมื่อ restart (ถ้าไม่เปิด `PERSIST=1`), ไม่รองรับ multi-instance

2. **Redis** ✓ สำหรับ production
   - ข้อดี: latency ต่ำมาก (< 1 ms), รองรับ multi-instance, persistence ได้ (RDB/AOF)
   - pattern การ lookup ตาม GTIN key ตรงกับ Redis key-value model
   - ข้อเสีย: ต้องการ Redis server, เพิ่ม operational complexity

3. **MongoDB (แบบ Resolver CE)**
   - ข้อดี: flexible schema, built-in replication
   - ข้อเสีย: overhead สูงกว่า Redis สำหรับ simple point-lookup, เพิ่ม complexity

4. **PostgreSQL JSONB**
   - ข้อดี: ACID, rich query capabilities
   - ข้อเสีย: over-engineered สำหรับ lookup pattern ที่เรียบง่ายของ GS1 resolver

## พฤติกรรมของต้นแบบในปัจจุบัน

`src/store/linksetStore.js` ให้ interface `get(key)`, `put(key, value)`, `delete(key)` ที่ pipeline และ ingest API ใช้งาน ปัจจุบัน implementation เป็น in-memory Map โหลดจากไฟล์ JSON ตอน startup interface นี้เป็นแบบ synchronous การเปลี่ยนไปใช้ Redis หรือฐานข้อมูลที่เรียกผ่านเครือข่ายต้องเปลี่ยน `get()` เป็น async และปรับ `03_linksetResolver.js` กับ `app.js` ให้รอผล (await) ด้วย ส่วนชั้นอื่นในท่อประมวลผลไม่ต้องแก้

## หลักฐานที่ใช้ตัดสินใจ

| การวัด | dataset | ผลที่วัดได้ | ไฟล์ผล |
|---|---|---|---|
| P50 / P95 / P99 | 10,000 ลิงก์ (2,766 ตัวระบุ) | 1.77 / 2.66 / 4.56 ms | `results/bench-check-10k-2026-10-16T08-32-17-372Z.json` |
| P50 / P95 / P99 | 100,000 ลิงก์ (27,946 ตัวระบุ) | 1.76 / 2.55 / 3.77 ms | `results/bench-mac-poc-100k-2026-10-16T03-03-28-008Z.json` |
| เวลาเริ่มระบบ | 100,000 ลิงก์ | ยังไม่ได้วัด | — |

วัดด้วย `tests/bench.js` 5,000 คำขอ ส่งพร้อมกัน 10 รันด้วย Node บน Linux VM (4 CPU / 4 GB) เครื่องเดียวกับ client ยังไม่ได้รันใน container ที่จำกัด 1 CPU / 512 MB ตัวเลขจึงยังใช้เปรียบเทียบกับ Resolver CE ไม่ได้ เวลาตอบสนองที่ 10,000 และ 100,000 ลิงก์ใกล้เคียงกัน เพราะการค้นใน Map ไม่ขึ้นกับจำนวนรายการ

## การตัดสินใจ

**เลือกทางเลือกที่ 1 สำหรับ POC, ทางเลือกที่ 2 สำหรับ production**

POC ต้องการ zero external dependency เพื่อให้ตั้งค่าและ reproduce ได้ง่าย ผลการ benchmark บน in-memory ยังคงมีคุณค่าเชิงวิชาการ เพราะแสดงเวลาตอบสนองในกรณีดีที่สุดของสถาปัตยกรรมนี้ (ไม่มีค่าใช้จ่ายของการเรียกฐานข้อมูลผ่านเครือข่าย) ส่วน production จะใช้ Redis ซึ่งต้องปรับ interface เป็น async ก่อน (ดูหัวข้อพฤติกรรมของต้นแบบ)

## ผลที่ตามมา

**ข้อดี:**
- POC ตั้งค่าง่าย ไม่ต้องการ Redis ในขั้นตอน prototype
- Interface แยกจาก implementation การ migrate ไป Redis จึงจำกัดอยู่ที่ที่จัดเก็บและจุดที่เรียก `get()` (ต้องเปลี่ยนเป็น async)
- Benchmark ผล in-memory แสดง best-case performance ของ architecture

**ข้อเสีย:**
- ข้อมูลหายเมื่อ restart (แก้ด้วย `PERSIST=1` หรือ migrate ไป Redis)
- ไม่รองรับ multi-instance deployment ในรูปแบบปัจจุบัน

**สิ่งที่ต้องทำต่อ:**
- Implement `RedisLinksetStore` ใน `src/store/` เพื่อใช้ใน production deployment
- ใช้ `node-redis` (official client) กับ pattern `SET linkset:{gtin} {json}` / `GET linkset:{gtin}`

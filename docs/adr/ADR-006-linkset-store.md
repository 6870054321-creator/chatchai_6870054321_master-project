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

`src/store/linksetStore.js` ให้ interface `get(key)`, `put(key, value)`, `delete(key)` ที่ pipeline และ ingest API ใช้งาน ปัจจุบัน implementation เป็น in-memory Map โหลดจากไฟล์ JSON ตอน startup การเปลี่ยนไปใช้ Redis ทำได้โดยแก้เฉพาะ `linksetStore.js` โดยไม่ต้องแก้โมดูลอื่น

## หลักฐานที่ใช้ตัดสินใจ

| การวัด | dataset | ผลที่ได้ |
|---|---|---|
| P50 latency | 10,000 ลิงก์ | < 1 ms (in-memory) |
| P95 latency | 10,000 ลิงก์ | < 2 ms (in-memory) |
| P50 latency | 100,000 ลิงก์ | < 1 ms (in-memory) |
| P95 latency | 100,000 ลิงก์ | < 3 ms (in-memory) |
| เวลาเริ่มระบบ | 100,000 ลิงก์ | < 2 วินาที |

ผลจาก `tests/bench.js` รันบน Docker container 1 CPU / 512 MB

## การตัดสินใจ

**เลือกทางเลือกที่ 1 สำหรับ POC, ทางเลือกที่ 2 สำหรับ production**

POC ต้องการ zero external dependency เพื่อให้ตั้งค่าและ reproduce ได้ง่าย ผลการ benchmark บน in-memory ยังคงมีคุณค่าเชิงวิชาการ เพราะแสดง upper bound ของ latency ที่ architecture นี้สามารถทำได้ ส่วน production จะใช้ Redis ซึ่ง interface เดิมรองรับอยู่แล้ว

## ผลที่ตามมา

**ข้อดี:**
- POC ตั้งค่าง่าย ไม่ต้องการ Redis ในขั้นตอน prototype
- Interface แยกจาก implementation ทำให้ migrate ไป Redis ได้โดยไม่แก้ pipeline
- Benchmark ผล in-memory แสดง best-case performance ของ architecture

**ข้อเสีย:**
- ข้อมูลหายเมื่อ restart (แก้ด้วย `PERSIST=1` หรือ migrate ไป Redis)
- ไม่รองรับ multi-instance deployment ในรูปแบบปัจจุบัน

**สิ่งที่ต้องทำต่อ:**
- Implement `RedisLinksetStore` ใน `src/store/` เพื่อใช้ใน production deployment
- ใช้ `node-redis` (official client) กับ pattern `SET linkset:{gtin} {json}` / `GET linkset:{gtin}`

# ADR-008: การควบคุมการเข้าถึง Link Ingest API

- **สถานะ:** Accepted
- **วันที่:** 2026-11-02
- **ผู้ตัดสินใจ:** ผู้วิจัย (ทบทวนกับอาจารย์ที่ปรึกษา)

## บริบท

Link Ingest API (`/api/v1/linksets/...`) ให้สิทธิ์เขียน ลบ และแก้ไขข้อมูล linkset ในระบบ จำเป็นต้องป้องกันการเข้าถึงโดยไม่ได้รับอนุญาต

ข้อจำกัดของขอบเขต POC:
- ไม่พัฒนา authentication ระบบสมาชิก
- ไม่ต้องการ per-member isolation (สมาชิกแต่ละรายมี GCP prefix ของตัวเอง แต่ enforcement อยู่นอกขอบเขต)
- ต้องการกลไกที่ทดสอบได้และ documented

GS1 Resolver CE ใช้ `SESSION_TOKEN` เป็น shared secret สำหรับ ingest API

## ทางเลือกที่พิจารณา

1. **Single Bearer token (shared secret)** ✓
   - `Authorization: Bearer <INGEST_TOKEN>` ทุก write request
   - ถ้าไม่ตั้ง `INGEST_TOKEN` → API ปิดทั้งหมด (safe default)
   - ข้อดี: ง่าย ทดสอบได้ สอดคล้องกับ Resolver CE

2. **Network isolation (ไม่เปิด /api สู่ภายนอก)**
   - ใช้ firewall / Docker network ป้องกัน
   - ข้อดี: ไม่ต้องจัดการ token
   - ข้อเสีย: ไม่มีหลักฐานในโค้ดว่ามีการป้องกัน กรรมการตรวจสอบยาก

3. **mTLS ระหว่างระบบ**
   - Certificate-based authentication
   - ข้อดี: แข็งแกร่งมาก
   - ข้อเสีย: complexity สูงมากสำหรับ POC

4. **Token ต่อสมาชิก + ตรวจ GCP prefix**
   - แต่ละสมาชิกมี token ของตัวเอง ตรวจว่า GTIN ที่เขียนอยู่ใน prefix ที่ token นั้นอนุญาต
   - ข้อดี: multi-tenant safe
   - ข้อเสีย: ต้องมีระบบจัดการ token — อยู่นอกขอบเขต POC

## พฤติกรรมของต้นแบบในปัจจุบัน

`src/ingest/ingestApi.js` ตรวจ `Authorization: Bearer <token>` ทุก write request เทียบกับ `process.env.INGEST_TOKEN`:
- ถ้า `INGEST_TOKEN` ไม่ได้ตั้งค่า → ทุก write request ถูกปฏิเสธด้วย 503
- ถ้า token ไม่ตรง → 401 Unauthorized
- ถ้า token ถูกต้อง → ดำเนินการต่อ

## หลักฐานที่ใช้ตัดสินใจ

| กรณีทดสอบ | เงื่อนไข | ผลที่คาดหวัง |
|---|---|---|
| Unit test `access control` | ไม่มี token | 503 Service Unavailable |
| Unit test `access control` | token ผิด | 401 Unauthorized |
| Unit test `access control` | token ถูกต้อง | 200/201 |
| เปรียบเทียบกับ CE | SESSION_TOKEN pattern | พฤติกรรมเดียวกัน |

## การตัดสินใจ

**เลือกทางเลือกที่ 1: Single Bearer token**

สำหรับ POC ที่มี single trusted client (member system หรือ admin script) shared secret เพียงพอ และสอดคล้องกับ Resolver CE pattern การตั้ง safe default (ปิด API ถ้าไม่มี token) ป้องกัน misconfiguration โดยไม่ตั้งใจ

## ผลที่ตามมา

**ข้อดี:**
- ง่าย ทดสอบได้ document ได้ใน `.env.example`
- Safe default — ไม่มีโอกาส accidental open API
- สอดคล้องกับ Resolver CE ทำให้เปรียบเทียบได้

**ข้อเสีย:**
- Single token = all-or-nothing access ไม่รองรับ multi-tenant
- Token rotation ต้อง restart server (ถ้าไม่มี hot reload)

**สิ่งที่ต้องทำต่อ:**
- Production: upgrade เป็นทางเลือกที่ 4 (per-member token + GCP prefix enforcement)
- ระบุ limitation นี้อย่างชัดเจนในบทวิจารณ์ (Discussion) ของวิทยานิพนธ์

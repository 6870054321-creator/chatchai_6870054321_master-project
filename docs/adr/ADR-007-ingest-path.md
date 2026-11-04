# ADR-007: วิธีนำข้อมูลลิงก์จากระบบสำหรับสมาชิกเข้าสู่ที่จัดเก็บ

- **สถานะ:** Accepted
- **วันที่:** 2026-11-02
- **ผู้ตัดสินใจ:** ผู้วิจัย (ทบทวนกับอาจารย์ที่ปรึกษา)

## บริบท

ระบบต้องการกลไกให้สมาชิก GS1 Thailand นำข้อมูลลิงก์ของสินค้าเข้าสู่ resolver ขอบเขตของ POC ไม่รวมการแก้ไขระบบสำหรับสมาชิก (member system) แต่ต้องออกแบบ ingest interface ให้รองรับวิธีการต่าง ๆ ที่ระบบเดิมจะเชื่อมต่อได้

รูป 4.2 ในโครงร่างวิทยานิพนธ์แสดงเส้น "Register link" จาก Member System ไปยัง Link Ingest API

## ทางเลือกที่พิจารณา

1. **ระบบสำหรับสมาชิกเรียก Link Ingest API (push model)** ✓
   - ทุกครั้งที่สมาชิกบันทึก/แก้ไขลิงก์ใน member system → member system เรียก `PUT /api/v1/linksets/01/{gtin}`
   - ข้อดี: ข้อมูลใหม่ปรากฏทันที, ไม่ต้องมี polling overhead
   - ข้อเสีย: ต้องแก้ member system (อยู่นอกขอบเขต POC)

2. **ดึงข้อมูลเป็นรอบจากฐานข้อมูลเดิม (sync/pull model)**
   - Cron job ดึงข้อมูลจาก member DB แล้วเรียก Ingest API
   - ข้อดี: ไม่ต้องแก้ member system
   - ข้อเสีย: ข้อมูลล่าช้า (ขึ้นกับ interval), query load บน member DB

3. **ผู้ดูแลนำเข้าเป็นชุด (batch import)**
   - Admin upload ไฟล์ JSON/CSV ผ่าน script หรือ admin UI
   - ข้อดี: ง่ายสำหรับ migration ครั้งแรก
   - ข้อเสีย: ไม่ real-time, ต้องการ human intervention

## พฤติกรรมของต้นแบบในปัจจุบัน

`src/ingest/ingestApi.js` ให้ REST API:
- `PUT /api/v1/linksets/01/{gtin}` — สร้าง/อัปเดต linkset
- `PUT /api/v1/linksets/01/{gtin}/10/{lot}` — สร้าง/อัปเดต linkset ระดับ qualifier
- `GET /api/v1/linksets/01/{gtin}` — ดึง linkset
- `DELETE /api/v1/linksets/01/{gtin}` — ลบ linkset

Interface นี้รองรับทั้ง push model (member system เรียกโดยตรง) และ sync model (script ดึงข้อมูลมาแล้วเรียก API)

## หลักฐานที่ใช้ตัดสินใจ

| เกณฑ์ | Push | Sync | Batch |
|---|---|---|---|
| ข้อมูล real-time | ✓ | ✗ (lag ตาม interval) | ✗ |
| ต้องแก้ member system | ✓ | ✗ | ✗ |
| รองรับ migration ครั้งแรก | ✗ | △ | ✓ |
| ความเรียบง่ายของ POC | △ | △ | ✓ |

## การตัดสินใจ

**ออกแบบ interface สำหรับ push model เป็นหลัก แต่รองรับ batch import ผ่าน script สำหรับ POC**

Push model เป็น architecture ที่ถูกต้องสำหรับ production (real-time, idempotent PUT) ส่วน POC ใช้ batch import ผ่าน script เพื่อโหลดข้อมูลจริงของ user เข้าระบบโดยไม่ต้องแก้ member system สิ่ง interface เดียวกันรองรับทั้งสองกรณี

## ผลที่ตามมา

**ข้อดี:**
- Interface เดียวรองรับทั้ง push, sync, และ batch
- Idempotent PUT ทำให้ retry safe
- สอดคล้องกับ GS1 Resolver CE ingest pattern

**ข้อเสีย:**
- ยังไม่มี bulk endpoint (รับหลาย GTIN ในครั้งเดียว) — script batch import ต้อง loop call PUT

**ผลต่อ DPP:**
- ระบบที่เก็บพาสปอร์ตเป็นผู้ลงทะเบียนที่อยู่ของพาสปอร์ตผ่าน API นี้ (`../dpp-mockup` ลงทะเบียน 21 ชุดด้วยวิธีนี้)
- ถ้าย้ายที่เก็บพาสปอร์ต แก้เฉพาะชุดลิงก์ QR ที่พิมพ์บนสินค้าไม่ต้องเปลี่ยน

**สิ่งที่ต้องทำต่อ:**
- เขียน CSV-to-linkset conversion script สำหรับ data จริงของ user
- พิจารณาเพิ่ม `POST /api/v1/linksets/batch` ใน production version สำหรับ bulk import

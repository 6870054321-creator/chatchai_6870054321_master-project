# ADR-002: รหัสสถานะสำหรับการเปลี่ยนเส้นทาง

- **สถานะ:** Accepted
- **วันที่:** 2026-11-02
- **ผู้ตัดสินใจ:** ผู้วิจัย (ทบทวนกับอาจารย์ที่ปรึกษา)

## บริบท

เมื่อกระบวนการต่อรองเนื้อหา (Content Negotiation) เหลือลิงก์เพียงรายการเดียว ระบบจะต้องเปลี่ยนเส้นทาง (redirect) ผู้ใช้ไปยัง URL ของลิงก์นั้น รหัสสถานะ HTTP ที่ใช้มีผลต่อ:
- พฤติกรรมของ browser (preserve method หรือไม่)
- พฤติกรรมของ CDN cache
- ความสอดคล้องกับ GS1 Resolver CE (ซึ่งใช้ 307 ใน `web_logic.py` ฟังก์ชัน `_handle_link_type`)

## ทางเลือกที่พิจารณา

1. **302 Found**
   - พฤติกรรม: browser อาจเปลี่ยน POST → GET (RFC 7231 §6.4.3 อนุญาตให้ทำได้)
   - ใช้งานมาก แต่ semantics ไม่ชัดเจนตาม spec
   - Resolver CE รุ่นเก่าใช้รหัสนี้

2. **307 Temporary Redirect** ✓
   - พฤติกรรม: browser ต้องใช้ method เดิมเสมอ (RFC 7231 §6.4.7)
   - บอกว่า URL ของ resolver คงที่แต่ปลายทางอาจเปลี่ยนได้ตาม content negotiation
   - GS1 Resolver CE รุ่นปัจจุบันใช้รหัสนี้

3. **308 Permanent Redirect / 301 Moved Permanently**
   - บอกว่าลิงก์ถาวร — ไม่เหมาะกับ resolver ที่ปลายทางเปลี่ยนได้ตามข้อมูลในฐาน
   - CDN อาจ cache ถาวร ทำให้อัปเดตลิงก์ไม่มีผล

## พฤติกรรมของต้นแบบในปัจจุบัน

ต้นแบบใช้ 307 เป็นค่าเริ่มต้น ตั้งค่าได้ผ่าน environment variable `REDIRECT_STATUS` เพื่อให้สามารถรันทดสอบเปรียบเทียบระหว่าง 302 และ 307 ได้

## หลักฐานที่ใช้ตัดสินใจ

| กรณีทดสอบ | เงื่อนไข | ผลที่คาดหวัง |
|---|---|---|
| T-01 | Default link, ไม่มี linkType | 307 → URL ของ default link |
| T-03 | linkType=gs1:pip ตรงกับ 1 ลิงก์ | 307 → URL ของ pip |
| T-06 | Accept-Language: th | 307 → URL ภาษาไทย |
| T-07 | Accept-Language: en | 307 → URL ภาษาอังกฤษ |
| T-08 | qualifier fallback | 307 → URL จากระดับ GTIN |

รันซ้ำด้วย `REDIRECT_STATUS=302` และ `REDIRECT_STATUS=307` แล้วเปรียบเทียบกับผลของ Resolver CE

## การตัดสินใจ

**เลือกทางเลือกที่ 2: 307 Temporary Redirect** เป็นค่าเริ่มต้น

GS1 Digital Link Technical Standard §10.2 แนะนำ 307 เพราะ URL ของ resolver คงที่ (permanent endpoint) แต่ปลายทางที่ resolve ไปนั้นขึ้นกับ content negotiation และข้อมูลที่ลงทะเบียนไว้ ซึ่งอาจเปลี่ยนแปลงได้ การคง `REDIRECT_STATUS` เป็น env var ทำให้ผู้ดูแลระบบปรับได้หากนโยบาย GS1 Thailand เปลี่ยน

## ผลที่ตามมา

**ข้อดี:**
- สอดคล้องกับ GS1 Resolver CE และ GS1 spec
- Browser preserve HTTP method — ไม่เกิดการเปลี่ยน POST → GET โดยไม่ตั้งใจ
- ทดสอบเปรียบเทียบกับ CE ได้โดยตรง

**ข้อเสีย:**
- Client บางตัวไม่ handle 307 — แต่พบน้อยมากในสภาพแวดล้อมปัจจุบัน

**สิ่งที่ต้องทำต่อ:**
- ทดสอบกับ browser จริง (Chrome, Safari) และ mobile scanner app เพื่อยืนยัน 307 ทำงานถูกต้อง

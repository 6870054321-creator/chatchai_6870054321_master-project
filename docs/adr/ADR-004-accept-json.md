# ADR-004: การตีความ `Accept: application/json`

- **สถานะ:** Accepted
- **วันที่:** 2026-11-02
- **ผู้ตัดสินใจ:** ผู้วิจัย (ทบทวนกับอาจารย์ที่ปรึกษา)

## บริบท

GS1 Digital Link spec กำหนด media type `application/linkset+json` สำหรับการขอรับชุดลิงก์ในรูปแบบ JSON อย่างเป็นทางการ แต่ในทางปฏิบัติ client จำนวนมาก (เช่น curl, Postman, หรือ SDK ที่ไม่ได้ออกแบบสำหรับ GS1 โดยเฉพาะ) ส่ง `Accept: application/json` แทน

คำถาม: เมื่อ resolver ได้รับ `Accept: application/json` ควรตีความอย่างไร?

## ทางเลือกที่พิจารณา

1. **ถือว่าขอชุดลิงก์ (application/linkset+json)** ✓
   - ตอบ 200 พร้อม linkset JSON
   - ผู้พัฒนาทั่วไปคาดหวัง JSON → ได้ JSON ที่มีประโยชน์

2. **ถือว่าขอข้อมูล JSON-LD ของผลิตภัณฑ์**
   - ตอบ JSON-LD product description
   - ต้องมีข้อมูล product metadata แยกต่างหาก — อยู่นอกขอบเขต POC

3. **ตอบ 406 Not Acceptable**
   - บังคับให้ client ระบุ media type ที่ถูกต้อง
   - Strict แต่ทำให้ developer experience แย่ โดยเฉพาะช่วงทดสอบ

## พฤติกรรมของต้นแบบในปัจจุบัน

`src/pipeline/contentNegotiator.js` ตรวจ Accept header และถ้าพบ `application/json` หรือ `application/linkset+json` จะ return linkset ในรูปแบบ JSON (200 response)

## หลักฐานที่ใช้ตัดสินใจ

| กรณีทดสอบ | Accept header | ผลที่คาดหวัง |
|---|---|---|
| T-05 | `application/linkset+json` | 200 + linkset JSON |
| กรณีเสริม (ยังไม่มีรหัส) | `application/json` | 200 + linkset JSON (ถือเทียบเท่า) |
| กรณีเสริม | `application/json; q=0.9, */*; q=0.8` | 200 + linkset JSON |

## การตัดสินใจ

**เลือกทางเลือกที่ 1:** ถือว่า `application/json` เทียบเท่ากับ `application/linkset+json`

GS1-Conformant Resolver Standard [4] §2.10 กำหนดว่าเมื่อ Accept เป็น `application/linkset+json` ต้องคืนชุดลิงก์ตาม RFC 9264 (SHALL) และแนะนำ (RECOMMENDED) ให้คืนคำตอบเดียวกันเมื่อ Accept เป็น `application/json` ซึ่งช่วยให้ client ที่ยังไม่รู้จัก media type ใหม่ใช้งานได้ การตอบ 406 จะทำให้ developer ที่เริ่มทดสอบระบบสะดุดโดยไม่จำเป็น

## ผลที่ตามมา

**ข้อดี:**
- Developer-friendly — ทดสอบด้วย curl ธรรมดาได้ทันที
- เป็นไปตามคำแนะนำ (RECOMMENDED) ใน §2.10 ของมาตรฐาน
- ลด friction สำหรับ integration กับ system อื่น

**ข้อเสีย:**
- อาจทำให้ client ไม่รู้ว่า media type ที่ถูกต้องคือ `application/linkset+json`

**สิ่งที่ต้องทำต่อ:**
- เพิ่ม `Content-Type: application/linkset+json` ใน response เสมอ แม้ client จะขอ `application/json` เพื่อ educate ว่า media type ที่ถูกต้องคืออะไร

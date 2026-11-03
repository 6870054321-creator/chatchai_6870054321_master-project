# ADR-005: ส่วนหัว Vary และนโยบายกุญแจแคชที่บริการเครือข่ายด้านหน้า

- **สถานะ:** Accepted
- **วันที่:** 2026-11-02
- **ผู้ตัดสินใจ:** ผู้วิจัย (ทบทวนกับอาจารย์ที่ปรึกษา)

## บริบท

GS1 Resolver ใช้ content negotiation — URL เดียวกัน (เช่น `/01/08850999000014`) ให้ผลลัพธ์ต่างกันขึ้นกับ:
- `Accept` header: redirect (307) vs. linkset JSON (200)
- `Accept-Language` header: URL ภาษาไทย vs. ภาษาอังกฤษ

หากมี CDN (เช่น Cloudflare) อยู่ด้านหน้า CDN จะต้อง cache response แยกกันสำหรับแต่ละ combination ของ header เหล่านี้ มิฉะนั้น user ที่ขอภาษาอังกฤษอาจได้ response ที่ cache ไว้สำหรับภาษาไทย

ส่วนหัว `Vary` เป็นกลไกมาตรฐาน HTTP (RFC 9110 §12.5.5) สำหรับบอก CDN ว่า cache key ต้องประกอบด้วย field อะไรบ้าง

## ทางเลือกที่พิจารณา

1. **ใส่ `Vary: Accept, Accept-Language` ทุก response ที่ผ่าน content negotiation** ✓
   - CDN แยก cache entry ตาม Accept และ Accept-Language
   - Response ถูกต้องทุก user

2. **ไม่แคช (Cache-Control: no-store)**
   - ง่าย ไม่มีความเสี่ยงด้าน cache poisoning
   - ทุก request ถึง origin server — latency สูงขึ้น, cost สูงขึ้น

3. **แคชเฉพาะ response ที่ไม่ขึ้นกับ content negotiation**
   - เช่น /.well-known/gs1resolver ซึ่งตอบเหมือนกันทุก client
   - แก้ปัญหาได้บางส่วนแต่ยังต้องจัดการ Vary สำหรับ path อื่น

## พฤติกรรมของต้นแบบในปัจจุบัน

`src/pipeline/responseBuilder.js` ใส่ `Vary: Accept, Accept-Language` ใน response ทุกครั้งที่ผ่าน content negotiation ยังไม่มีการกำหนด `Cache-Control` header สำหรับเส้นทางอ่าน (เป็น gap ที่ต้องแก้)

## หลักฐานที่ใช้ตัดสินใจ

| กรณีทดสอบ | ตรวจอะไร | ผลที่คาดหวัง |
|---|---|---|
| T-05 | Accept: application/linkset+json | Vary header ปรากฏใน response |
| T-06 | Accept: application/ld+json | Vary: Accept, Accept-Language |
| T-07 | Accept-Language: en | Vary: Accept, Accept-Language |
| การวัด cache | อัตรา cache hit หลัง warm-up | ยังไม่ได้วัด (ต้องวัดที่บริการเครือข่ายด้านหน้าหลังติดตั้งจริง) |

## การตัดสินใจ

**เลือกทางเลือกที่ 1:** ใส่ `Vary: Accept, Accept-Language` ทุก response ที่ผ่าน content negotiation

RFC 9110 §12.5.5 ระบุว่า origin server ควร (SHOULD) ส่ง `Vary` เมื่อการเลือก representation ขึ้นกับส่วนของคำขอนอกเหนือจาก method และ URI การละเว้น `Vary` อาจทำให้ CDN serve wrong response ให้ user ซึ่งเป็น correctness bug ไม่ใช่แค่ performance issue

## ผลที่ตามมา

**ข้อดี:**
- CDN cache ถูกต้อง — ไม่มีการ serve ภาษาผิด หรือ JSON ให้ browser ที่ขอ redirect
- สอดคล้องกับ RFC 9110 §12.5.5 (GS1-Conformant Resolver Standard ไม่ได้กล่าวถึง Vary โดยตรง)

**ข้อเสีย:**
- `Vary` กว้างทำให้ cache hit rate ลดลง เพราะต้องแยก entry ตาม Accept combination
- Cloudflare บางแผนไม่รองรับ `Vary: Accept-Language` — ต้องตรวจสอบ cache configuration

**สิ่งที่ต้องทำต่อ:**
- เพิ่ม `Cache-Control: public, max-age=60` สำหรับ redirect response (linkset เปลี่ยนไม่บ่อย)
- เพิ่ม `Cache-Control: no-store` สำหรับ response ที่มีข้อมูล sensitive
- ทดสอบ cache behavior กับ CDN จริงก่อน production

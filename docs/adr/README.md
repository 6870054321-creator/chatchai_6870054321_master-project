# บันทึกการตัดสินใจเชิงสถาปัตยกรรม (ADR)

ขั้นตอน 7.5 ของโครงร่างกำหนด ADR ไม่น้อยกว่า 8 รายการ ตารางด้านล่างสรุปการตัดสินใจจากแต่ละไฟล์

| ADR | ประเด็น | การตัดสินใจ | สถานะ |
|---|---|---|---|
| [ADR-001](ADR-001-validation-placement.md) | ตำแหน่งของการตรวจสอบตัวระบุ | เลือกทางเลือกที่ 3: ตรวจสอบทั้งสองเส้นทางด้วย 02_validator.js โมดูลเดียว | Accepted |
| [ADR-002](ADR-002-redirect-status.md) | รหัสสถานะสำหรับการเปลี่ยนเส้นทาง | เลือกทางเลือกที่ 2: 307 Temporary Redirect เป็นค่าเริ่มต้น | Accepted |
| [ADR-003](ADR-003-out-of-prefix-response.md) | คำตอบสำหรับตัวระบุนอกช่วงเลขบ่งชี้บริษัท (T-11) | เลือกทางเลือกที่ 1: 404 Not Found | Accepted |
| [ADR-004](ADR-004-accept-json.md) | การตีความ `Accept: application/json` | เลือกทางเลือกที่ 1: ถือว่า application/json เทียบเท่ากับ application/linkset+json | Accepted |
| [ADR-005](ADR-005-vary-cache-key.md) | ส่วนหัว Vary และนโยบายกุญแจแคชที่บริการเครือข่ายด้านหน้า | เลือกทางเลือกที่ 1: ใส่ Vary: Accept, Accept-Language ทุก response ที่ผ่าน content negotiation | Accepted |
| [ADR-006](ADR-006-linkset-store.md) | เทคโนโลยีของที่จัดเก็บชุดลิงก์ | เลือกทางเลือกที่ 1 สำหรับ POC, ทางเลือกที่ 2 สำหรับ production | Accepted |
| [ADR-007](ADR-007-ingest-path.md) | วิธีนำข้อมูลลิงก์จากระบบสำหรับสมาชิกเข้าสู่ที่จัดเก็บ | ออกแบบ interface สำหรับ push model เป็นหลัก แต่รองรับ batch import ผ่าน script สำหรับ POC | Accepted |
| [ADR-008](ADR-008-ingest-access-control.md) | การควบคุมการเข้าถึง Link Ingest API | เลือกทางเลือกที่ 1: Single Bearer token | Accepted |
| [ADR-009](ADR-009-qualifier-fallback.md) | การย้อนกลับจากระดับตัวขยายกุญแจไปยังระดับ GTIN | เลือกทางเลือกที่ 1: ย้อนกลับทีละระดับจนถึงระดับ GTIN | Accepted |
| [ADR-010](ADR-010-multiple-candidates.md) | เมื่อการต่อรองเนื้อหายังเหลือลิงก์มากกว่าหนึ่งรายการ | เลือกทางเลือกที่ 1: เลือกหนึ่งรายการและ redirect | Accepted |

เลขหมวดที่อ้างใน ADR ตรวจกับ GS1-Conformant Resolver Standard รุ่น 1.2.1 (ส.ค. 2569) ซึ่งต่างจากรุ่น 1.2.0 ที่โครงร่างอ้าง เฉพาะ errata ใน §2.5.10 และอภิธานศัพท์ เลขหมวดจึงตรงกันทั้งสองรุ่น

แม่แบบสำหรับ ADR ใหม่: [template.md](template.md)

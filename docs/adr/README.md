# บันทึกการตัดสินใจเชิงสถาปัตยกรรม (ADR)

ขั้นตอน 7.5 ของโครงร่างกำหนด ADR ไม่น้อยกว่า 8 รายการ ด้านล่างคือประเด็นที่ต้นแบบต้องตัดสินใจ ทุกรายการยังอยู่ในสถานะ **Proposed** ต้นแบบใช้ค่าชั่วคราวเพื่อให้รันทดสอบได้ก่อน

| ADR | ประเด็น | ค่าชั่วคราวในต้นแบบ | สถานะ |
|---|---|---|---|
| [ADR-001](ADR-001-validation-placement.md) | ตำแหน่งของการตรวจสอบตัวระบุ | ตรวจทั้งสองเส้นทาง โมดูลเดียว | Proposed |
| [ADR-002](ADR-002-redirect-status.md) | รหัสสถานะสำหรับการเปลี่ยนเส้นทาง | 307 | Proposed |
| [ADR-003](ADR-003-out-of-prefix-response.md) | คำตอบสำหรับตัวระบุนอกช่วงเลขบ่งชี้บริษัท (T-11) | 404 | Proposed |
| [ADR-004](ADR-004-accept-json.md) | การตีความ `Accept: application/json` | ถือว่าขอชุดลิงก์ | Proposed |
| [ADR-005](ADR-005-vary-cache-key.md) | ส่วนหัว Vary และนโยบายกุญแจแคชที่บริการเครือข่ายด้านหน้า | Vary: Accept, Accept-Language | Proposed |
| [ADR-006](ADR-006-linkset-store.md) | เทคโนโลยีของที่จัดเก็บชุดลิงก์ | JSON ในหน่วยความจำ | Proposed |
| [ADR-007](ADR-007-ingest-path.md) | วิธีนำข้อมูลลิงก์จากระบบสำหรับสมาชิกเข้าสู่ที่จัดเก็บ | PUT ต่อหนึ่งตัวระบุ | Proposed |
| [ADR-008](ADR-008-ingest-access-control.md) | การควบคุมการเข้าถึง Link Ingest API | Bearer token เดียว | Proposed |
| [ADR-009](ADR-009-qualifier-fallback.md) | การย้อนกลับจากระดับตัวขยายกุญแจไปยังระดับ GTIN | ย้อนไประดับ GTIN | Proposed |
| [ADR-010](ADR-010-multiple-candidates.md) | เมื่อการต่อรองเนื้อหายังเหลือลิงก์มากกว่าหนึ่งรายการ | เลือกหนึ่งรายการแล้วเปลี่ยนเส้นทาง | Proposed |

แม่แบบสำหรับ ADR ใหม่: [template.md](template.md)

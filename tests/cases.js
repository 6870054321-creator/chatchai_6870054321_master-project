// Test cases shared by every system under test (current service, PoC, Resolver CE).
//
// T-01–T-12 : the probe cases of Table 4.1 / 4.2 in the proposal (fixed — do not change their meaning).
// S-xx      : supplemental cases (§7.2). PROVISIONAL — confirm each against the traceability matrix
//             and fill `requirements` with the clause IDs of GS1-Conformant Resolver Standard v1.2.0
//             / GS1 Digital Link URI Syntax v1.7.0 before reporting.
//
// check(r, b): r = this case's observation, b = T-01 observation (baseline for "different destination" checks)

export const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const is3xx = (s) => s >= 300 && s < 400;
const varyHas = (r, h) => r.vary === '*' || (r.vary || '').toLowerCase().split(/\s*,\s*/).includes(h.toLowerCase());
const isLinkset = (r) => r.status === 200 && /application\/linkset\+json/.test(r.contentType || '');

export function buildCases({ BASE, ORIGIN, GTIN, LOT, BAD, OUT }) {
  const html = { Accept: BROWSER_ACCEPT };
  return [
    // ── Table 4.1 ──────────────────────────────────────────────────────────
    { id: 'T-01', group: 'core', name: 'คำขอพื้นฐาน', url: `${BASE}/01/${GTIN}`, headers: html,
      requirements: [], check: (r) => is3xx(r.status) && !!r.location },
    { id: 'T-02', group: 'core', name: 'linkType=all', url: `${BASE}/01/${GTIN}?linkType=all`,
      requirements: [], check: (r) => isLinkset(r) },
    { id: 'T-03', group: 'core', name: 'linkType=gs1:pip', url: `${BASE}/01/${GTIN}?linkType=gs1:pip`, headers: html,
      requirements: [], check: (r, b) => is3xx(r.status) && r.location !== b.location },
    { id: 'T-04', group: 'core', name: 'linkType=gs1:epil (ไม่มีลิงก์)', url: `${BASE}/01/${GTIN}?linkType=gs1:epil`,
      requirements: [], check: (r) => r.status === 404 },
    { id: 'T-05', group: 'core', name: 'Accept: application/linkset+json', url: `${BASE}/01/${GTIN}`, headers: { Accept: 'application/linkset+json' },
      requirements: [], check: (r) => isLinkset(r) && varyHas(r, 'Accept') },
    { id: 'T-06', group: 'core', name: 'Accept: application/ld+json', url: `${BASE}/01/${GTIN}`, headers: { Accept: 'application/ld+json' },
      requirements: [], check: (r, b) => r.location !== b.location && varyHas(r, 'Accept') },
    { id: 'T-07', group: 'core', name: 'Accept-Language: en', url: `${BASE}/01/${GTIN}`, headers: { ...html, 'Accept-Language': 'en' },
      requirements: [], check: (r, b) => r.location !== b.location && varyHas(r, 'Accept-Language') },
    { id: 'T-08', group: 'core', name: 'ตัวขยายกุญแจ /10/{lot}', url: `${BASE}/01/${GTIN}/10/${LOT}`, headers: html,
      requirements: [], check: (r, b) => is3xx(r.status) && r.location !== b.location && !/%2F10%2F/i.test(r.location || '') },
    { id: 'T-09', group: 'core', name: '/.well-known/gs1resolver', url: `${ORIGIN}/.well-known/gs1resolver`,
      requirements: [], check: (r) => r.status === 200 && r.body?.includes('resolverRoot') && r.body?.includes('supportedPrimaryKeys') },
    { id: 'T-10', group: 'core', name: 'เลขตรวจสอบผิด', url: `${BASE}/01/${BAD}`, headers: html,
      requirements: [], check: (r) => r.status === 400 },
    { id: 'T-11', group: 'core', name: 'นอกช่วงเลขบ่งชี้บริษัท', url: `${BASE}/01/${OUT}`, headers: html,
      requirements: [], check: (r) => r.status >= 400 && r.status < 500 },
    { id: 'T-12', group: 'core', name: 'GTIN 13 หลัก', url: `${BASE}/01/${GTIN.replace(/^0/, '')}`, headers: html,
      requirements: [], check: (r, b) => is3xx(r.status) && r.location === b.location },

    // ── Supplemental (provisional, §7.2) ───────────────────────────────────
    { id: 'S-01', group: 'supplemental', name: 'ทับปิดท้าย /01/{gtin}/', url: `${BASE}/01/${GTIN}/`, headers: html,
      requirements: [], check: (r, b) => is3xx(r.status) && r.location === b.location },
    { id: 'S-02', group: 'supplemental', name: 'ข้อมูลประกอบ (AI 17) อยู่ใน path', url: `${BASE}/01/${GTIN}/17/261231`, headers: html,
      requirements: [], check: (r) => r.status === 400 },
    { id: 'S-03', group: 'supplemental', name: 'HEAD ให้ผลเหมือน GET', method: 'HEAD', url: `${BASE}/01/${GTIN}`, headers: html,
      requirements: [], check: (r, b) => r.status === b.status && r.location === b.location },
    { id: 'S-04', group: 'supplemental', name: 'linkType=linkset', url: `${BASE}/01/${GTIN}?linkType=linkset`,
      requirements: [], check: (r) => isLinkset(r) },
    { id: 'S-05', group: 'supplemental', name: 'ส่วนหัว Link ชี้ไปยังชุดลิงก์', url: `${BASE}/01/${GTIN}`, headers: html,
      requirements: [], check: (r) => /rel="?linkset"?/.test(r.link || '') },
  ];
}

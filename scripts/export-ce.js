#!/usr/bin/env node
// Converts a PoC dataset into GS1 DigitalLink Resolver CE v3 data-entry documents (POST /api/new),
// so both systems are measured on the same data in §7.7, and optionally uploads them.
//
//   node scripts/export-ce.js --in data/generated/linksets-10000.json --out data/generated/ce-10000.json
//   node scripts/export-ce.js --in … --upload http://localhost:8080 --token secret [--batch 500]
//
// Mapping (checked against CE source at revision bf885fd, data_entry_logic.py):
//   PoC key "01/{gtin}[/10/{lot}]"   → anchor "/01/{gtin}", qualifiers [{"10": "{lot}"}]
//   PoC links[<full voc URI>]        → links[] with linktype "gs1:<name>"
//   PoC gs1:defaultLink list         → linktype "gs1:defaultLink" and defaultLinktype "gs1:defaultLink"
//                                      (CE then negotiates over the same candidate list as the PoC)
// CE requires itemDescription and title; missing values are filled from the anchor / link type.
// Differences in the two data models are a threat to validity — record them in the report (§7.7).
import { readFileSync, writeFileSync } from 'node:fs';
import { GS1_VOC } from '../src/pipeline/03_linksetResolver.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };
const IN = opt('in', 'data/linksets.json');
const OUT = opt('out');
const UPLOAD = opt('upload');
const TOKEN = opt('token', 'secret');
const BATCH = Number(opt('batch', 500));

const store = JSON.parse(readFileSync(IN, 'utf8'));
const docs = Object.entries(store).map(([key, rec]) => {
  const [, gtin, ...q] = key.split('/');
  const qualifiers = [];
  for (let i = 0; i < q.length; i += 2) qualifiers.push({ [q[i]]: q[i + 1] });
  const links = [];
  for (const [rel, list] of Object.entries(rec.links)) {
    const name = rel.startsWith(GS1_VOC) ? rel.slice(GS1_VOC.length) : rel;
    for (const l of list) {
      links.push({
        linktype: `gs1:${name}`, href: l.href, title: l.title || name,
        type: l.type || 'text/html', hreflang: l.hreflang || ['und'],
        ...(l.context ? { context: l.context } : {}),
      });
    }
  }
  return {
    anchor: `/01/${gtin}`,
    itemDescription: rec.itemDescription || `Product ${gtin}`,
    defaultLinktype: 'gs1:defaultLink',
    ...(qualifiers.length ? { qualifiers } : {}),
    links,
  };
});

console.log(`${docs.length} CE documents, ${docs.reduce((n, d) => n + d.links.length, 0)} links`);
if (OUT) { writeFileSync(OUT, JSON.stringify(docs, null, 2)); console.log(`written ${OUT}`); }

if (UPLOAD) {
  const url = `${UPLOAD.replace(/\/$/, '')}/api/new`;
  let ok = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const res = await fetch(url, {
      method: 'POST', body: JSON.stringify(batch),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    });
    if (res.status >= 300) { console.error(`batch ${i / BATCH}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`); process.exit(1); }
    ok += batch.length;
    process.stdout.write(`\ruploaded ${ok}/${docs.length}`);
  }
  console.log(`\ndone → ${url}`);
}

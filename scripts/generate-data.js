#!/usr/bin/env node
// Synthetic linkset generator (§7.6) — produces datasets of an exact number of links (e.g. 10,000 / 100,000).
//
//   node scripts/generate-data.js --links 10000 --seed 42 --out data/generated/linksets-10k.json
//
// Options
//   --links N        exact total number of links in the output (default 10000)
//   --seed S         PRNG seed; same seed + profile → byte-identical output (default 42)
//   --profile FILE   statistical profile (default scripts/profile.default.json)
//   --no-fixtures    do not include the hand-written probe fixtures from data/linksets.json
//   --out FILE       output path (default data/generated/linksets-<N>.json)
//
// GTINs use the same Mod-10 routine as the Identifier Validator, so every generated identifier is valid.
// The probe fixtures (GTIN 08859999000018 etc.) are copied in first so T-01–T-12 also run on large datasets.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDigit } from '../src/pipeline/validator.js';
import { GS1_VOC, DEFAULT_LINK } from '../src/pipeline/linksetResolver.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };

const TARGET = Number(opt('links', 10000));
const SEED = Number(opt('seed', 42));
const PROFILE_FILE = opt('profile', `${root}scripts/profile.default.json`);
const FIXTURES = !args.includes('--no-fixtures');
const OUT = opt('out', `${root}data/generated/linksets-${TARGET}.json`);
const profile = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));

// mulberry32 — small deterministic PRNG
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(SEED);
const chance = (p) => rand() < p;

const full = (t) => GS1_VOC + t.replace(/^gs1:/, '');
const count = (rec) => Object.values(rec.links).reduce((n, l) => n + l.length, 0);

function gtin14(gcp, itemRef) {
  const body13 = ('0' + gcp + String(itemRef).padStart(12 - gcp.length, '0'));
  return body13 + checkDigit(body13);
}

function htmlLinks(base, title, langs) {
  return langs.map((lang) => ({ href: `${base}?lang=${lang}`, title: `${title} (${lang})`, hreflang: [lang], type: 'text/html' }));
}

function makeRecord(gtin, gcp) {
  const langs = ['th', ...(chance(profile.secondLanguage.share) ? [profile.secondLanguage.tag] : [])];
  const links = {};
  links[DEFAULT_LINK] = htmlLinks(`https://smartcatalog.example/catalog/Product/${gtin}`, 'ข้อมูลผลิตภัณฑ์', langs);
  if (chance(profile.jsonLdShare)) {
    links[DEFAULT_LINK].push({ href: `https://data.example/dpp/${gtin}.jsonld`, title: 'Product data (JSON-LD)', type: 'application/ld+json' });
  }
  for (const [type, share] of Object.entries(profile.linkTypes)) {
    if (!chance(share)) continue;
    const name = type.replace(/^gs1:/, '');
    links[full(type)] = name === 'certificationInfo'
      ? [{ href: `https://member.example/${gcp}/cert/${gtin}.pdf`, title: 'Certificate', type: 'application/pdf' }]
      : htmlLinks(`https://brand-${gcp}.example/${name}/${gtin}`, name, langs);
  }
  return { itemDescription: `Synthetic product ${gtin}`, links };
}

// Trim a record so it contributes exactly `left` links (default links are dropped last, at least one kept).
function trimTo(rec, left) {
  const types = Object.keys(rec.links).filter((t) => t !== DEFAULT_LINK);
  while (count(rec) > left && types.length) delete rec.links[types.pop()];
  while (count(rec) > left && rec.links[DEFAULT_LINK].length > 1) rec.links[DEFAULT_LINK].pop();
  return rec;
}

const out = {};
let total = 0;
if (FIXTURES) {
  const fixtures = JSON.parse(readFileSync(`${root}data/linksets.json`, 'utf8'));
  for (const [k, rec] of Object.entries(fixtures)) { out[k] = rec; total += count(rec); }
}

const gcps = profile.companyPrefixes;
let lotRecords = 0;
for (let i = 0; total < TARGET; i++) {
  const gcp = gcps[i % gcps.length];
  const itemRef = Math.floor(i / gcps.length) + 1;
  if (String(itemRef).length > 12 - gcp.length) throw new Error('Ran out of item references; add company prefixes to the profile');
  const gtin = gtin14(gcp, itemRef);
  const key = `01/${gtin}`;
  if (out[key]) continue;

  out[key] = trimTo(makeRecord(gtin, gcp), TARGET - total);
  total += count(out[key]);

  if (total < TARGET && chance(profile.lotShare)) {
    const lot = `L${String(Math.floor(rand() * 1e6)).padStart(6, '0')}`;
    const rec = trimTo({ links: { [DEFAULT_LINK]: [{ href: `https://smartcatalog.example/catalog/Product/${gtin}/lot/${lot}`, title: `Lot ${lot}`, hreflang: ['th'], type: 'text/html' }] } }, TARGET - total);
    out[`${key}/10/${lot}`] = rec;
    total += count(rec);
    lotRecords++;
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));

// Distribution summary → .meta.json (cite this in the report, not the data itself)
const perType = {};
for (const rec of Object.values(out)) for (const [t, l] of Object.entries(rec.links)) perType[t.replace(GS1_VOC, 'gs1:')] = (perType[t.replace(GS1_VOC, 'gs1:')] || 0) + l.length;
const meta = {
  generatedAt: new Date().toISOString(), generator: 'scripts/generate-data.js', node: process.version,
  seed: SEED, profileFile: PROFILE_FILE, profile, fixturesIncluded: FIXTURES,
  identifiers: Object.keys(out).length, lotLevelRecords: lotRecords, links: total, linksPerType: perType,
};
writeFileSync(OUT.replace(/\.json$/, '.meta.json'), JSON.stringify(meta, null, 2));
console.log(`${OUT}\n  identifiers ${meta.identifiers} (lot-level ${lotRecords}), links ${total}`);
console.log('  links per type', perType);

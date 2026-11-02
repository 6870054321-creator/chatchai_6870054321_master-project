#!/usr/bin/env node
// Runs the shared test cases (T-01–T-12 + supplemental S-xx, see cases.js) against any resolver,
// for one or more rounds, and records every observation with its run metadata (§7.7).
// The same script is used for the current GS1TH Smart Catalog endpoint, the PoC, and GS1 Resolver CE.
//
// Usage:
//   BASE_URL=http://localhost:8080 node tests/run-cases.js --label poc --rounds 3
//   BASE_URL=https://<host>/catalog/resolver GTIN=<permitted real GTIN-14> node tests/run-cases.js --label production
//
// Options:
//   --label NAME     name used in the result file (default "run")
//   --rounds N       repeat the whole suite N times (default 1; the proposal uses at least 3)
//   --gap SECONDS    wait between rounds (default 0)
//   --core-only      run T-01–T-12 only
//
// Env:
//   BASE_URL        resolver root including any path prefix (no trailing slash)
//   GTIN            valid GTIN-14 that has links in the target system  (default: PoC sample)
//   LOT             batch/lot value with lot-level links              (default: LOT01)
//   GTIN_BADCHECK   GTIN-14 with a wrong check digit                  (default: derived from GTIN)
//   GTIN_OUTRANGE   valid GTIN-14 outside the served prefix range     (default: 09506000134352, GS1 example)
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildCases } from './cases.js';
import { collectMeta, probeServerInfo } from './lib/meta.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const GTIN = process.env.GTIN || '08859999000018';
const ctx = {
  BASE, ORIGIN: new URL(BASE).origin, GTIN,
  LOT: process.env.LOT || 'LOT01',
  BAD: process.env.GTIN_BADCHECK || GTIN.slice(0, 13) + ((Number(GTIN[13]) + 1) % 10),
  OUT: process.env.GTIN_OUTRANGE || '09506000134352',
};
const LABEL = opt('label', 'run');
const ROUNDS = Number(opt('rounds', 1));
const GAP = Number(opt('gap', 0));
const cases = buildCases(ctx).filter((c) => !args.includes('--core-only') || c.group === 'core');

async function probe(c) {
  const t0 = performance.now();
  const res = await fetch(c.url, { method: c.method || 'GET', redirect: 'manual', headers: c.headers || {} });
  const text = await res.text();
  const ms = performance.now() - t0;
  return {
    id: c.id, group: c.group, name: c.name, method: c.method || 'GET', url: c.url, requestHeaders: c.headers || {},
    requirements: c.requirements, status: res.status, location: res.headers.get('location'),
    contentType: res.headers.get('content-type'), vary: res.headers.get('vary'), link: res.headers.get('link'),
    cacheControl: res.headers.get('cache-control'), ms: Math.round(ms * 10) / 10,
    body: res.status === 200 ? text.slice(0, 2000) : undefined,
  };
}

async function runRound(n) {
  const startedAt = new Date().toISOString();
  const results = [];
  for (const c of cases) {
    try { results.push(await probe(c)); } catch (e) { results.push({ id: c.id, group: c.group, name: c.name, url: c.url, error: e.message }); }
  }
  const baseline = results.find((r) => r.id === 'T-01');
  for (const r of results) {
    const c = cases.find((x) => x.id === r.id);
    r.pass = !r.error && !!c.check(r, baseline);
  }
  return { round: n, startedAt, results };
}

const meta = collectMeta({ label: LABEL, base: BASE, rounds: ROUNDS, target: await probeServerInfo(BASE) });
const rounds = [];
for (let n = 1; n <= ROUNDS; n++) {
  rounds.push(await runRound(n));
  if (n < ROUNDS && GAP > 0) await new Promise((ok) => setTimeout(ok, GAP * 1000));
}
meta.finishedAt = new Date().toISOString();

// ── report ───────────────────────────────────────────────────────────────
const short = (s, n = 58) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '–');
const is3xx = (s) => s >= 300 && s < 400;
console.log(`\n${LABEL}  ${BASE}  (${meta.finishedAt}, ${ROUNDS} รอบ)\n`);
console.log('| รหัส | การทดสอบ | สถานะ | Location / Content-Type | Vary | ผลแต่ละรอบ | คงที่ทุกรอบ |');
console.log('|---|---|---|---|---|---|---|');
for (const c of cases) {
  const obs = rounds.map((r) => r.results.find((x) => x.id === c.id));
  const r = obs[0];
  const where = r.error ? `ERROR: ${r.error}` : is3xx(r.status) ? short(r.location) : short(r.contentType);
  const stable = obs.every((o) => o.status === r.status && o.location === r.location);
  console.log(`| ${c.id} | ${c.name} | ${r.status ?? '–'} | ${where} | ${r.vary || '–'} | ${obs.map((o) => (o.pass ? 'ผ่าน' : 'ไม่ผ่าน')).join(' / ')} | ${stable ? 'ใช่' : 'ไม่'} |`);
}
for (const group of ['core', 'supplemental']) {
  const inGroup = rounds[0].results.filter((r) => r.group === group);
  if (!inGroup.length) continue;
  const perRound = rounds.map((rd) => rd.results.filter((r) => r.group === group && r.pass).length);
  console.log(`${group === 'core' ? 'กรณีหลัก T-01–T-12' : 'กรณีเสริม (ชั่วคราว)'}: ผ่าน ${perRound.join(' / ')} จาก ${inGroup.length} กรณี`);
}

mkdirSync('results', { recursive: true });
const file = `results/cases-${LABEL}-${meta.finishedAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ meta, rounds }, null, 2));
console.log(`บันทึกผลไว้ที่ ${file}`);

#!/usr/bin/env node
// Response-time measurement (§7.7): P50 / P95 / P99 for the PoC and GS1 Resolver CE on the same dataset.
//
//   BASE_URL=http://localhost:8080 node tests/bench.js --data data/generated/linksets-10000.json --label poc-10k
//
// Options
//   --data FILE         PoC dataset whose identifiers are sampled (load the same data into CE with scripts/export-ce.js)
//   --requests N        measured requests (default 5000)
//   --warmup N          unmeasured requests sent first (default 500)
//   --concurrency C     requests in flight at once (default 10)
//   --seed S            seed for sampling identifiers and scenarios (default 1)
//   --label NAME        name used in the result file
//   --force             skip the pre-flight check that the target holds this dataset
//
// Fairness notes (report them with the numbers):
//   * run both systems with the same container limits (docker-compose: 1 CPU / 512 MB) on the same host
//   * start the PoC with LOG_REQUESTS=0 so console logging is not measured
//   * the client runs on the same host, so latency excludes the network — compare systems, not absolute values
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { collectMeta, probeServerInfo } from './lib/meta.js';
import { BROWSER_ACCEPT } from './cases.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : def; };
const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const DATA = opt('data', 'data/generated/linksets-10000.json');
const N = Number(opt('requests', 5000));
const WARMUP = Number(opt('warmup', 500));
const C = Number(opt('concurrency', 10));
const SEED = Number(opt('seed', 1));
const LABEL = opt('label', 'bench');

// Request mix: what callers of a product URI typically ask for
const SCENARIOS = [
  { name: 'default (browser)', weight: 0.6, q: '', headers: { Accept: BROWSER_ACCEPT, 'Accept-Language': 'th' } },
  { name: 'linkType=gs1:pip', weight: 0.15, q: '?linkType=gs1:pip', headers: { Accept: BROWSER_ACCEPT } },
  { name: 'linkset (machine)', weight: 0.15, q: '', headers: { Accept: 'application/linkset+json' } },
  { name: 'Accept-Language: en', weight: 0.1, q: '', headers: { Accept: BROWSER_ACCEPT, 'Accept-Language': 'en' } },
];

let s = SEED >>> 0;
const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pickScenario = () => { let x = rand(); for (const sc of SCENARIOS) { if ((x -= sc.weight) < 0) return sc; } return SCENARIOS[0]; };

const keys = Object.keys(JSON.parse(readFileSync(DATA, 'utf8')));
const plan = Array.from({ length: WARMUP + N }, () => {
  const sc = pickScenario();
  return { sc, url: `${BASE}/${keys[Math.floor(rand() * keys.length)]}${sc.q}` };
});

async function one(p) {
  const t0 = performance.now();
  const res = await fetch(p.url, { redirect: 'manual', headers: p.sc.headers });
  await res.arrayBuffer();
  return { ms: performance.now() - t0, status: res.status, scenario: p.sc.name };
}

async function runAll(items) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: C }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await one(items[i]); } catch (e) { out[i] = { ms: NaN, status: 0, error: e.message, scenario: items[i].sc.name }; }
    }
  }));
  return out;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]; // nearest-rank
function summarise(samples) {
  const ok = samples.filter((x) => Number.isFinite(x.ms)).map((x) => x.ms).sort((a, b) => a - b);
  const r = (v) => Math.round(v * 100) / 100;
  const statuses = {};
  for (const x of samples) statuses[x.status] = (statuses[x.status] || 0) + 1;
  return {
    n: samples.length, errors: samples.length - ok.length, statuses,
    p50: r(pct(ok, 50)), p95: r(pct(ok, 95)), p99: r(pct(ok, 99)),
    mean: r(ok.reduce((a, b) => a + b, 0) / ok.length), max: r(ok[ok.length - 1]),
  };
}

// Pre-flight: the target must actually hold this dataset, otherwise we would only be timing 404s.
if (!args.includes('--force')) {
  const sample = Array.from({ length: 20 }, () => keys[Math.floor(rand() * keys.length)]);
  let missing = 0;
  for (const k of sample) {
    const r = await fetch(`${BASE}/${k}?linkType=all`, { redirect: 'manual' });
    await r.arrayBuffer();
    if (r.status === 404) missing++;
  }
  if (missing >= sample.length / 2) {
    console.error(`หยุดการวัด: ${missing}/${sample.length} ตัวระบุที่สุ่มจาก ${DATA} ได้ 404 จาก ${BASE}`);
    console.error('ระบบเป้าหมายไม่ได้โหลดข้อมูลชุดนี้ — เริ่มต้นแบบด้วย DATA_FILE ชุดเดียวกัน หรือใช้ --force ถ้าตั้งใจ');
    process.exit(1);
  }
}

const meta = collectMeta({ label: LABEL, base: BASE, dataset: DATA, identifiersInDataset: keys.length, requests: N, warmup: WARMUP, concurrency: C, seed: SEED, scenarios: SCENARIOS.map(({ name, weight }) => ({ name, weight })), target: await probeServerInfo(BASE) });

process.stdout.write(`warm-up ${WARMUP}… `);
await runAll(plan.slice(0, WARMUP));
process.stdout.write(`measuring ${N} requests (concurrency ${C})… `);
const t0 = performance.now();
const samples = await runAll(plan.slice(WARMUP));
const seconds = (performance.now() - t0) / 1000;
meta.finishedAt = new Date().toISOString();

const overall = { ...summarise(samples), throughputRps: Math.round(N / seconds) };
const byScenario = Object.fromEntries(SCENARIOS.map((sc) => [sc.name, summarise(samples.filter((x) => x.scenario === sc.name))]));

console.log('done\n');
console.log(`${LABEL}  ${BASE}  dataset ${DATA} (${keys.length} identifiers)`);
console.log('| กลุ่มคำขอ | n | P50 (ms) | P95 (ms) | P99 (ms) | สถานะที่ได้ |');
console.log('|---|---|---|---|---|---|');
for (const [name, x] of [['ทั้งหมด', overall], ...Object.entries(byScenario)]) {
  console.log(`| ${name} | ${x.n} | ${x.p50} | ${x.p95} | ${x.p99} | ${Object.entries(x.statuses).map(([k, v]) => `${k}×${v}`).join(', ')} |`);
}
console.log(`throughput ≈ ${overall.throughputRps} req/s, errors ${overall.errors}`);

mkdirSync('results', { recursive: true });
const file = `results/bench-${LABEL}-${meta.finishedAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ meta, overall, byScenario }, null, 2));
console.log(`บันทึกผลไว้ที่ ${file}`);

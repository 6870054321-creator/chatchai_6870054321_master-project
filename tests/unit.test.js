import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDigit, normaliseGtin, validate } from '../src/pipeline/02_validator.js';
import { parse } from '../src/pipeline/01_parser.js';

const cfg = { allowedPrefixes: ['885'] };
const q = (s = '') => new URLSearchParams(s);

test('Mod-10 check digit (GS1 General Specifications)', () => {
  assert.equal(checkDigit('0950600013435'), 2); // GS1 example GTIN 09506000134352
  assert.equal(checkDigit('0885999900001'), 8);
});

test('GTIN-13 is normalised to GTIN-14', () => {
  assert.equal(normaliseGtin('8859999000018'), '08859999000018');
});

test('parser separates primary key and key qualifiers', () => {
  const p = parse('/01/08859999000018/10/LOT01', q('linkType=gs1:pip&17=261231'));
  assert.equal(p.primary.value, '08859999000018');
  assert.deepEqual(p.qualifiers, [{ ai: '10', value: 'LOT01' }]);
  assert.equal(p.linkType, 'gs1:pip');
  assert.equal(p.attributes['17'], '261231');
});

test('data attribute in the path is rejected (AI 17 belongs in query string)', () => {
  assert.throws(() => parse('/01/08859999000018/17/261231', q()), { status: 400 });
});

test('qualifiers out of order are rejected', () => {
  assert.throws(() => parse('/01/08859999000018/21/SER1/10/LOT01', q()), { status: 400 });
});

test('wrong check digit → 400, out-of-prefix → 404', () => {
  assert.throws(() => validate(parse('/01/08859999000019', q()), cfg), { status: 400 });
  assert.throws(() => validate(parse('/01/09506000134352', q()), cfg), { status: 404 });
});

test('generated data: every GTIN passes the validator and link count is exact', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const out = `${mkdtempSync(`${tmpdir()}/gen-`)}/d.json`;
  execFileSync(process.execPath, ['scripts/generate-data.js', '--links', '1000', '--seed', '7', '--out', out]);
  const data = JSON.parse(readFileSync(out, 'utf8'));
  let links = 0;
  for (const [key, rec] of Object.entries(data)) {
    validate(parse(`/${key}`, q()), cfg); // throws if any generated identifier is invalid
    for (const l of Object.values(rec.links)) links += l.length;
  }
  assert.equal(links, 1000);
});

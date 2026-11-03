// Link Ingest API + Linkset Store, exercised in-process (no network)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { LinksetStore } from '../src/store/linksetStore.js';
import { negotiate } from '../src/pipeline/04_contentNegotiator.js';

const config = { resolverRoot: 'http://r.test', allowedPrefixes: ['885'], redirectStatus: 307, ingestToken: 'tok', persist: false };
const AUTH = { authorization: 'Bearer tok', 'content-type': 'application/json' };
const body = (links, extra = {}) => JSON.stringify({ links, ...extra });
const okLinks = { 'gs1:defaultLink': [{ href: 'https://sc.example/p', hreflang: 'th', type: 'text/html' }], 'gs1:pip': [{ href: 'https://brand.example/p', title: 'PIP' }] };

function setup() {
  const store = new LinksetStore();
  const app = createApp({ config, store });
  const call = (method, path, headers = {}, b = '') => app.handle({ method, url: new URL(path, config.resolverRoot), headers, body: b });
  return { store, call };
}

test('PUT creates, second PUT replaces, GET reads back', () => {
  const { store, call } = setup();
  assert.equal(call('PUT', '/api/v1/linksets/01/08859999000032', AUTH, body(okLinks)).status, 201);
  assert.equal(call('PUT', '/api/v1/linksets/01/08859999000032', AUTH, body(okLinks)).status, 200);
  const rec = JSON.parse(call('GET', '/api/v1/linksets/01/08859999000032', AUTH).body);
  assert.equal(rec.key, '01/08859999000032');
  assert.deepEqual(rec.links['https://gs1.org/voc/defaultLink'][0].hreflang, ['th']); // string → array
  assert.deepEqual(store.stats(), { identifiers: 1, links: 2 });
});

test('ingested linkset is served immediately by the read path', () => {
  const { call } = setup();
  call('PUT', '/api/v1/linksets/01/08859999000032', AUTH, body(okLinks));
  const r = call('GET', '/01/08859999000032?linkType=gs1:pip', { accept: 'text/html' });
  assert.equal(r.status, 307);
  assert.equal(r.headers.Location, 'https://brand.example/p');
});

test('GTIN-13 at ingest is stored under the GTIN-14 key (same normalisation as the read path)', () => {
  const { store, call } = setup();
  call('PUT', '/api/v1/linksets/01/8859999000032', AUTH, body(okLinks));
  assert.ok(store.has('01/08859999000032'));
});

test('identifier rules are shared with stage 2: bad check digit / out-of-prefix → 422 at ingest', () => {
  const { store, call } = setup();
  assert.equal(call('PUT', '/api/v1/linksets/01/08859999000033', AUTH, body(okLinks)).status, 422);
  assert.equal(call('PUT', '/api/v1/linksets/01/09506000134352', AUTH, body(okLinks)).status, 422);
  assert.equal(call('PUT', '/api/v1/linksets/01/08859999000032/17/261231', AUTH, body(okLinks)).status, 422);
  assert.equal(store.stats().identifiers, 0);
});

test('body validation: defaultLink required, http(s) href, GS1 link types only', () => {
  const { call } = setup();
  const noDefault = call('PUT', '/api/v1/linksets/01/08859999000032', AUTH, body({ 'gs1:pip': okLinks['gs1:pip'] }));
  assert.equal(noDefault.status, 422);
  const bad = JSON.parse(call('PUT', '/api/v1/linksets/01/08859999000032', AUTH,
    body({ ...okLinks, 'gs1:pip': [{ href: 'javascript:alert(1)' }], 'x:custom': [{ href: 'https://a.example' }] })).body);
  assert.deepEqual(bad.errors.map((e) => e.path).sort(), ['$.links["gs1:pip"][0].href', '$.links["x:custom"]']);
  assert.equal(call('PUT', '/api/v1/linksets/01/08859999000032', AUTH, '{not json').status, 400);
  assert.equal(call('PUT', '/api/v1/linksets/01/08859999000032', { authorization: 'Bearer tok' }, body(okLinks)).status, 415);
});

test('access control: missing token 401, wrong token 403, disabled when no token configured', () => {
  const { call } = setup();
  assert.equal(call('PUT', '/api/v1/linksets/01/08859999000032', {}, body(okLinks)).status, 401);
  assert.equal(call('PUT', '/api/v1/linksets/01/08859999000032', { ...AUTH, authorization: 'Bearer nope' }, body(okLinks)).status, 403);
  const app = createApp({ config: { ...config, ingestToken: '' }, store: new LinksetStore() });
  assert.equal(app.handle({ method: 'GET', url: new URL('http://r.test/api/v1/linksets/01/08859999000032'), headers: AUTH }).status, 404);
});

test('DELETE removes the linkset; resolver then answers 404', () => {
  const { call } = setup();
  call('PUT', '/api/v1/linksets/01/08859999000032', AUTH, body(okLinks));
  assert.equal(call('DELETE', '/api/v1/linksets/01/08859999000032', AUTH).status, 204);
  assert.equal(call('GET', '/01/08859999000032', { accept: 'text/html' }).status, 404);
  assert.equal(call('DELETE', '/api/v1/linksets/01/08859999000032', AUTH).status, 404);
});

test('resolver path rejects writes with 405', () => {
  const { call } = setup();
  assert.equal(call('POST', '/01/08859999000032', AUTH, body(okLinks)).status, 405);
});

test('content negotiation: media type first, then language, then registration order', () => {
  const candidates = [
    { href: 'th-html', type: 'text/html', hreflang: ['th'] },
    { href: 'en-html', type: 'text/html', hreflang: ['en'] },
    { href: 'jsonld', type: 'application/ld+json' },
  ];
  const pick = (headers) => negotiate({ mode: 'link', candidates, headers }).chosen.href;
  assert.equal(pick({}), 'th-html');
  assert.equal(pick({ accept: 'text/html', 'accept-language': 'en-GB,en;q=0.9' }), 'en-html');
  assert.equal(pick({ accept: 'application/ld+json' }), 'jsonld');
  assert.equal(pick({ accept: 'image/png' }), 'th-html'); // nothing acceptable → default link still works
});

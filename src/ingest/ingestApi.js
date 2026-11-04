// Link Ingest API (§4.2.1) — the write path into the Linkset Store.
//
//   PUT    /api/v1/linksets/01/{gtin}[/22/{cpv}][/10/{lot}][/21/{serial}]   create or replace the linkset
//   GET    /api/v1/linksets/01/{gtin}…                                     read the stored record
//   DELETE /api/v1/linksets/01/{gtin}…                                     remove the linkset
//
// Identifier checks reuse stage 1 (parser) and stage 2 (validator) of the request pipeline, so an identifier
// that the resolver would answer with 400/404 can never be registered in the first place (ADR-001).
// Access: Authorization: Bearer <INGEST_TOKEN>; the API is disabled when INGEST_TOKEN is empty (ADR-008).
// DPP: the system that hosts the passports registers their addresses here. If the passports move, only the
// linkset changes; the QR code printed on the product stays the same.
import { timingSafeEqual } from 'node:crypto';
import { parse } from '../pipeline/01_parser.js';
import { validate } from '../pipeline/02_validator.js';
import { keyFor } from '../pipeline/03_linksetResolver.js';
import { validateLinksetBody } from './linksetSchema.js';

export const INGEST_PREFIX = '/api/v1/linksets';
const MAX_BODY = 1024 * 1024;

const json = (status, obj, extra = {}) => ({
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }, body: JSON.stringify(obj, null, 2),
});
const problem = (status, title, detail, extra = {}) => ({
  status, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
  body: JSON.stringify({ status, title, detail, ...extra }),
});

function authorised(header, token) {
  const m = /^Bearer\s+(.+)$/i.exec(header || '');
  if (!m) return false;
  const a = Buffer.from(m[1]); const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function handleIngest(req, { config, store }) {
  if (!config.ingestToken) return problem(404, 'Not found', 'Link Ingest API is disabled (INGEST_TOKEN not set)');
  if (!req.headers.authorization) return problem(401, 'Unauthorised', 'Missing Authorization: Bearer <token>');
  if (!authorised(req.headers.authorization, config.ingestToken)) return problem(403, 'Forbidden', 'Invalid token');

  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    return { status: 405, headers: { Allow: 'GET, PUT, DELETE' }, body: '' };
  }

  // Stage 1 + 2 of the request pipeline, applied to the identifier being registered.
  let key;
  try {
    const keyPath = req.url.pathname.slice(INGEST_PREFIX.length);
    const valid = validate(parse(keyPath, new URLSearchParams()), config);
    key = keyFor(valid.gtin14, valid.qualifiers);
  } catch (e) {
    if (!e.status) throw e;
    // At ingest time every identifier problem is a client error about the submitted data → 422
    return problem(422, e.title, e.message);
  }
  const location = `${INGEST_PREFIX}/${key}`;

  if (req.method === 'GET') {
    const rec = store.get(key);
    return rec ? json(200, { key, ...rec }) : problem(404, 'Not found', `No linkset stored for ${key}`);
  }

  if (req.method === 'DELETE') {
    if (!store.delete(key)) return problem(404, 'Not found', `No linkset stored for ${key}`);
    if (config.persist) store.saveTo(config.dataFile);
    return { status: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  }

  // PUT
  if (!/^application\/(json|linkset\+json)\b/i.test(req.headers['content-type'] || '')) {
    return problem(415, 'Unsupported media type', 'Content-Type must be application/json');
  }
  if (Buffer.byteLength(req.body || '') > MAX_BODY) return problem(413, 'Payload too large', `Max ${MAX_BODY} bytes`);
  let body;
  try { body = JSON.parse(req.body || ''); } catch { return problem(400, 'Malformed JSON', 'Request body is not valid JSON'); }

  let record;
  try { record = validateLinksetBody(body); } catch (e) {
    if (!e.errors) throw e;
    return problem(e.status, e.title, e.message, { errors: e.errors });
  }

  const result = store.put(key, record);
  if (config.persist) store.saveTo(config.dataFile);
  const linkCount = Object.values(record.links).reduce((n, l) => n + l.length, 0);
  return json(result === 'created' ? 201 : 200, { key, result, linkTypes: Object.keys(record.links).length, links: linkCount }, { Location: location });
}

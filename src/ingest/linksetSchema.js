// Body validation for the Link Ingest API.
// Identifier rules are NOT here: they come from pipeline/01_parser.js + pipeline/02_validator.js (single source, ADR-001).
// This file only checks the shape of the links the member system sends.
import { expandLinkType, GS1_VOC, DEFAULT_LINK } from '../pipeline/03_linksetResolver.js';

const LINK_TYPE_RE = /^[A-Za-z][A-Za-z0-9]*$/;                 // local name in the GS1 Web Vocabulary
const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;         // BCP 47 (simplified)
const MEDIA_TYPE_RE = /^[\w.+-]+\/[\w.+-]+$/;                  // type/subtype, no parameters
const MAX_TYPES = 50;
const MAX_LINKS_PER_TYPE = 100;

export class SchemaError extends Error {
  constructor(errors) {
    super(`${errors.length} problem(s) in request body`);
    this.status = 422; this.title = 'Invalid linkset'; this.errors = errors;
  }
}

function normaliseLinkTypeKey(key) {
  const full = expandLinkType(key);
  if (!full.startsWith(GS1_VOC)) return null;                  // only GS1 Web Vocabulary link types (ADR-007)
  return LINK_TYPE_RE.test(full.slice(GS1_VOC.length)) ? full : null;
}

function isAbsoluteHttpUrl(s) {
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

// Returns a normalised record { itemDescription?, links: { <full link type URI>: [link…] } } or throws SchemaError.
export function validateLinksetBody(body) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });

  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SchemaError([{ path: '$', message: 'Body must be a JSON object' }]);
  if (body.itemDescription !== undefined && typeof body.itemDescription !== 'string') err('$.itemDescription', 'must be a string');
  if (!body.links || typeof body.links !== 'object' || Array.isArray(body.links)) {
    throw new SchemaError([{ path: '$.links', message: 'must be an object keyed by link type, e.g. {"gs1:pip": [...]}' }]);
  }

  const keys = Object.keys(body.links);
  if (keys.length > MAX_TYPES) err('$.links', `at most ${MAX_TYPES} link types`);

  const links = {};
  for (const key of keys) {
    const path = `$.links["${key}"]`;
    const relation = normaliseLinkTypeKey(key);
    if (!relation) { err(path, 'link type must be gs1:<name> or https://gs1.org/voc/<name>'); continue; }
    if (links[relation]) { err(path, 'duplicate link type (same type given in short and full form)'); continue; }
    const list = body.links[key];
    if (!Array.isArray(list) || list.length === 0) { err(path, 'must be a non-empty array'); continue; }
    if (list.length > MAX_LINKS_PER_TYPE) err(path, `at most ${MAX_LINKS_PER_TYPE} links per type`);

    links[relation] = list.map((l, i) => {
      const p = `${path}[${i}]`;
      if (!l || typeof l !== 'object') { err(p, 'must be an object'); return null; }
      const out = {};
      if (!isAbsoluteHttpUrl(l.href)) err(`${p}.href`, 'must be an absolute http(s) URL'); else out.href = l.href;
      if (l.title !== undefined) { if (typeof l.title !== 'string') err(`${p}.title`, 'must be a string'); else out.title = l.title; }
      if (l.hreflang !== undefined) {
        const langs = Array.isArray(l.hreflang) ? l.hreflang : [l.hreflang];
        if (!langs.every((x) => typeof x === 'string' && LANG_RE.test(x))) err(`${p}.hreflang`, 'must be BCP 47 language tag(s)');
        else out.hreflang = langs;
      }
      if (l.type !== undefined) { if (typeof l.type !== 'string' || !MEDIA_TYPE_RE.test(l.type)) err(`${p}.type`, 'must be a media type, e.g. text/html'); else out.type = l.type; }
      if (l.context !== undefined) { if (typeof l.context !== 'string') err(`${p}.context`, 'must be a string'); else out.context = l.context; }
      return out;
    });
  }

  if (!links[DEFAULT_LINK] && !errors.some((e) => e.path.startsWith('$.links["'))) {
    err('$.links', 'a gs1:defaultLink is required (used when the caller does not ask for a link type)');
  }
  if (errors.length) throw new SchemaError(errors);

  const record = { links };
  if (body.itemDescription) record.itemDescription = body.itemDescription;
  return record;
}

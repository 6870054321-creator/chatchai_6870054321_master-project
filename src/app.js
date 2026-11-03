// Linkset Management Layer — proof of concept (§4.2)
//
//   Read path : URI Parser → Identifier Validator → Linkset Resolver → Content Negotiator → Response Builder
//   Write path: Link Ingest API → (same parser + validator) → Linkset Store
//   Discovery : /.well-known/gs1resolver (Resolver Description File)
import { parse } from './pipeline/01_parser.js';
import { validate } from './pipeline/02_validator.js';
import { resolve } from './pipeline/03_linksetResolver.js';
import { negotiate } from './pipeline/04_contentNegotiator.js';
import { build, buildError } from './pipeline/05_responseBuilder.js';
import { handleIngest, INGEST_PREFIX } from './ingest/ingestApi.js';

export function resolverDescription(config) {
  return {
    name: 'GS1 Thailand Linkset Management Layer (PoC)',
    resolverRoot: config.resolverRoot,
    supportedPrimaryKeys: ['01'],
    linkTypeDefaultCanBeLinkset: false,
    supportedContextValuesEnumerated: [],
  };
}

// req = { method, url: URL, headers: lower-cased object, body?: string }
// returns { status, headers, body }
export function createApp({ config, store }) {
  const description = JSON.stringify(resolverDescription(config), null, 2);

  function handle(req) {
    const { method, url, headers } = req;

    if (url.pathname === INGEST_PREFIX || url.pathname.startsWith(`${INGEST_PREFIX}/`)) {
      return handleIngest(req, { config, store });
    }
    if (method !== 'GET' && method !== 'HEAD') {
      return { status: 405, headers: { Allow: 'GET, HEAD' }, body: '' };
    }
    if (url.pathname === '/.well-known/gs1resolver') {
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: description };
    }
    if (url.pathname === '/health') {
      const s = store.stats();
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ok', links_loaded: s.links }) };
    }
    try {
      const parsed = parse(url.pathname, url.searchParams);   // 1
      const valid = validate(parsed, config);                // 2
      const resolved = resolve({ ...valid, headers }, store); // 3
      const negotiated = negotiate(resolved);                 // 4
      return build(negotiated, config);                       // 5
    } catch (err) {
      if (!err.status) console.error(err);
      return buildError(err);
    }
  }

  return { handle };
}

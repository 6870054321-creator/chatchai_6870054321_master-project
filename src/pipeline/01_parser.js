// Stage 1 — URI Parser
// Splits a GS1 Digital Link URI path into primary key, key qualifiers and query parameters
// (GS1 Digital Link URI Syntax: key qualifiers live in the path, data attributes in the query string).

// Key qualifiers allowed after AI 01 (GTIN), in the order the standard requires: CPV, batch/lot, serial.
const GTIN_QUALIFIERS = ['22', '10', '21'];

export class ParseError extends Error {
  constructor(detail) { super(detail); this.status = 400; this.title = 'Malformed GS1 Digital Link URI'; }
}

export function parse(pathname, searchParams) {
  const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new ParseError('Path must contain AI/value pairs, e.g. /01/{gtin}');
  }
  const [primaryAi, primaryValue, ...rest] = segments;
  if (primaryAi !== '01') {
    throw new ParseError(`Primary key AI ${primaryAi} is not supported by this resolver (supported: 01)`);
  }

  const qualifiers = [];
  let lastIndex = -1;
  for (let i = 0; i < rest.length; i += 2) {
    const ai = rest[i];
    const idx = GTIN_QUALIFIERS.indexOf(ai);
    if (idx === -1) throw new ParseError(`AI ${ai} is not a key qualifier of GTIN; data attributes belong in the query string`);
    if (idx <= lastIndex) throw new ParseError(`Key qualifier AI ${ai} is out of order (required order: 22, 10, 21)`);
    lastIndex = idx;
    qualifiers.push({ ai, value: rest[i + 1] });
  }

  const linkType = searchParams.get('linkType');
  const context = searchParams.get('context');
  const attributes = {};
  for (const [k, v] of searchParams) {
    if (k !== 'linkType' && k !== 'context') attributes[k] = v;
  }

  return { primary: { ai: '01', value: primaryValue }, qualifiers, linkType, context, attributes };
}

// Stage 3 — Linkset Resolver
// Looks up the linkset for the identifier (most specific key first, then GTIN level)
// and decides whether the caller wants the whole linkset or a single link type.
// DPP: ?linkType=gs1:dpp selects the passport; gs1:sustainabilityInfo, gs1:certificationInfo, gs1:safetyInfo
// and gs1:traceability select one part of it. A batch- or serial-level linkset is tried first (ADR-009).

export const GS1_VOC = 'https://gs1.org/voc/';
export const DEFAULT_LINK = `${GS1_VOC}defaultLink`;

export class NotFoundError extends Error {
  constructor(title, detail) { super(detail); this.status = 404; this.title = title; }
}

export function expandLinkType(linkType) {
  if (!linkType) return null;
  if (linkType.startsWith('gs1:')) return GS1_VOC + linkType.slice(4);
  return linkType;
}

export function keyFor(gtin14, qualifiers) {
  return ['01', gtin14, ...qualifiers.flatMap((q) => [q.ai, q.value])].join('/');
}

// store: anything with get(key) → record | null  (see src/store/linksetStore.js)
export function resolve(req, store) {
  // Try the most specific key, then drop qualifiers one by one (e.g. /10/LOT → GTIN level). ADR-009
  let record = null;
  let matchedKey = null;
  for (let n = req.qualifiers.length; n >= 0 && !record; n--) {
    const k = keyFor(req.gtin14, req.qualifiers.slice(0, n));
    const found = store.get(k);
    if (found) { record = found; matchedKey = k; }
  }
  if (!record) throw new NotFoundError('No linkset for identifier', `No links registered for ${keyFor(req.gtin14, req.qualifiers)}`);

  // ADR-004: Accept: application/json is treated as a linkset request (same as Resolver CE)
  const wantsLinkset =
    req.linkType === 'all' || req.linkType === 'linkset' ||
    /application\/linkset\+json|application\/json/.test(req.headers.accept || '');

  if (wantsLinkset) return { ...req, mode: 'linkset', record, matchedKey };

  const relation = expandLinkType(req.linkType) || DEFAULT_LINK;
  let candidates = record.links[relation] || [];
  if (req.context) candidates = candidates.filter((l) => !l.context || l.context === req.context);
  if (candidates.length === 0) {
    throw new NotFoundError('Requested link type not available', `No link of type ${req.linkType || 'gs1:defaultLink'} for this identifier`);
  }
  return { ...req, mode: 'link', relation, candidates, record, matchedKey };
}

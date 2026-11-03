// Stage 4 — Content Negotiator
// Chooses one link among candidates using Accept (vs link.type) and Accept-Language (vs link.hreflang),
// and records which request headers influenced the response (→ Vary).

function parseQList(header) {
  if (!header) return [];
  return header.split(',').map((part) => {
    const [value, ...params] = part.trim().split(';');
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return { value: value.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1 };
  }).filter((x) => x.value && x.q > 0).sort((a, b) => b.q - a.q);
}

function typeScore(linkType, accepts) {
  if (accepts.length === 0) return 0.001;
  for (const a of accepts) {
    if (linkType && a.value === linkType.toLowerCase()) return a.q;
  }
  for (const a of accepts) {
    if (a.value === '*/*') return a.q * 0.01;
    if (linkType && a.value.endsWith('/*') && linkType.startsWith(a.value.slice(0, -1))) return a.q * 0.1;
  }
  return 0;
}

function langScore(hreflang = [], langs) {
  if (langs.length === 0) return 0;
  for (const l of langs) {
    if (hreflang.some((h) => h.toLowerCase() === l.value || h.toLowerCase().split('-')[0] === l.value.split('-')[0])) return l.q;
  }
  return 0;
}

export function negotiate(res) {
  const vary = ['Accept', 'Accept-Language'];
  if (res.mode === 'linkset') return { ...res, vary };

  const accepts = parseQList(res.headers.accept);
  const langs = parseQList(res.headers['accept-language']);

  // Keep candidates whose media type is acceptable; if none, fall back to all (the default link must still work).
  const scored = res.candidates.map((link, i) => ({ link, i, t: typeScore(link.type, accepts), l: langScore(link.hreflang, langs) }));
  const acceptable = scored.filter((s) => s.t > 0);
  const pool = acceptable.length ? acceptable : scored;
  pool.sort((a, b) => (b.t - a.t) || (b.l - a.l) || (a.i - b.i));
  return { ...res, chosen: pool[0].link, vary };
}

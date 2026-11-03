// Stage 5 — Response Builder
// Turns the decision into HTTP: redirect, linkset document, or a meaningful error status.

export function buildLinkset(res, resolverRoot) {
  const anchor = `${resolverRoot}/${res.matchedKey}`;
  return { linkset: [{ anchor, ...res.record.links }] };
}

export function build(res, { resolverRoot, redirectStatus }) {
  const anchorPath = `/${res.matchedKey}`;
  const linksetHeader = `<${resolverRoot}${anchorPath}?linkType=linkset>; rel="linkset"; type="application/linkset+json"`;
  const headers = { Vary: res.vary.join(', '), Link: linksetHeader };

  if (res.mode === 'linkset') {
    return {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/linkset+json' },
      body: JSON.stringify(buildLinkset(res, resolverRoot), null, 2),
    };
  }
  return { status: redirectStatus, headers: { ...headers, Location: res.chosen.href }, body: '' };
}

export function buildError(err) {
  return {
    status: err.status || 500,
    headers: { 'Content-Type': 'application/problem+json' },
    body: JSON.stringify({ status: err.status || 500, title: err.title || 'Internal error', detail: err.message }),
  };
}

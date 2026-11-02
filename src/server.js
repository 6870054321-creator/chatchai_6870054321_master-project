// Entry point: loads config + Linkset Store, then serves the app over HTTP
import http from 'node:http';
import { loadConfig } from './config.js';
import { LinksetStore } from './store/linksetStore.js';
import { createApp } from './app.js';

const config = loadConfig();
const store = LinksetStore.fromFile(config.dataFile);
const app = createApp({ config, store });

function readBody(req) {
  return new Promise((ok, fail) => {
    if (req.method === 'GET' || req.method === 'HEAD') return ok('');
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 2 * 1024 * 1024) req.destroy(); else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

const server = http.createServer(async (req, res) => {
  let out;
  try {
    const body = await readBody(req);
    out = app.handle({ method: req.method, url: new URL(req.url, config.resolverRoot), headers: req.headers, body });
  } catch (err) {
    console.error(err);
    out = { status: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Internal error' };
  }
  res.writeHead(out.status, out.headers);
  res.end(req.method === 'HEAD' ? '' : out.body);
  if (config.logRequests) console.log(`${new Date().toISOString()} ${req.method} ${req.url} -> ${out.status}`);
});

server.keepAliveTimeout = 65_000;
server.listen(config.port, () => {
  const s = store.stats();
  console.log(`Linkset layer listening on :${config.port} (root ${config.resolverRoot})`);
  console.log(`Loaded ${s.identifiers} identifiers / ${s.links} links from ${config.dataFile}`);
  console.log(`Link Ingest API: ${config.ingestToken ? 'enabled' : 'disabled (set INGEST_TOKEN)'}${config.persist ? ', persisting to DATA_FILE' : ''}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));

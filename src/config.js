// Runtime configuration (all from environment variables; see README)
import { fileURLToPath } from 'node:url';

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8080),
    resolverRoot: (env.RESOLVER_ROOT || 'http://localhost:8080').replace(/\/$/, ''),
    allowedPrefixes: (env.ALLOWED_PREFIXES || '885').split(',').map((s) => s.trim()).filter(Boolean),
    redirectStatus: Number(env.REDIRECT_STATUS || 307), // ADR-002
    dataFile: env.DATA_FILE || fileURLToPath(new URL('../data/linksets.json', import.meta.url)),
    ingestToken: env.INGEST_TOKEN || '',   // empty → Link Ingest API disabled (ADR-008)
    persist: env.PERSIST === '1',          // write ingested changes back to DATA_FILE
    logRequests: env.LOG_REQUESTS !== '0', // turn off during latency measurement
  };
}

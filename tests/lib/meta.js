// Run metadata recorded with every result file (§7.7: time, command, software version, environment)
import os from 'node:os';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const ENV_KEYS = ['BASE_URL', 'GTIN', 'LOT', 'GTIN_BADCHECK', 'GTIN_OUTRANGE'];

export function collectMeta(extra = {}) {
  const cpus = os.cpus();
  return {
    tool: `${pkg.name}@${pkg.version}`,
    command: ['node', ...process.argv.slice(1).map((a) => a.replace(process.cwd() + '/', ''))].join(' '),
    env: Object.fromEntries(ENV_KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
    client: {
      node: process.version, platform: `${os.platform()} ${os.release()}`, arch: os.arch(),
      cpu: `${cpus[0]?.model || 'unknown'} × ${cpus.length}`, memoryGB: Math.round(os.totalmem() / 2 ** 30),
    },
    ...extra,
  };
}

export async function probeServerInfo(base) {
  // What the target says about itself (Server header, Resolver Description File) — part of "software version"
  const origin = new URL(base).origin;
  const info = {};
  try {
    const r = await fetch(`${origin}/.well-known/gs1resolver`, { redirect: 'manual' });
    info.serverHeader = r.headers.get('server');
    info.resolverDescriptionStatus = r.status;
    if (r.status === 200) info.resolverDescription = JSON.parse(await r.text());
    else await r.text();
  } catch (e) { info.error = e.message; }
  return info;
}

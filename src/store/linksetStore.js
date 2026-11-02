// Linkset Store (§4.2.1)
// Holds one linkset record per identifier key ("01/{gtin14}" or "01/{gtin14}/10/{lot}" …).
// The request pipeline only reads (get); the Link Ingest API is the only writer (put/delete).
// Behind this small interface the backing technology can change (JSON file → Redis / MongoDB / RDBMS)
// without touching the pipeline — that choice is ADR-006.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

export class LinksetStore {
  constructor(records = {}) {
    this.map = new Map(Object.entries(records));
  }

  static fromFile(path) {
    return new LinksetStore(JSON.parse(readFileSync(path, 'utf8')));
  }

  get(key) { return this.map.get(key) || null; }
  has(key) { return this.map.has(key); }

  put(key, record) {
    const existed = this.map.has(key);
    this.map.set(key, record);
    return existed ? 'replaced' : 'created';
  }

  delete(key) { return this.map.delete(key); }

  stats() {
    let links = 0;
    for (const rec of this.map.values()) {
      for (const list of Object.values(rec.links)) links += list.length;
    }
    return { identifiers: this.map.size, links };
  }

  toJSON() { return Object.fromEntries(this.map); }

  // Atomic write: temp file then rename, so a crash never leaves half a file.
  saveTo(path) {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.toJSON(), null, 2));
    renameSync(tmp, path);
  }
}

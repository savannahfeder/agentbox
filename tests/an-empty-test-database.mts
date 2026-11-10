// `new PGlite(await emptyDatabase())` opens a test database from a saved copy
// of an empty one instead of building a new cluster, which halves its peak
// memory (tests/every-test-database-starts-from-a-saved-empty-one).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

// The package does not export its package.json, so it is read beside its entry.
const entry = createRequire(import.meta.url).resolve('@electric-sql/pglite');
const { version } = JSON.parse(fs.readFileSync(path.join(path.dirname(entry), '..', 'package.json'), 'utf8'));

export function savedEmptyDatabasePath() {
  return path.join(os.tmpdir(), `agentbox-test-pglite-${version}-empty.tar`);
}

let saved = null;

async function readOrBuild() {
  const file = savedEmptyDatabasePath();
  try {
    return fs.readFileSync(file);
  } catch {
    const db = new PGlite();
    try {
      const tar = Buffer.from(await (await db.dumpDataDir('none')).arrayBuffer());
      // Several workers may build it at once; each renames a whole file into place.
      const part = `${file}.${process.pid}.part`;
      fs.writeFileSync(part, tar);
      fs.renameSync(part, file);
      return tar;
    } finally {
      await db.close();
    }
  }
}

/** The options that open a fresh, empty database from the saved copy. */
export async function emptyDatabase() {
  saved ??= readOrBuild();
  // Postgres's default 128 MB buffer cache is more than any test database
  // fills; 16 MB took 85 MB off each one's peak.
  return { loadDataDir: new Blob([await saved]), postgresqlconf: ['shared_buffers=16MB'] };
}

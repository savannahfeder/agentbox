// A TEAM WITH THOUSANDS OF FILE VERSIONS READS EVERY ONE.
//
// "for some reason all my files are empty": Files was blank, with not even its
// empty line, so the list never arrived. Measured on the team's database: the
// API hands back at most 1,000 rows a read (its max_rows), and the team had
// 5,667 file versions. The version line read the cloud's rows in one request,
// so each read kept 1,000 of them and dropped the rest, and the next Files list
// asked the cloud to number about 4,700 versions again, one at a time, before
// it would draw. Reads of the version line and of where files sit now go page
// by page until the last.
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { supabaseBackend } from '../main/team/supabase-backend.mts';
import { versionLine } from '../main/version-line.mts';

const MAX_ROWS = 1000;
const hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// supabase-js as far as these reads go, over a PostgREST that keeps to max_rows.
function aCloud({ failOnRead = 0 } = {}) {
  const tables = { file_versions: [], file_places: [] };
  let reads = 0;
  let asks = 0;
  const from = (table) => {
    const eqs = [];
    const order = [];
    let range = null;
    const b = {
      select: () => b,
      eq: (col, v) => { eqs.push([col, v]); return b; },
      order: (col, o) => { order.push([col, o?.ascending === false ? -1 : 1]); return b; },
      range: (a, z) => { range = [a, z]; return b; },
      then: (ok, no) => {
        reads += 1;
        if (failOnRead && reads === failOnRead) return Promise.resolve({ data: null, error: { message: 'the connection dropped' } }).then(ok, no);
        let rows = tables[table].filter((r) => eqs.every(([c, v]) => r[c] === v));
        if (order.length) rows = [...rows].sort((x, y) => { for (const [c, d] of order) { if (x[c] < y[c]) return -d; if (x[c] > y[c]) return d; } return 0; });
        const [start, end] = range ?? [0, Infinity];
        const data = rows.slice(start, start + Math.min(end - start + 1, MAX_ROWS)).map((r) => ({ ...r }));
        return Promise.resolve({ data, error: null }).then(ok, no);
      },
    };
    return b;
  };
  const rpc = async (name, p) => {
    if (name !== 'add_file_version') throw new Error(`not here: ${name}`);
    asks += 1;
    const line = tables.file_versions.filter((r) => r.team_id === p.p_team && r.file === p.p_file);
    const had = line.find((r) => r.hash === p.p_hash);
    if (had) return { data: had.n, error: null };
    const n = line.length + 1;
    tables.file_versions.push({ team_id: p.p_team, file: p.p_file, n, hash: p.p_hash, name: p.p_name, by_person: 'me', at: p.p_at });
    return { data: n, error: null };
  };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) }, from, rpc };
  return { backend: supabaseBackend(client as unknown as Parameters<typeof supabaseBackend>[0]), tables, reads: () => reads, asks: () => asks };
}

const versions = (cloud, n, team = 't') => {
  for (let i = 0; i < n; i += 1) cloud.tables.file_versions.push({ team_id: team, file: hex(`file-${i}`).slice(0, 40), n: 1, hash: hex(`bytes-${i}`), name: null, by_person: 'me', at: i });
};

describe('reading the team version line', () => {
  it('gets every version past the 1,000 a read hands back, each once', async () => {
    const cloud = aCloud();
    versions(cloud, 2500);
    const rows = await cloud.backend.fileVersions('t');
    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((r) => `${r.file}/${r.n}`)).size).toBe(2500);
  });

  it('gets exactly 1,000, and 999 in a single read', async () => {
    const full = aCloud();
    versions(full, 1000);
    expect(await full.backend.fileVersions('t')).toHaveLength(1000);
    const short = aCloud();
    versions(short, 999);
    expect(await short.backend.fileVersions('t')).toHaveLength(999);
    expect(short.reads()).toBe(1);
  });

  it('reads only its own team', async () => {
    const cloud = aCloud();
    versions(cloud, 1200);
    versions(cloud, 300, 'other');
    expect(await cloud.backend.fileVersions('t')).toHaveLength(1200);
  });

  it('fails whole when a later page fails, rather than handing back part of the line', async () => {
    const cloud = aCloud({ failOnRead: 2 });
    versions(cloud, 2500);
    await expect(cloud.backend.fileVersions('t')).rejects.toThrow(/reading the versions of files/);
  });
});

describe('reading where files sit', () => {
  it('gets every place past the 1,000 a read hands back', async () => {
    const cloud = aCloud();
    for (let i = 0; i < 1300; i += 1) cloud.tables.file_places.push({ owner: 'me', thread_id: `w-${i}`, project: 'App', family: `f${i}`, folder: 'x', by_person: 'me', at: i });
    expect(await cloud.backend.filePlaces()).toHaveLength(1300);
  });
});

describe('the version line on this computer', () => {
  it('asks the cloud nothing again for 1,200 numbered files once it has read the cloud', async () => {
    const cloud = aCloud();
    const holder = { append: (row) => cloud.backend.addFileVersion('t', row), read: () => cloud.backend.fileVersions('t') };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'many-versions-'));
    const line = versionLine({ dir, cloud: () => holder });
    const files = Array.from({ length: 1200 }, (_, i) => {
      const src = path.join(dir, `shot-${i}.png`);
      fs.writeFileSync(src, `bytes of shot ${i}`);
      return { file: `App/shot-${i}.png`, src, name: `shot-${i}.png` };
    });
    for (const f of files) await line.add(f);
    expect(cloud.asks()).toBe(1200);
    await line.refresh();
    for (const f of files) expect((await line.add(f))?.n).toBe(1);
    expect(cloud.asks()).toBe(1200);
    expect(files.every((f) => line.of(f.file).length === 1)).toBe(true);
  }, 60_000);
});

// A THREAD WITH BIG DESIGNS GOES TO THE CLOUD, AND NOTHING LEFT BEHIND IS OVERWRITTEN.
//
// What broke (2026-10-17): with every thread set to run in the cloud, her Mac
// was overloaded by three agents running on it. All three threads' designs
// folders were over what a cloud run takes (`ownDesignsFit`: 50 MB; the launch
// film's is 21 GB), and that one check kept the WHOLE thread on the Mac. 10 of
// her 163 threads with designs were over, and they were the busy ones.
//
// Now every thread may go: its designs go as a selection, newest first, inside
// the same limits, and the rest stay on the Mac. Codex's review of the plan
// found what that would break: a file is laid over one on the Mac whenever the
// Mac's copy is older than the moment the run left, so a design left behind
// would be overwritten if the run wrote at its path. A run now keeps the exact
// list of what it took, and a file here that it did not take gets the run's
// copy beside it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { docsToSend, tarDocs, layDocs, DOCS_LIMITS } from '../main/cloud/docs.mjs';
import { Supervisor } from '../main/supervisor.mjs';

let tmp; let docs;
const put = (file, body, ageMs = 0) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  if (ageMs) { const t = new Date(Date.now() - ageMs); fs.utimesSync(file, t, t); }
};
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-designs-'));
  docs = path.join(tmp, 'p');
  put(path.join(docs, 'notes.md'), 'notes');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
const archive = (files) => {
  const src = fs.mkdtempSync(path.join(tmp, 'src-'));
  for (const [rel, body] of Object.entries(files)) put(path.join(src, rel), body);
  return tarDocs(src, Object.keys(files));
};

describe('what a thread with big designs takes', () => {
  const small = { ...DOCS_LIMITS, ownFile: 10, own: 25 };

  it('its newest designs, inside the limits, and never one over the per-file limit', async () => {
    put(path.join(docs, 'designs/w-1/a-oldest.png'), '12345678', 3 * 3600_000);
    put(path.join(docs, 'designs/w-1/b-old.png'), '12345678', 2 * 3600_000);
    put(path.join(docs, 'designs/w-1/round2/c-new.png'), '12345678', 1 * 3600_000);
    put(path.join(docs, 'designs/w-1/round2/d-newest.png'), '12345678');
    put(path.join(docs, 'designs/w-1/film.mp4'), '0123456789abc');
    expect(docsToSend(docs, { item: 'w-1', limits: small }).sort()).toEqual(['designs/w-1/b-old.png', 'designs/w-1/round2/c-new.png', 'designs/w-1/round2/d-newest.png', 'notes.md']);
  });

  it('is the whole folder when it fits, as before', async () => {
    put(path.join(docs, 'designs/w-1/a.png'), 'a');
    put(path.join(docs, 'designs/w-1/b/c.png'), 'c');
    expect(docsToSend(docs, { item: 'w-1', limits: small }).sort()).toEqual(['designs/w-1/a.png', 'designs/w-1/b/c.png', 'notes.md']);
  });
});

describe('a thread whose designs do not all fit', () => {
  it('may go to the cloud', async () => {
    const product = { slug: 'p', dir: docs, repoPath: '/r' };
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], cloudRuns: 'all' }, { listItems: () => [], listProducts: () => [product], isDue: () => true }, tmp);
    put(path.join(docs, 'designs/w-1/huge.mp4'), Buffer.alloc(DOCS_LIMITS.ownFile + 1));
    expect(sup._cloudEligible({ id: 'w-1', product: 'p' })).toBe(true);
    expect(sup._mayRunInCloud({ id: 'w-1', product: 'p' }, product, '/r/.claude/worktrees/w-1')).toBe(true);
  });
});

describe('laying the run\'s documents in, knowing what it took', () => {
  it('never writes over a file here the run did not take, however old: its copy goes beside', async () => {
    put(path.join(docs, 'designs/w-1/left.png'), 'on the Mac', 3600_000);
    const out = await layDocs({ tgz: await archive({ 'designs/w-1/left.png': 'from the run' }), dir: docs, sentAt: Date.now(), laid: {}, sent: ['notes.md'] });
    expect(fs.readFileSync(path.join(docs, 'designs/w-1/left.png'), 'utf8')).toBe('on the Mac');
    expect(out.beside).toEqual(['designs/w-1/left (cloud).png']);
    expect(fs.readFileSync(path.join(docs, 'designs/w-1/left (cloud).png'), 'utf8')).toBe('from the run');
  });

  it('a file left here that the run wrote the same bytes over is still not the run\'s to change later (Codex\'s review of the diff, finding 1)', async () => {
    put(path.join(docs, 'designs/w-1/left.png'), 'same', 3600_000);
    const laid = {};
    const sentAt = Date.now();
    await layDocs({ tgz: await archive({ 'designs/w-1/left.png': 'same' }), dir: docs, sentAt, laid, sent: [] });
    const out = await layDocs({ tgz: await archive({ 'designs/w-1/left.png': 'edited by the run' }), dir: docs, sentAt, laid, sent: [] });
    expect(fs.readFileSync(path.join(docs, 'designs/w-1/left.png'), 'utf8')).toBe('same');
    expect(out.beside).toEqual(['designs/w-1/left (cloud).png']);
  });

  it('still writes over a file it took that nobody touched since', async () => {
    put(path.join(docs, 'designs/w-1/took.png'), 'before', 3600_000);
    const out = await layDocs({ tgz: await archive({ 'designs/w-1/took.png': 'after' }), dir: docs, sentAt: Date.now(), laid: {}, sent: ['designs/w-1/took.png'] });
    expect(out.written).toEqual(['designs/w-1/took.png']);
  });

  it('writes a new file, and over its own earlier copy of one', async () => {
    const laid = {};
    const sentAt = Date.now();
    await layDocs({ tgz: await archive({ 'designs/w-1/round2/b.png': 'one' }), dir: docs, sentAt, laid, sent: [] });
    const out = await layDocs({ tgz: await archive({ 'designs/w-1/round2/b.png': 'two' }), dir: docs, sentAt, laid, sent: [] });
    expect(out.written).toEqual(['designs/w-1/round2/b.png']);
    expect(fs.readFileSync(path.join(docs, 'designs/w-1/round2/b.png'), 'utf8')).toBe('two');
  });

  it('a run from before the list was kept is laid in as it always was', async () => {
    put(path.join(docs, 'plan.md'), 'old', 3600_000);
    const out = await layDocs({ tgz: await archive({ 'plan.md': 'new' }), dir: docs, sentAt: Date.now(), laid: {} });
    expect(out.written).toEqual(['plan.md']);
  });
});

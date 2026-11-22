// A SHARED THREAD CARRIES THE FILE ITS AGENT WROTE IN ITS OWN FOLDER.
//
// Two synthetic testers on one team (2026-11-11) opened a teammate's audit and
// design and read "could not be found" where the notes on them were. One cause
// was a name (a-note-on-a-shared-file-opens-that-file-from-either-side); this
// is the other place a file can drop out. The owner's view finds a file the
// thread names inside the thread's own task folder
// (`<repo>/.claude/worktrees/<thread>`), but publishing looked the name up with
// no thread, so a file there in a subfolder never went up. Measured on the
// in-memory cloud: "Wrote audit.md" with the file at
// `<checkout>/docs/audit.md` published no file, and the teammate's copy of the
// thread held only thread.json.
//
// Pinned: a file named bare is carried from the project's documents and from
// the thread's own folder, and opens from the teammate's copy; a file in the
// project that no message of the thread names is never carried.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { resolveArtifact } from '../main/artifact-path.mts';

async function aMac(cloud, personId, repoPath = null) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'carries-own-folder-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'website'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'website', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'website', name: 'Website', seenBy: 'team', ...(repoPath ? { repoPath } : {}) }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service, accountRoot, storeRoot, dir: path.join(accountRoot, 'website') };
}

let cloud, lena, theo, repo;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'carries-own-repo-'));
  lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Fischer' }), repo);
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }));
  await lena.service.signIn();
  await lena.service.createTeam('Northwind');
  await lena.service.invite('theo@nw.test');
  await theo.service.signIn();
  await theo.service.acceptInvite(lena.service.state().team.id);
  disk.setLineAuthor(lena.personId);
});
afterEach(async () => { await lena.service.signOut(); await theo.service.signOut(); });

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const audit = (result) => {
  const item = lena.store.composeItem('website', { title: 'Audit payments auth', body: 'Audit payments auth', visibility: 'team' });
  return { item, finish: () => lena.store.recordSessionResult('website', item.id, { result }) };
};
const published = async (id) => {
  await lena.service.syncNow();
  await theo.service.syncNow();
  const work = theo.service.threadWork(lena.personId, id);
  const files = [...JSON.stringify(work.lines).matchAll(/attachments\/([\w.-]+)/g)].map((m) => m[0]);
  return { work, files };
};
const opensForTheo = (work, src) => resolveArtifact({ src, product: work.product, products: theo.service.sharedThreadProducts(), accountRoot: theo.accountRoot, storeRoot: theo.storeRoot });

describe('a file the result names by its bare name', () => {
  it('goes up from a subfolder of the project\'s documents, and opens for the teammate', async () => {
    const { item, finish } = audit('Wrote payments-auth-audit.md');
    write(path.join(lena.dir, 'docs', 'payments-auth-audit.md'), '# Audit\n');
    finish();
    const { work, files } = await published(item.id);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^attachments\/[0-9a-f]{12}-payments-auth-audit\.md$/);
    expect(await opensForTheo(work, files[0])).toMatchObject({ ok: true, path: path.join(work.dir, files[0]) });
    expect(fs.readFileSync(path.join(work.dir, files[0]), 'utf8')).toBe('# Audit\n');
  });

  it('goes up from a subfolder of the thread\'s own task folder', async () => {
    const { item, finish } = audit('Wrote audit.md');
    write(path.join(repo, '.claude', 'worktrees', item.id, 'docs', 'audit.md'), '# In the checkout\n');
    finish();
    const { work, files } = await published(item.id);
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(path.join(work.dir, files[0]), 'utf8')).toBe('# In the checkout\n');
  });

  it('is taken from this thread\'s folder before a file of the same name elsewhere in the project', async () => {
    const { item, finish } = audit('Wrote audit.md');
    write(path.join(lena.dir, 'old', 'audit.md'), '# Somebody else\'s\n');
    write(path.join(repo, '.claude', 'worktrees', item.id, 'docs', 'audit.md'), '# This thread\'s\n');
    finish();
    const { work, files } = await published(item.id);
    expect(fs.readFileSync(path.join(work.dir, files[0]), 'utf8')).toBe('# This thread\'s\n');
  });
});

describe('what never goes up', () => {
  it('a file in the project or the thread\'s folder that no message of the thread names', async () => {
    const { item, finish } = audit('Wrote audit.md');
    write(path.join(repo, '.claude', 'worktrees', item.id, 'docs', 'audit.md'), '# Audit\n');
    write(path.join(repo, '.claude', 'worktrees', item.id, 'docs', 'payroll.md'), '# Not named\n');
    write(path.join(lena.dir, 'docs', 'roadmap.md'), '# Not named\n');
    finish();
    const { work, files } = await published(item.id);
    expect(files).toHaveLength(1);
    expect(fs.readdirSync(path.join(work.dir, 'attachments'))).toEqual([files[0].replace('attachments/', '')]);
  });

  it('a bare name the thread uses for a file that is nowhere', async () => {
    const { item, finish } = audit('Will write audit.md next');
    finish();
    const { work, files } = await published(item.id);
    expect(files).toEqual([]);
    expect(work.lines.at(-1).patch.result).toBe('Will write audit.md next');
  });
});

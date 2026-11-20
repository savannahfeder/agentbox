// HANDING OVER A THREAD WITH A COMMIT REACHES THE TEAMMATE WITH ITS PATCH (2026-11-20).
//
// Round 3 of the synthetic team: Theo's thread "Fix overlapping appointments"
// had a commit; Hand it over to Sam said "Giving this to Sam…" and then
// "Not given to Sam: ENOENT: no such file or directory, stat
// .../payments-api/runs/w-a785f19d50/w-a785f19d50.patch", and again on a
// Claude Code thread. The patch was written to runs/ in the project's own
// folder, which the store treats as a stray copy of its machinery folder and
// moves across (main/store/home.mts foldStray): on Theo's copy it sat in the
// machinery folder beside a ".superseded-" twin, and the hand-over's stat of
// the old path failed. The raw error, local path and all, was the line on
// screen. And the receiver's brief wrote the branch bare, so the app linked
// "agentbox/w-…" as a thread: "Unavailable thread".
//
// The patch is now written where run records live (machineryPath), a hand-over
// of a thread with a real commit lands on the teammate with its patch, a
// failure reads "Couldn't package the change: …" with no path, and the branch
// is named only inside a git command: alone, even as code, it is linked.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { isGivenTask } from '../shared/team-rules.mts';
import { handedChange, withoutPaths } from '../main/team/handed-change.mts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkTicketReferences, TICKET_HREF } from '../renderer/src/ticket-references.ts';

// What the window would link as a thread in these words, drawn as Focus draws a message.
const threadLinksIn = (md: string) => [...renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkTicketReferences] }, md))
  .matchAll(new RegExp(`href="${TICKET_HREF}([^"]+)"`, 'g'))].map((m) => m[1]);

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=Theo', '-c', 'user.email=theo@nw.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string, repo: string | null) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-commit-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team', ...(repo ? { repoPath: repo } : {}) }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service, accountRoot };
}

type Mac = Awaited<ReturnType<typeof aMac>>;
let cloud: ReturnType<typeof createMemoryCloud>; let theo: Mac; let sam: Mac; let repo: string;
beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'payments-api-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'store.js'), 'export const overlaps = () => false;\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'Start');
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }), repo);
  sam = await aMac(cloud, signUpMemory(cloud, { email: 'sam@nw.test', name: 'Sam Ortiz' }), null);
  await theo.service.signIn();
  await theo.service.createTeam('Northwind');
  await theo.service.invite('sam@nw.test');
  await sam.service.signIn();
  await sam.service.acceptInvite(theo.service.state().team!.id);
  disk.setLineAuthor(theo.personId);
});
afterEach(async () => { disk.setLineAuthor(null); await theo.service.signOut(); await sam.service.signOut(); });

describe('handing over a thread whose agent committed', () => {
  it('reaches Sam with the patch and its brief line, the reported one', async () => {
    const t = theo.store.composeItem('api', { title: 'Fix overlapping appointments', body: 'Reject overlapping bookings.' });
    git(repo, 'switch', '-qc', `agentbox/${t.id}`);
    fs.writeFileSync(path.join(repo, 'store.js'), 'export const overlaps = (a, b) => a.start < b.end && b.start < a.end;\n');
    git(repo, 'commit', '-qam', 'Reject overlapping appointments');
    git(repo, 'switch', '-q', 'main');
    theo.store.recordSessionResult('api', t.id, { result: 'Overlaps are rejected now, in one commit.' });

    await theo.service.handOn({ product: 'api', id: t.id, to: sam.personId, note: 'Yours now.' });
    for (let k = 0; k < 2; k += 1) { await theo.service.syncNow(); await sam.service.syncNow(); }

    const task = sam.store.listItems().find((i) => isGivenTask(i, sam.store.listProducts().find((p) => p.slug === i.product)));
    expect(task?.body).toMatch(new RegExp(`\\[${t.id}\\.patch\\]\\(attachments/[^)]+\\)`));
    expect(task?.body).toContain('1 commit from Theo’s branch.');
    expect(task?.body).toContain(`\`git switch -c agentbox/${t.id}\``);
    expect(threadLinksIn(task!.body!)).toEqual([]);
    const product = sam.store.listProducts().find((p) => p.slug === task!.product)!;
    const att = /\]\((attachments\/[^)]+\.patch)\)/.exec(task!.body!)![1];
    expect(fs.readFileSync(path.join(product.dir, att), 'utf8')).toContain('Reject overlapping appointments');
    expect(theo.store.readItem('api', t.id)?.answer).toBe('Given to Sam Ortiz: Yours now.');
    // Never in the project's own folder, where the store moves runs/ away.
    expect(fs.existsSync(path.join(theo.accountRoot, 'api', 'runs', t.id, `${t.id}.patch`))).toBe(false);
  });
});

describe('a change that cannot be packaged', () => {
  it('says so in plain words in the brief and still hands the thread over', () => {
    const blocked = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'blocked-')), 'file');
    fs.writeFileSync(blocked, 'not a folder');
    git(repo, 'switch', '-qc', 'agentbox/w-x');
    fs.writeFileSync(path.join(repo, 'b.js'), 'b\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'B');
    git(repo, 'switch', '-q', 'main');
    const got = handedChange({ repoPath: repo, id: 'w-x', owner: 'Theo', outDir: path.join(blocked, 'runs') });
    expect(got.file).toBeNull();
    expect(got.words).toMatch(/^Couldn’t package the change: /);
    expect(got.words).not.toContain(blocked);
  });

  it('names the branch only inside a command, where it is never linked as a thread', () => {
    expect(threadLinksIn('From Theo’s branch `agentbox/w-a785f19d50`.')).toEqual(['w-a785f19d50']);
    const got = handedChange({ repoPath: repo, id: 'w-a785f19d50', owner: 'Theo', outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'out-')) });
    expect(got.words).toBe('');
    git(repo, 'switch', '-qc', 'agentbox/w-a785f19d50');
    fs.writeFileSync(path.join(repo, 'c.js'), 'c\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'C');
    git(repo, 'switch', '-q', 'main');
    for (const maxBytes of [undefined, 10]) {
      const words = handedChange({ repoPath: repo, id: 'w-a785f19d50', owner: 'Theo', outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'out-')), ...(maxBytes ? { maxBytes } : {}) }).words;
      expect(words).toContain('agentbox/w-a785f19d50');
      expect(threadLinksIn(words)).toEqual([]);
    }
  });

  it('leaves no local path in an error said on screen', () => {
    expect(withoutPaths("ENOENT: no such file or directory, stat '/tmp/agentbox-verify/instances/x/store/payments-api/runs/w-a785f19d50/w-a785f19d50.patch'"))
      .toBe("ENOENT: no such file or directory, stat 'w-a785f19d50.patch'");
    expect(withoutPaths('the cloud did not answer')).toBe('the cloud did not answer');
  });
});

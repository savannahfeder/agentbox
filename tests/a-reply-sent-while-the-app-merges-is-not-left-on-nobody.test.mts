// A REPLY SENT WHILE THE APP MERGES IS NOT LEFT ON NOBODY.
//
// In the 2026-11-16 cloud power test, a tester picked Ship it and wrote a
// second reply ("merge it and close this thread") seconds later. The cloud run
// handed back "merging into main", and while the app's own merge ran, the
// queue marked that reply delivered and asked for a run, which spawnWorker
// refused because the merge holds the thread. Nothing put the mark back, so
// the merged thread read "The agent stopped without finishing this" in Needs
// you (frontend w-a0c52136f4), and one whose merge hit a conflict sat stopped
// on This Mac until the tester pressed Try again (backend w-0fe1302716).
// Measured from the testers' row histories: a reply after the run's start, a
// cloud hand-back, then no claim at all until a person acted.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Supervisor } from '../main/supervisor.mts';
import { HAND_BACK } from '../shared/cloud-hand-back.mts';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function project({ conflict = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-reply-'));
  dirs.push(root);
  const base = path.join(root, 'repo');
  fs.mkdirSync(base);
  git(base, 'init', '-q', '-b', 'main');
  git(base, 'config', 'user.email', 'tester@example.com');
  git(base, 'config', 'user.name', 'Tester');
  fs.writeFileSync(path.join(base, 'a.txt'), 'one\n');
  git(base, 'add', '.');
  git(base, 'commit', '-qm', 'first');
  const folder = path.join(root, 'task');
  git(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-a', folder);
  fs.writeFileSync(path.join(folder, conflict ? 'a.txt' : 'b.txt'), 'branch\n');
  git(folder, 'add', '.');
  git(folder, 'commit', '-qm', 'branch work');
  if (conflict) {
    fs.writeFileSync(path.join(base, 'a.txt'), 'main\n');
    git(base, 'commit', '-qam', 'main moved');
  }
  return { root, base, folder };
}

const startedAt = Date.now() - 60_000;

function make(answeredAt: number, opts: { conflict?: boolean } = {}) {
  const p = project(opts);
  const product = { slug: 'p', dir: p.root, repoPath: p.base };
  const row = { id: 'w-a', product: 'p', status: 'open', answer: 'merge it and close this thread', wrote: { answer: { ts: answeredAt, source: 'founder' } } };
  const store = {
    listItems: () => [row], listProducts: () => [product], isDue: () => true,
    readItem: () => row,
    recordSessionResult: () => {},
    settleAnswer: () => {},
    noteItem: () => {},
  };
  const sup = new Supervisor({ storeRoot: p.root, home: p.root, maxConcurrentSessions: 3 }, store, p.root);
  return { sup, row, folder: p.folder };
}

const handBack = { itemId: 'w-a', product: 'p', cloud: true, startedAt, sessionId: 's1', result: `${HAND_BACK} merging into main`, resultIsError: false };

// What the queue does with an owed reply: mark it delivered, then start it.
function queueStarts(sup: Supervisor, row: { id: string; product: string }) {
  sup._handledAnswers.add(sup._answerKey(row));
  sup.spawnWorker(row, { continuation: true });
}

describe('a reply the queue sends while the app merges', () => {
  it('stays owed once the merge lands, so a run carries it', async () => {
    const { sup, row, folder } = make(startedAt + 12_000);
    sup._noteCloudHandBack(row, handBack, folder);
    expect(sup._mergingHome.has(row.id)).toBe(true);
    queueStarts(sup, row);
    expect(sup._answerDelivered(row)).toBe(false);
    await sup._mergingHome.get(row.id);
    expect(sup._answerDelivered(row)).toBe(false);
    expect(sup._statusOf().stalled).not.toContain(row.id);
  });

  it('stays owed when the merge stops on a conflict, so the run here starts on its own', async () => {
    const { sup, row, folder } = make(startedAt + 12_000, { conflict: true });
    sup._noteCloudHandBack(row, handBack, folder);
    queueStarts(sup, row);
    await sup._mergingHome.get(row.id);
    expect(sup._movedHere(row.id)).toBe(true);
    expect(sup._answerDelivered(row)).toBe(false);
    expect(sup._statusOf().stalled).not.toContain(row.id);
  });

  it('a reply the merge itself answered is still settled by it', async () => {
    const { sup, row, folder } = make(startedAt - 1000);
    sup._noteCloudHandBack(row, handBack, folder);
    queueStarts(sup, row);
    await sup._mergingHome.get(row.id);
    expect(sup._answerDelivered(row)).toBe(true);
  });
});

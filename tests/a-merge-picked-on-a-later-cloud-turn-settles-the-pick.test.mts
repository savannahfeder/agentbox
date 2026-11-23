// A MERGE PICKED ON A LATER CLOUD TURN SETTLES THE PICK.
//
// In the overnight cloud power test of 2026-11-16, every Ship it picked on a
// cloud thread that had already answered once came back as "Merged into main"
// under "The agent stopped without finishing this. Your answer is still
// waiting", and the thread sat in Needs you as STOPPED (12 times, two
// testers). A cloud agent stays open between turns, and the app's own merge
// asked whether the pick came before the agent's first start, not before the
// turn the pick began. So the pick stayed unsettled on a thread nobody was on.
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

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-turn-'));
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
  fs.writeFileSync(path.join(folder, 'b.txt'), 'two\n');
  git(folder, 'add', '.');
  git(folder, 'commit', '-qm', 'add b');
  return { root, base, folder };
}

const item = { id: 'w-a', product: 'p' };
const startedAt = Date.now() - 60 * 60_000;

function make(pickedAt: number) {
  const p = project();
  const product = { slug: 'p', dir: p.root, repoPath: p.base };
  const row = { id: 'w-a', product: 'p', answer: 'Merge it into main', wrote: { answer: { ts: pickedAt, source: 'founder' } } };
  const settled: number[] = [];
  const store = {
    listItems: () => [], listProducts: () => [product], isDue: () => true,
    readItem: () => row,
    recordSessionResult: () => {},
    settleAnswer: (_slug: string, _id: string, ts: number) => settled.push(ts),
  };
  const sup = new Supervisor({ storeRoot: p.root, home: p.root, maxConcurrentSessions: 3 }, store, p.root);
  return { sup, row, settled, folder: p.folder };
}

const handBack = (turnStartedAt?: number) => ({
  itemId: 'w-a', product: 'p', cloud: true, startedAt, ...(turnStartedAt ? { turnStartedAt } : {}),
  sessionId: 's1', result: `${HAND_BACK} merging into main`, resultIsError: false,
});

describe('the app merges a cloud thread that answered before', () => {
  it('a pick that began the turn is settled by the merge', async () => {
    const pickedAt = startedAt + 30 * 60_000;
    const { sup, row, settled, folder } = make(pickedAt);
    sup._noteCloudHandBack(item, handBack(pickedAt + 500), folder);
    await sup._mergingHome.get(item.id);
    expect(settled).toEqual([pickedAt]);
    expect(sup._handledAnswers.has(sup._answerKey(row))).toBe(true);
  });

  it('a reply written after the turn began is still carried by a run', async () => {
    const turnAt = startedAt + 30 * 60_000;
    const { sup, row, settled, folder } = make(turnAt + 1000);
    sup._noteCloudHandBack(item, handBack(turnAt), folder);
    await sup._mergingHome.get(item.id);
    expect(settled).toEqual([]);
    expect(sup._handledAnswers.has(sup._answerKey(row))).toBe(false);
  });

  it('a first turn still measures from the run\'s start', async () => {
    const { sup, settled, folder } = make(startedAt - 1000);
    sup._noteCloudHandBack(item, handBack(), folder);
    await sup._mergingHome.get(item.id);
    expect(settled).toEqual([startedAt - 1000]);
  });
});

// A thread handed over with its commits still told its agent to "start from the edits in" the .change,
// so it could apply them a second time over the commits already on its branch. Checked on the brief a first run gets.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { changeWithCommits, startFromHandedCommits, HANDED_COMMITS_NOTE } from '../main/handed-commits.mts';
import { taskBranch } from '../main/task-folders.mts';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), name));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const env = { ...process.env, GIT_AUTHOR_NAME: 'Theo Okafor', GIT_AUTHOR_EMAIL: 'theo@nw.test', GIT_COMMITTER_NAME: 'Theo Okafor', GIT_COMMITTER_EMAIL: 'theo@nw.test' };
const commit = (cwd, message) => execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message], { cwd, env, stdio: 'ignore' });

function aRepository(start) {
  const dir = tmp('note-origin-');
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'server.js'), start);
  git(dir, 'add', '.');
  commit(dir, 'Start');
  return dir;
}

// The giver's .change, carrying one commit, as it lands in the receiver's project.
async function carried(receiverRepo, origin) {
  const giver = path.join(tmp('note-giver-'), 'repo');
  git(os.tmpdir(), 'clone', '-q', origin, giver);
  git(giver, 'checkout', '-q', '-b', taskBranch('w-theo'));
  fs.writeFileSync(path.join(giver, 'health.js'), 'export const ok = true;\n');
  git(giver, 'add', '.');
  commit(giver, 'Add /health');
  const change = path.join(tmp('note-change-'), 'c.change');
  fs.writeFileSync(change, JSON.stringify({ item: 'w-theo', files: [] }));
  const bytes = await changeWithCommits(change, giver, 'w-theo', 10 * 1024 * 1024);
  const dir = tmp('note-project-');
  fs.mkdirSync(path.join(dir, 'attachments'));
  fs.writeFileSync(path.join(dir, 'attachments', 'x-health-change.change'), bytes);
  return { dir, repoPath: receiverRepo, body: 'Lena asked:\n\nAdd /health.\n\n[health change.change](attachments/x-health-change.change)' };
}

function briefFor(item, product) {
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true, readThread: () => [] };
  return new Supervisor({ storeRoot: product.dir }, store, product.dir).buildBrief(item, { slug: 'api', name: 'Payments API', ...product });
}

describe("a first run's brief on a thread handed over with its commits", () => {
  it('says the commits are on its branch and the .change is not to be applied again', async () => {
    const origin = aRepository('export const app = {};\n');
    const receiver = path.join(tmp('note-receiver-'), 'repo');
    git(os.tmpdir(), 'clone', '-q', origin, receiver);
    const p = await carried(receiver, origin);
    const item = { id: 'w-lena', product: 'api', title: 'Add health endpoint', body: p.body, labels: ['handed-from:direct:w-task'] };
    expect(await startFromHandedCommits({ ...p, id: item.id, labels: item.labels })).toBe(true);
    expect(briefFor(item, p)).toContain(HANDED_COMMITS_NOTE);
  });

  it('says nothing of it when the commits could not be used and the thread starts from main', async () => {
    const origin = aRepository('export const app = {};\n');
    const p = await carried(aRepository('export const other = 1;\n'), origin);
    const item = { id: 'w-lena', product: 'api', title: 'Add health endpoint', body: p.body, labels: ['handed-from:direct:w-task'] };
    expect(await startFromHandedCommits({ ...p, id: item.id, labels: item.labels })).toBe(false);
    expect(briefFor(item, p)).not.toContain(HANDED_COMMITS_NOTE);
  });

  it('says nothing of it on another thread of the same project', async () => {
    const origin = aRepository('export const app = {};\n');
    const receiver = path.join(tmp('note-receiver-'), 'repo');
    git(os.tmpdir(), 'clone', '-q', origin, receiver);
    const p = await carried(receiver, origin);
    const labels = ['handed-from:direct:w-task'];
    expect(await startFromHandedCommits({ ...p, id: 'w-lena', labels })).toBe(true);
    expect(briefFor({ id: 'w-other', product: 'api', title: 'Other', body: 'Something else.', labels }, p)).not.toContain(HANDED_COMMITS_NOTE);
    expect(briefFor({ id: 'w-lena', product: 'api', title: 'Add health endpoint', body: p.body, labels: [] }, p)).not.toContain(HANDED_COMMITS_NOTE);
  });
});

// A hand-over carried only the .change, so the receiver's agent could not find the giver's commits
// and re-made them from its own main. Measured with real repositories over the memory cloud.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { machineryPath } from '../main/store/home.mts';
import { changePath, readChange } from '../main/code-change.mts';
import { ensureTaskFolder, taskBranch } from '../main/task-folders.mts';
import { saveAttachments, attachmentMarkdown } from '../main/save-attachments.mts';
import { changeWithCommits, startFromHandedCommits } from '../main/handed-commits.mts';
import { isGivenTask } from '../shared/team-rules.mts';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), name));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commitAs = (cwd, name, message) => {
  const email = `${name.split(' ')[0].toLowerCase()}@nw.test`;
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message], {
    cwd, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email },
  });
};

function aRepository(start = 'export const app = {};\n') {
  const dir = tmp('handed-origin-');
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'server.js'), start);
  git(dir, 'add', '.');
  commitAs(dir, 'Base Person', 'Start');
  return dir;
}
const cloneOf = (origin) => { const dir = path.join(tmp('handed-clone-'), 'repo'); git(os.tmpdir(), 'clone', '-q', origin, dir); return dir; };

async function aMac(cloud, personId, repoPath) {
  const storeRoot = tmp('handed-commits-');
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'api'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'api', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'api', name: 'Payments API', seenBy: 'team', repoPath }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service, dir: path.join(accountRoot, 'api'), repo: repoPath };
}

let cloud, theo, lena, origin;
async function twoMacs(lenaRepo = null) {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  origin = aRepository();
  theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }), cloneOf(origin));
  lena = await aMac(cloud, signUpMemory(cloud, { email: 'lena@nw.test', name: 'Lena Fischer' }), lenaRepo ?? cloneOf(origin));
  await theo.service.signIn();
  await theo.service.createTeam('Northwind');
  await theo.service.invite('lena@nw.test');
  await lena.service.signIn();
  await lena.service.acceptInvite(theo.service.state().team.id);
  disk.setLineAuthor(theo.personId);
}
beforeEach(() => twoMacs());
afterEach(async () => { disk.setLineAuthor(null); await theo.service.signOut(); await lena.service.signOut(); });

// Theo's thread, with what its agent changed, and `commits` commits on its branch.
function theosThread(commits = 1) {
  const t = theo.store.composeItem('api', { title: 'Add health endpoint with test', body: 'Add GET /health.' });
  const branch = taskBranch(t.id);
  git(theo.repo, 'branch', branch, 'main');
  const shas = [];
  for (let k = 0; k < commits; k += 1) {
    git(theo.repo, 'checkout', '-q', branch);
    fs.writeFileSync(path.join(theo.repo, `health${k}.js`), `export const ok${k} = true;\n`);
    git(theo.repo, 'add', '.');
    commitAs(theo.repo, 'Theo Okafor', `Add /health part ${k}`);
    shas.push(git(theo.repo, 'rev-parse', 'HEAD'));
    git(theo.repo, 'checkout', '-q', 'main');
  }
  const change = { item: t.id, files: [{ path: 'health0.js', hunks: [{ rows: [['+', 'export const ok0 = true;']], plus: 1, minus: 0 }], plus: 1, minus: 0 }], roots: [theo.repo], plus: 1, minus: 0, editCount: 1, withProse: 0, committed: commits > 0, uncommitted: false, knowsYou: true, fromDisk: 1 };
  const file = machineryPath(theo.dir, changePath(t.id));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(change, null, 1));
  theo.store.recordSessionResult('api', t.id, { result: 'Added /health with a test.' });
  return { id: t.id, shas, change };
}

// What Lena's "Carry on with an agent" does with the task: its files go on the new thread, which is made and then started.
async function lenaCarriesOn() {
  for (let k = 0; k < 3; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
  const task = lena.store.listItems().find((i) => isGivenTask(i, lena.store.listProducts().find((p) => p.slug === i.product)));
  const brief = lena.service.taskBrief(task.product, task.id);
  const saved = saveAttachments(lena.dir, brief.files);
  const body = [brief.body, attachmentMarkdown(saved)].join('\n\n');
  const made = lena.store.composeItem('api', { title: brief.title, body, labels: [`handed-from:${task.product}:${task.id}`] });
  const product = lena.store.listProducts().find((p) => p.slug === 'api');
  const started = startFromHandedCommits({ repoPath: product.repoPath, dir: product.dir, id: made.id, body, labels: made.labels });
  const folder = ensureTaskFolder(lena.repo, made.id, { dependencies: false });
  return { brief, started, folder: folder.path, change: brief.files.find((f) => f.name.endsWith('.change')) };
}
const history = (dir) => git(dir, 'log', '--format=%H %an <%ae>', 'main..HEAD').split('\n').filter(Boolean);

describe("a handed-over thread's commits on the receiver's computer", () => {
  it('are in the history the receiver\'s agent starts from, same commits, same author', async () => {
    const { id, shas } = theosThread(2);
    await theo.service.handOn({ product: 'api', id, to: lena.personId });
    const { started, folder } = await lenaCarriesOn();
    expect(started).toBe(true);
    expect(history(folder)).toEqual([...shas].reverse().map((s) => `${s} Theo Okafor <theo@nw.test>`));
  });

  it('leave the .change the reader opens as it was', async () => {
    const { id, change } = theosThread(1);
    await theo.service.handOn({ product: 'api', id, to: lena.personId });
    const { change: carried } = await lenaCarriesOn();
    expect(readChange(carried.srcPath)).toEqual(change);
  });

  it('are not carried when the branch has none: the folder starts from main, the .change goes as before', async () => {
    const { id, change } = theosThread(0);
    await theo.service.handOn({ product: 'api', id, to: lena.personId });
    const { started, folder, change: carried } = await lenaCarriesOn();
    expect(started).toBe(false);
    expect(history(folder)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(carried.srcPath, 'utf8'))).toEqual(change);
  });

  it('are not carried from a thread with no branch at all', async () => {
    const t = theo.store.composeItem('api', { title: 'Plain question', body: 'What does /health return?' });
    await theo.service.handOn({ product: 'api', id: t.id, to: lena.personId });
    const { started, folder } = await lenaCarriesOn();
    expect(started).toBe(false);
    expect(history(folder)).toEqual([]);
  });
});

describe('when the commits cannot be used, the receiver starts as before', () => {
  it('in a repository that is not the same project', async () => {
    await afterEachOnce();
    await twoMacs(aRepository('export const other = 1;\n'));
    const { id } = theosThread(1);
    await theo.service.handOn({ product: 'api', id, to: lena.personId });
    const { started, folder, change } = await lenaCarriesOn();
    expect(started).toBe(false);
    expect(history(folder)).toEqual([]);
    expect(change).toBeTruthy();
  });

  it('when what was carried is damaged', async () => {
    const { id } = theosThread(1);
    await theo.service.handOn({ product: 'api', id, to: lena.personId });
    for (let k = 0; k < 3; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
    const task = lena.store.listItems().find((i) => isGivenTask(i, lena.store.listProducts().find((p) => p.slug === i.product)));
    const brief = lena.service.taskBrief(task.product, task.id);
    const file = brief.files.find((f) => f.name.endsWith('.change')).srcPath;
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const bytes = Buffer.from(saved.commits.bundle, 'base64');
    bytes[bytes.length - 30] ^= 0xff;
    fs.mkdirSync(path.join(lena.dir, 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(lena.dir, 'attachments', 'damaged.change'), JSON.stringify({ ...saved, commits: { ...saved.commits, bundle: bytes.toString('base64') } }));
    const body = '[x.change](attachments/damaged.change)';
    const made = lena.store.composeItem('api', { title: 'x', body, labels: [`handed-from:${task.product}:${task.id}`] });
    expect(startFromHandedCommits({ repoPath: lena.repo, dir: lena.dir, id: made.id, body, labels: made.labels })).toBe(false);
    expect(git(lena.repo, 'branch', '--list', taskBranch(made.id))).toBe('');
  });

  it('when they would make the .change too big to carry', () => {
    const { id } = theosThread(1);
    const file = machineryPath(theo.dir, changePath(id));
    const fits = changeWithCommits(file, theo.repo, id, 10 * 1024 * 1024);
    expect(JSON.parse(fits.toString()).commits.tip).toBe(git(theo.repo, 'rev-parse', taskBranch(id)));
    expect(changeWithCommits(file, theo.repo, id, fits.length)).not.toBeNull();
    expect(changeWithCommits(file, theo.repo, id, fits.length - 1)).toBeNull();
  });

  it('on a thread that was not handed over, or one whose branch is there already', async () => {
    const { id } = theosThread(1);
    await theo.service.handOn({ product: 'api', id, to: lena.personId });
    for (let k = 0; k < 3; k += 1) { await theo.service.syncNow(); await lena.service.syncNow(); }
    const task = lena.store.listItems().find((i) => isGivenTask(i, lena.store.listProducts().find((p) => p.slug === i.product)));
    const brief = lena.service.taskBrief(task.product, task.id);
    const body = attachmentMarkdown(saveAttachments(lena.dir, brief.files));
    const own = lena.store.composeItem('api', { title: 'Mine', body });
    expect(startFromHandedCommits({ repoPath: lena.repo, dir: lena.dir, id: own.id, body, labels: own.labels })).toBe(false);
    const again = lena.store.composeItem('api', { title: 'Again', body, labels: [`handed-from:${task.product}:${task.id}`] });
    git(lena.repo, 'branch', taskBranch(again.id), 'main');
    const before = git(lena.repo, 'rev-parse', taskBranch(again.id));
    expect(startFromHandedCommits({ repoPath: lena.repo, dir: lena.dir, id: again.id, body, labels: again.labels })).toBe(false);
    expect(git(lena.repo, 'rev-parse', taskBranch(again.id))).toBe(before);
  });
});

describe('the wiring', () => {
  it('a new thread is put on the carried branch before anything can start it', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    const compose = ipc.slice(ipc.indexOf("ipcMain.handle('zero:compose',"), ipc.indexOf("ipcMain.handle('zero:route-thread'"));
    expect(compose.indexOf('startFromHandedCommits(')).toBeGreaterThan(compose.indexOf('store.composeItem('));
    expect(compose.indexOf('startFromHandedCommits(')).toBeLessThan(compose.indexOf('supervisor.wake()'));
  });
});

async function afterEachOnce() { disk.setLineAuthor(null); await theo.service.signOut(); await lena.service.signOut(); }

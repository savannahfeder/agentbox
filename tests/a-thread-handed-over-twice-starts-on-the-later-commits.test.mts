// Sam hands a thread to Theo, whose agent adds commits, and Theo hands it to Lena. Her thread names both changes,
// Sam's first, and took the first with commits, so it would start without Theo's. Found reading a tester's copies.
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { changeWithCommits, startFromHandedCommits } from '../main/handed-commits.mts';

const made: string[] = [];
const tmp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'handed-twice-'))); made.push(d); return d; };
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const ENV = { ...process.env, GIT_AUTHOR_NAME: 'Dev', GIT_AUTHOR_EMAIL: 'dev@nw.test', GIT_COMMITTER_NAME: 'Dev', GIT_COMMITTER_EMAIL: 'dev@nw.test' };
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function commit(repo: string, branch: string, file: string) {
  git(repo, 'checkout', '-q', branch);
  fs.writeFileSync(path.join(repo, file), `${file}\n`);
  git(repo, 'add', '.');
  git(repo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', `Add ${file}`);
  return git(repo, 'rev-parse', 'HEAD');
}
async function aChange(repo: string, thread: string, dir: string, name: string) {
  const plain = path.join(tmp(), 'plain.change');
  fs.writeFileSync(plain, JSON.stringify({ item: thread, files: [] }));
  const bytes = await changeWithCommits(plain, repo, thread, 10 * 1024 * 1024);
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'attachments', name), bytes!);
  return `[${name}](attachments/${name})`;
}

async function twoHandOvers() {
  const origin = tmp();
  git(origin, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(origin, 'server.js'), 'x\n');
  git(origin, 'add', '.');
  git(origin, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'Start');
  const lena = path.join(tmp(), 'lena');
  git(os.tmpdir(), 'clone', '-q', origin, lena);
  const dir = tmp();
  git(origin, 'branch', 'agentbox/w-sam0000001', 'main');
  const sams = commit(origin, 'agentbox/w-sam0000001', 'health.js');
  const first = await aChange(origin, 'w-sam0000001', dir, 'first.change');
  git(origin, 'branch', 'agentbox/w-theo000001', sams);
  const theos = commit(origin, 'agentbox/w-theo000001', 'version.js');
  const second = await aChange(origin, 'w-theo000001', dir, 'second.change');
  const start = (body: string) => startFromHandedCommits({ repoPath: lena, dir, id: 'w-lena000001', body, labels: ['handed-from:direct:w-task'] });
  const branches = () => git(lena, 'for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads/agentbox');
  return { first, second, sams, theos, start, branches };
}

it.each([['Sam\'s named first', 'sams'], ['Theo\'s named first', 'theos']])('starts on Theo\'s commits, with Sam\'s under them (%s)', async (_, order) => {
  const { first, second, theos, start, branches } = await twoHandOvers();
  expect(await start(order === 'sams' ? `${first} then ${second}` : `${second} then ${first}`)).toBe(true);
  expect(branches()).toBe(`agentbox/w-lena000001 ${theos}`);
});

it('with only Sam\'s change named, starts on Sam\'s commit', async () => {
  const { first, sams, start, branches } = await twoHandOvers();
  expect(await start(first)).toBe(true);
  expect(branches()).toBe(`agentbox/w-lena000001 ${sams}`);
});

// Security review, 2026-11-16. Opening a file from a finished thread's branch
// copies it out of git into a temp folder, named by the path git lists for it.
// A branch can carry a tree entry named "..": git mktree and a plain fetch both
// keep it, and git then lists the file as "a/../../x". Measured with a crafted
// branch: the copy was written outside the temp folder, where the branch chose,
// as soon as the app looked for the file its answer named. A cloud run's tip
// with such a path fails to come home, but one in an older commit does when the
// project sits deep below its git root; a link planted in tmp did the same.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact } from '../main/artifact-path.mts';
import { taskBranch } from '../main/task-folders.mts';

const git = (cwd: string, args: string[], input?: string) => execFileSync('git', args, { cwd, encoding: 'utf8', input }).trim();
const tree = (cwd: string, entries: string[]) => git(cwd, ['mktree'], entries.map((e) => `${e}\n`).join(''));

let root = '', repo = '', dir = '';
const thread = 'w-5e1f0a11ce';
const linked = 'w-5e1f0a11cf';
let linkedTip = '';
// From the copy's folder (tmp/agentbox-branch-files/<repo>/<thread>/<commit>) five ".." reach tmp.
const UP = 5;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-escape-'));
  repo = path.join(root, 'infra');
  dir = path.join(root, 'docs');
  fs.mkdirSync(repo); fs.mkdirSync(dir);
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 'a@b.c']); git(repo, ['config', 'user.name', 'A']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'seed\n');
  git(repo, ['add', '.']); git(repo, ['commit', '-qm', 'seed']);
  const blob = git(repo, ['hash-object', '-w', '--stdin'], 'planted\n');
  const readme = git(repo, ['rev-parse', 'HEAD:README.md']);
  // a/../../../../../<root>/escaped.txt (git reads a path that starts with ".."
  // against its own folder and refuses it, so the climb starts one folder down),
  // and a plain file beside it that must still open.
  let up = tree(repo, [`100644 blob ${blob}\tescaped.txt`]);
  up = tree(repo, [`040000 tree ${up}\t${path.basename(root)}`]);
  for (let i = 0; i < UP; i++) up = tree(repo, [`040000 tree ${up}\t..`]);
  const fine = tree(repo, [`100644 blob ${blob}\tnotes.md`]);
  const top = tree(repo, [`100644 blob ${readme}\tREADME.md`, `040000 tree ${up}\ta`, `040000 tree ${fine}\tdocs`]);
  const c = git(repo, ['commit-tree', top, '-p', 'HEAD', '-m', 'planted']);
  git(repo, ['update-ref', `refs/heads/${taskBranch(thread)}`, c]);
  // A second thread commits an ordinary file; its copy's folder is planted as a link out.
  linkedTip = git(repo, ['commit-tree', tree(repo, [`040000 tree ${fine}\tdocs`]), '-p', 'HEAD', '-m', 'ordinary']);
  git(repo, ['update-ref', `refs/heads/${taskBranch(linked)}`, linkedTip]);
});
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

const open = (src: string, from = thread) => resolveArtifact({
  src, product: 'infra', products: [{ slug: 'infra', dir, name: 'Infra', repoPath: repo }] as never,
  accountRoot: root, storeRoot: root, thread: from, fresh: true,
});

describe('a branch that came home from the cloud', () => {
  it('git lists the planted file with ".." in its path, as a fetched branch would carry it', () => {
    const names = git(repo, ['log', '--format=', '--name-only', `HEAD..${taskBranch(thread)}`]).split('\n');
    expect(names).toContain(`a/${Array(UP).fill('..').join('/')}/${path.basename(root)}/escaped.txt`);
  });

  it('cannot write a file outside the folder the branch copies go in', async () => {
    const out = await open('escaped.txt');
    expect(fs.existsSync(path.join(root, 'escaped.txt'))).toBe(false);
    if (out.ok) expect(path.relative(path.join(os.tmpdir(), 'agentbox-branch-files'), out.path!).startsWith('..')).toBe(false);
  });

  it('by its full path into the given-back folder, cannot either', async () => {
    await open(path.join(repo, '.claude', 'worktrees', thread, 'escaped.txt'));
    expect(fs.existsSync(path.join(root, 'escaped.txt'))).toBe(false);
  });

  it('cannot write through a link planted where its copy goes', async () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    const folder = path.join(os.tmpdir(), 'agentbox-branch-files', createHash('sha1').update(repo).digest('hex').slice(0, 12), linked);
    fs.mkdirSync(folder, { recursive: true });
    fs.symlinkSync(outside, path.join(folder, linkedTip.slice(0, 12)));
    try {
      await open('docs/notes.md', linked);
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('still opens an ordinary file the branch committed', async () => {
    const out = await open('docs/notes.md');
    expect(out.ok).toBe(true);
    expect(fs.readFileSync(out.path!, 'utf8')).toBe('planted\n');
  });
});

// A throwaway repository where main moved under a task branch and now
// conflicts with it: `w-narrow` changed sidebar.css on main, a commit made by
// hand changed list.mjs, and `w-unrelated` changed a file nobody else touched.
// The task folder `w-mine` changed both sidebar.css and list.mjs; `w-clean`
// changed only a file of its own.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).trim();
const write = (dir, file, text) => fs.writeFileSync(path.join(dir, file), text);

export function conflictingBranches() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-conflict-'));
  git(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  const base = path.join(tmp, 'base');
  git(tmp, 'init', '-q', '-b', 'main', 'base');
  git(base, 'config', 'user.email', 'test@example.com');
  git(base, 'config', 'user.name', 'Test');
  git(base, 'remote', 'add', 'origin', path.join(tmp, 'origin.git'));
  write(base, 'sidebar.css', 'width: 200px;\n');
  write(base, 'list.mjs', 'export const rows = 10;\n');
  write(base, 'readme.txt', 'hello\n');
  git(base, 'add', '.');
  git(base, 'commit', '-q', '-m', 'init');
  git(base, 'push', '-q', 'origin', 'main');

  const taskFolder = (id, files, subject) => {
    const folder = path.join(tmp, id);
    git(base, 'worktree', 'add', '-q', '-b', `agentbox/${id}`, folder, 'main');
    for (const [file, text] of Object.entries(files)) write(folder, file, text);
    git(folder, 'add', '.');
    git(folder, 'commit', '-q', '-m', subject);
    return folder;
  };
  const folders = {
    'w-mine': taskFolder('w-mine', { 'sidebar.css': 'width: 240px;\n', 'list.mjs': 'export const rows = 20;\n' }, 'Wider sidebar and more rows'),
    'w-clean': taskFolder('w-clean', { 'notes.txt': 'mine alone\n' }, 'A file of its own'),
  };

  const startAnotherThread = (id, file, text, subject) => {
    git(base, 'checkout', '-q', '-b', `agentbox/${id}`, 'main');
    write(base, file, text);
    git(base, 'commit', '-q', '-am', subject);
    git(base, 'checkout', '-q', 'main');
  };
  // The way `npm run ship` lands a branch: main is merged into it if main
  // moved, then main moves to the branch.
  const shipAnotherThread = (id) => {
    git(base, 'checkout', '-q', `agentbox/${id}`);
    git(base, 'merge', '-q', '--no-ff', 'main', '-m', `Merge origin/main into agentbox/${id}`);
    git(base, 'checkout', '-q', 'main');
    git(base, 'merge', '-q', '--ff-only', `agentbox/${id}`);
  };
  startAnotherThread('w-narrow', 'sidebar.css', 'width: 160px;\n', 'Narrow the sidebar on small screens');
  startAnotherThread('w-unrelated', 'readme.txt', 'hello there\n', 'Say hello properly');
  shipAnotherThread('w-unrelated');
  shipAnotherThread('w-narrow');
  write(base, 'list.mjs', 'export const rows = 5;\n');
  git(base, 'commit', '-q', '-am', 'Fewer rows by hand');
  git(base, 'push', '-q', 'origin', 'main');
  // What `git push` from a task folder leaves behind: every folder sees the
  // new main as origin/main.
  git(base, 'fetch', '-q', 'origin');

  return { tmp, base, folders, cleanUp: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

export const threads = () => ({
  'w-narrow': { id: 'w-narrow', title: 'Sidebar crowds the phone', progress: 'Narrowed the sidebar to 160px below 600px wide.' },
  'w-unrelated': { id: 'w-unrelated', title: 'Readme greeting', progress: 'Changed the greeting.' },
});

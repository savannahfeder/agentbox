// A THREAD'S COMMITS GO WITH ITS HAND-OVER, inside the .change the hand-over
// already carries, as a git bundle of what its branch has that main does not.
// The receiver's new thread is put on a branch made from that bundle before its
// first run, so its folder starts with the same commits and authors. When the
// bundle cannot be used the thread starts from main with the .change, as before.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { baseRef, repoRoot, taskBranch } from './task-folders.mts';

export interface HandedCommits { ref: string; tip: string; bundle: string }

const GIT_MS = 20_000;
const REF = /^refs\/heads\/agentbox\/[\w.-]+$/;
const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const CHANGE_LINK = /\]\((attachments\/[^)\s]+\.change)\)/gi;

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GIT_MS, killSignal: 'SIGKILL', windowsHide: true }).trim();
  } catch { return null; }
}

function inScratch<T>(fn: (file: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-handed-'));
  try { return fn(path.join(dir, 'commits.bundle')); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const rootOf = (repoPath: string | null | undefined) => (repoPath && fs.existsSync(repoPath) ? repoRoot(repoPath) : null);

/** The commits on a thread's branch that its project's main lacks, or null when there are none. */
export function commitsOfThread(repoPath: string | null | undefined, threadId: string): HandedCommits | null {
  const root = rootOf(repoPath);
  if (!root) return null;
  const ref = `refs/heads/${taskBranch(threadId)}`;
  const tip = git(root, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
  const main = baseRef(root);
  if (!tip || !(Number(git(root, ['rev-list', '--count', `${main}..${ref}`])) > 0)) return null;
  return inScratch((file) => (git(root, ['bundle', 'create', file, ref, `^${main}`]) === null ? null
    : { ref, tip, bundle: fs.readFileSync(file).toString('base64') }));
}

/** The saved change with the thread's commits in it, or null when there are none or it would be over `maxBytes`. */
export function changeWithCommits(changeFile: string, repoPath: string | null | undefined, threadId: string, maxBytes: number): Buffer | null {
  const commits = commitsOfThread(repoPath, threadId);
  if (!commits) return null;
  let saved: unknown;
  try { saved = JSON.parse(fs.readFileSync(changeFile, 'utf8')); } catch { return null; }
  if (!saved || typeof saved !== 'object') return null;
  const bytes = Buffer.from(JSON.stringify({ ...saved, commits }));
  return bytes.length > maxBytes ? null : bytes;
}

function commitsIn(changeFile: string): HandedCommits | null {
  let saved: { commits?: Partial<HandedCommits> } | null;
  try { saved = JSON.parse(fs.readFileSync(changeFile, 'utf8')); } catch { return null; }
  const c = saved?.commits;
  if (!c || typeof c.ref !== 'string' || !REF.test(c.ref) || typeof c.tip !== 'string' || !SHA.test(c.tip) || typeof c.bundle !== 'string') return null;
  return { ref: c.ref, tip: c.tip, bundle: c.bundle };
}

function branchFrom(root: string, branch: string, carried: HandedCommits): boolean {
  return inScratch((file) => {
    fs.writeFileSync(file, Buffer.from(carried.bundle, 'base64'));
    // Verify fails when this repository lacks the commits the bundle builds on: another project.
    if (git(root, ['bundle', 'verify', '-q', file]) === null) return false;
    if (git(root, ['fetch', '-q', '--no-tags', file, `${carried.ref}:${branch}`]) === null) return false;
    if (git(root, ['rev-parse', '--verify', '-q', `${branch}^{commit}`]) === carried.tip) return true;
    git(root, ['update-ref', '-d', branch]);
    return false;
  });
}

/**
 * Puts a thread handed over to this computer on the branch its commits came
 * with, so the folder its first run gets is made from it. True when it did.
 */
export function startFromHandedCommits({ repoPath, dir, id, body, labels }: {
  repoPath: string | null | undefined; dir: string | null | undefined; id: string; body?: string | null; labels?: readonly string[] | null;
}): boolean {
  if (!dir || !labels?.some((l) => l.startsWith('handed-from:'))) return false;
  const root = rootOf(repoPath);
  if (!root) return false;
  const branch = `refs/heads/${taskBranch(id)}`;
  if (git(root, ['rev-parse', '--verify', '-q', branch]) !== null) return false;
  for (const m of String(body ?? '').matchAll(CHANGE_LINK)) {
    const carried = commitsIn(path.join(dir, 'attachments', path.basename(m[1])));
    if (carried && branchFrom(root, branch, carried)) return true;
  }
  return false;
}

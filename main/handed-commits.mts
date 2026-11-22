// A THREAD'S COMMITS GO WITH ITS HAND-OVER, inside the .change the hand-over
// already carries, as a git bundle of what its branch has that main does not.
// The receiver's new thread is put on a branch made from that bundle before its
// first run, so its folder starts with the same commits and authors. When the
// bundle cannot be used the thread starts from main with the .change, as before.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { taskBranch } from './task-folders.mts';
import { machineryPath } from './store/home.mts';

export interface HandedCommits { ref: string; tip: string; bundle: string }

const run = promisify(execFile);
const GIT_MS = 20_000;
const REF = /^refs\/heads\/agentbox\/[\w.-]+$/;
const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const CHANGE_LINK = /\]\((attachments\/[^)\s]+\.change)\)/gi;
const HANDED_LABEL = 'handed-from:';

/** A new thread started from a handed-over task, whose commits may have come with it. */
export const mayBeHandedOver = (labels: readonly string[] | null | undefined): boolean => !!labels?.some((l) => l.startsWith(HANDED_LABEL));

// The thread's first message still says to start from the .change, which is right only when the commits did not come.
export const HANDED_COMMITS_NOTE = 'The commits this thread was handed over with are already on its branch, so the .change attached to it is a record of that work: do not apply it again. Apply only edits in it that the branch does not have yet.';

const markOf = (dir: string, id: string) => machineryPath(dir, `runs/${id}/commits-handed-over.json`);

// Off the window's thread: these run while she presses Send or Hand over.
async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', args, { cwd, encoding: 'utf8', timeout: GIT_MS, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch { return null; }
}

async function inScratch<T>(fn: (file: string) => Promise<T>): Promise<T> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agentbox-handed-'));
  try { return await fn(path.join(dir, 'commits.bundle')); } finally { await fs.promises.rm(dir, { recursive: true, force: true }); }
}

const rootOf = async (repoPath: string | null | undefined) => (repoPath && fs.existsSync(repoPath) ? (await git(repoPath, ['rev-parse', '--show-toplevel'])) || null : null);

// As task-folders' baseRef: what a new thread's folder starts from.
async function mainOf(root: string): Promise<string> {
  for (const name of ['main', 'master']) if (await git(root, ['rev-parse', '--verify', '-q', `refs/heads/${name}`]) !== null) return `refs/heads/${name}`;
  return 'HEAD';
}

/** The commits on a thread's branch that its project's main lacks, or null when there are none. */
export async function commitsOfThread(repoPath: string | null | undefined, threadId: string): Promise<HandedCommits | null> {
  const root = await rootOf(repoPath);
  if (!root) return null;
  const ref = `refs/heads/${taskBranch(threadId)}`;
  const tip = await git(root, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
  const main = await mainOf(root);
  if (!tip || !(Number(await git(root, ['rev-list', '--count', `${main}..${ref}`])) > 0)) return null;
  return inScratch(async (file) => (await git(root, ['bundle', 'create', file, ref, `^${main}`]) === null ? null
    : { ref, tip, bundle: (await fs.promises.readFile(file)).toString('base64') }));
}

/** The saved change with the thread's commits in it, or null when there are none or it would be over `maxBytes`. */
export async function changeWithCommits(changeFile: string, repoPath: string | null | undefined, threadId: string, maxBytes: number): Promise<Buffer | null> {
  const commits = await commitsOfThread(repoPath, threadId);
  if (!commits) return null;
  let saved: unknown;
  try { saved = JSON.parse(await fs.promises.readFile(changeFile, 'utf8')); } catch { return null; }
  if (!saved || typeof saved !== 'object') return null;
  const bytes = Buffer.from(JSON.stringify({ ...saved, commits }));
  return bytes.length > maxBytes ? null : bytes;
}

async function commitsIn(changeFile: string): Promise<HandedCommits | null> {
  let saved: { commits?: Partial<HandedCommits> } | null;
  try { saved = JSON.parse(await fs.promises.readFile(changeFile, 'utf8')); } catch { return null; }
  const c = saved?.commits;
  if (!c || typeof c.ref !== 'string' || !REF.test(c.ref) || typeof c.tip !== 'string' || !SHA.test(c.tip) || typeof c.bundle !== 'string') return null;
  return { ref: c.ref, tip: c.tip, bundle: c.bundle };
}

function branchFrom(root: string, branch: string, carried: HandedCommits): Promise<boolean> {
  return inScratch(async (file) => {
    await fs.promises.writeFile(file, Buffer.from(carried.bundle, 'base64'));
    // Verify fails when this repository lacks the commits the bundle builds on: another project.
    if (await git(root, ['bundle', 'verify', '-q', file]) === null) return false;
    if (await git(root, ['fetch', '-q', '--no-tags', file, `${carried.ref}:${branch}`]) === null) return false;
    if (await git(root, ['rev-parse', '--verify', '-q', `${branch}^{commit}`]) === carried.tip) return true;
    await git(root, ['update-ref', '-d', branch]);
    return false;
  });
}

/**
 * Puts a thread handed over to this computer on the branch its commits came
 * with, so the folder its first run gets is made from it. True when it did.
 * Called before the thread's row exists, so nothing can start it on main meanwhile.
 */
export async function startFromHandedCommits({ repoPath, dir, id, body, labels }: {
  repoPath: string | null | undefined; dir: string | null | undefined; id: string; body?: string | null; labels?: readonly string[] | null;
}): Promise<boolean> {
  if (!dir || !mayBeHandedOver(labels)) return false;
  const root = await rootOf(repoPath);
  if (!root) return false;
  const branch = `refs/heads/${taskBranch(id)}`;
  if (await git(root, ['rev-parse', '--verify', '-q', branch]) !== null) return false;
  for (const m of String(body ?? '').matchAll(CHANGE_LINK)) {
    const carried = await commitsIn(path.join(dir, 'attachments', path.basename(m[1])));
    if (!carried || !await branchFrom(root, branch, carried)) continue;
    const mark = markOf(dir, id);
    await fs.promises.mkdir(path.dirname(mark), { recursive: true });
    await fs.promises.writeFile(mark, JSON.stringify({ branch, tip: carried.tip }));
    return true;
  }
  return false;
}

/** What a thread's first run is told when its branch was made from the commits it was handed over with. */
export function handedCommitsNote(dir: string | null | undefined, item: { id: string; labels?: readonly string[] | null }): string {
  if (!dir || !mayBeHandedOver(item.labels)) return '';
  try { return fs.existsSync(markOf(dir, item.id)) ? HANDED_COMMITS_NOTE : ''; } catch { return ''; }
}

// What the other side of a merge conflict was for, so the thread that hit it
// can resolve it without asking the person. Read-only git: nothing here
// touches a working tree.

import { execFile } from 'node:child_process';

const GIT_MS = 10_000;
const MAX_COMMITS = 8;
const SUMMARY_CHARS = 240;

export const KEEP_BOTH = 'Resolve it keeping both changes where they fit. Only ask the person if the two changes want opposite things, and then say which you kept and why.';

const CONFLICT_LINE = /^CONFLICT \([^)]*\): .*$/m;
// Main's own merges from `npm run ship`: "Merge origin/main into agentbox/<id>".
const SHIPPED_FROM = /\binto agentbox\/([A-Za-z0-9_-]+)\s*$/;

export const isMergeConflict = (output) => CONFLICT_LINE.test(String(output ?? ''));

/** The files the script's own output says conflicted. */
export function conflictedFilesIn(output) {
  const files = new Set();
  for (const line of String(output ?? '').split('\n')) {
    const m = line.match(/^CONFLICT \([^)]*\): (?:Merge conflict in (.+)|(\S+) deleted in )/);
    const file = m && (m[1] ?? m[2]);
    if (file) files.add(file.trim());
  }
  return [...files];
}

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: GIT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve({ ok: !err, code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, out: String(stdout ?? '') });
    });
  });
}

/** Files that would conflict merging `upstream` into `head`, or null if git cannot say. */
export async function filesThatConflict(cwd, head, upstream) {
  const r = await git(cwd, ['merge-tree', '--write-tree', '--name-only', '--no-messages', head, upstream]);
  if (r.code !== 0 && r.code !== 1) return null;
  return r.out.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
}

// The thread whose ship brought `sha` onto main: the oldest of main's ship
// merges after it where `sha` came in on the branch side, not main's.
async function threadThatShipped(cwd, sha, upstream) {
  const r = await git(cwd, ['log', '--merges', '--ancestry-path', '--reverse', '--format=%H %P%x09%s', `${sha}..${upstream}`]);
  const merges = r.out.split('\n').filter(Boolean).slice(0, 3);
  for (const line of merges) {
    const [shas, subject = ''] = line.split('\t');
    const id = subject.match(SHIPPED_FROM)?.[1];
    const mainSide = shas.split(' ')[2];
    if (!id || !mainSide) continue;
    const onMainAlready = await git(cwd, ['merge-base', '--is-ancestor', sha, mainSide]);
    if (onMainAlready.code === 1) return id;
  }
  return null;
}

const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

// The conflicting files, then what changed them on `upstream`, by thread.
async function otherSide({ cwd, files, upstream, readThread }) {
  const lines = [`Files: ${files.map((f) => `\`${f}\``).join(', ') || 'see the output below'}.`];
  const since = cwd ? (await git(cwd, ['merge-base', 'HEAD', upstream])).out.trim() : '';
  const log = since && files.length
    ? await git(cwd, ['log', '--no-merges', `-n${MAX_COMMITS}`, '--format=%h %H%x09%s', `${since}..${upstream}`, '--', ...files])
    : { out: '' };
  const byThread = new Map();
  for (const entry of log.out.split('\n').filter(Boolean)) {
    const [shas, subject = ''] = entry.split('\t');
    const [short, full] = shas.split(' ');
    const id = await threadThatShipped(cwd, full, upstream);
    if (!byThread.has(id)) byThread.set(id, []);
    byThread.get(id).push(`${short} ${oneLine(subject)}`);
  }

  if (!byThread.size) return lines;
  lines.push('', `What changed them on ${upstream} since this branch began:`);
  for (const [id, commits] of [...byThread].sort(([a], [b]) => (a === null) - (b === null))) {
    if (!id) {
      lines.push(`- From no thread: ${commits.join('; ')}`);
      continue;
    }
    let thread = null;
    try { thread = readThread(id); } catch {}
    const title = oneLine(thread?.title);
    const about = clip(oneLine(thread?.progress || thread?.problem), SUMMARY_CHARS);
    lines.push(`- Thread ${title ? `"${title}" ` : ''}(${id})${about ? `: ${about}` : ''}`, `  Commits: ${commits.join('; ')}`);
  }
  return lines;
}

/**
 * The brief for a ship that failed, or null when it was not a merge conflict.
 *
 * @param {{ cwd: string, output: string, upstream?: string, readThread?: (id: string) => object|null }} opts
 */
export async function conflictBrief({ cwd, output, upstream = 'origin/main', readThread = () => null }) {
  if (!isMergeConflict(output)) return null;
  const fromGit = cwd ? await filesThatConflict(cwd, 'HEAD', upstream) : null;
  const files = fromGit?.length ? fromGit : conflictedFilesIn(output);
  return ['The other side of the conflict:', '', ...await otherSide({ cwd, files, upstream, readThread }), '', KEEP_BOTH].join('\n');
}

/** For a branch that has not shipped yet: null unless `upstream` now conflicts with it. */
export async function earlyConflictNote({ cwd, upstream = 'origin/main', readThread = () => null }) {
  const files = await filesThatConflict(cwd, 'HEAD', upstream);
  if (!files?.length) return null;
  return [
    `${upstream} moved while this thread waited, and this branch no longer merges cleanly with it. Merge ${upstream} into it before you mark it ready to ship.`,
    '',
    ...await otherSide({ cwd, files, upstream, readThread }),
    '',
    KEEP_BOTH,
  ].join('\n');
}

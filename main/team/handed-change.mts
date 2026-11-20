// The code a thread made, as one patch file a hand-over sends with its task:
// the commits on the thread's branch since it left main. The folder they were
// made in is put away when the thread closes, so this is the only copy that
// can travel.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { baseRef, taskBranch } from '../task-folders.mts';
import { MAX_MESSAGE_FILE_BYTES } from './sync.mts';

const GIT_MS = 20_000;

function git(cwd: string, args: string[]): string | null {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

export interface HandedChange { file: { rel: string; name: string; srcPath: string } | null; words: string }

export function handedChange({ repoPath, id, owner, outDir, maxBytes = MAX_MESSAGE_FILE_BYTES }: {
  repoPath: string | null | undefined; id: string; owner: string; outDir: string; maxBytes?: number;
}): HandedChange {
  const none = { file: null, words: '' };
  if (!repoPath || !fs.existsSync(repoPath)) return none;
  const branch = taskBranch(id);
  if (git(repoPath, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]) === null) return none;
  const base = git(repoPath, ['merge-base', baseRef(repoPath), `refs/heads/${branch}`])?.trim();
  if (!base) return none;
  const count = Number(git(repoPath, ['rev-list', '--count', `${base}..refs/heads/${branch}`])?.trim() || 0);
  if (!count) return none;
  const commits = `${count} ${count === 1 ? 'commit' : 'commits'} from ${owner}’s branch ${branch}`;
  const patch = git(repoPath, ['format-patch', '--stdout', '--binary', `${base}..refs/heads/${branch}`]);
  if (patch === null) return { file: null, words: `The work so far is ${commits}, which could not be read to send. Ask ${owner} for it.` };
  if (Buffer.byteLength(patch) > maxBytes) {
    return { file: null, words: `The work so far is ${commits}, too big to send here (${Math.ceil(Buffer.byteLength(patch) / 1024 / 1024)} MB). Ask ${owner} to push it.` };
  }
  const name = `${id}.patch`;
  fs.mkdirSync(outDir, { recursive: true });
  const srcPath = path.join(outDir, name);
  fs.writeFileSync(srcPath, patch);
  return {
    file: { rel: name, name, srcPath },
    words: `The work so far is [${name}](${name}), ${commits}. Apply it on a new branch first (\`git switch -c ${branch}\`, then \`git am\` the file), and carry on from there.`,
  };
}

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

/** An error as words for the screen: a local path becomes its file's name. */
export const withoutPaths = (message: string): string => message.replace(/(?:~|\/)[^\s'"`,:]*\/([^\s'"`,:/]+)/g, '$1');

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
  // The branch is only ever named inside a command: alone, even quoted, the window links it as a thread.
  const commits = `${count} ${count === 1 ? 'commit' : 'commits'} from ${owner}’s branch`;
  const patch = git(repoPath, ['format-patch', '--stdout', '--binary', `${base}..refs/heads/${branch}`]);
  if (patch === null) return { file: null, words: `The work so far is ${commits}, which could not be read to send. Ask ${owner} for it.` };
  if (Buffer.byteLength(patch) > maxBytes) {
    return { file: null, words: `The work so far is ${commits}, too big to send here (${Math.ceil(Buffer.byteLength(patch) / 1024 / 1024)} MB). Ask ${owner} to push it (\`git push origin ${branch}\`).` };
  }
  const name = `${id}.patch`;
  const srcPath = path.join(outDir, name);
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(srcPath, patch);
  } catch (err) {
    return { file: null, words: `Couldn’t package the change: ${withoutPaths(String((err as Error)?.message ?? err))}. The work so far is ${commits}; ask ${owner} for it (\`git format-patch ${base.slice(0, 12)}..${branch}\`).` };
  }
  return {
    file: { rel: name, name, srcPath },
    words: `The work so far is [${name}](${name}), ${commits}. Apply it on a new branch first (\`git switch -c ${branch}\`, then \`git am\` the file), and carry on from there.`,
  };
}

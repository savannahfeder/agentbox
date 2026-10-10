import { execFileSync } from 'node:child_process';
import { testsThatRead } from './tests-that-read.mjs';

const fullInputs = /^(?:package(?:-lock)?\.json|vitest\.config\.[^/]+|tests\/(?:agentbox-home\.setup|app-home)\.mjs|scripts\/hooks\/|scripts\/lib\/(?:test-plan|tests-that-read)\.mjs|scripts\/test-what-changed\.mjs)/;
const sourceFile = /\.(?:[cm]?[jt]s|[jt]sx|json|css|html)$/;

/** Git's NUL-delimited output preserves spaces, newlines, and non-ASCII names. */
function diffEntries(output) {
  const fields = output.split('\0');
  const entries = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if (fields[i]) entries.push({ status: fields[i], file: fields[i + 1] });
  }
  return entries;
}

export function collectChanges({ root = process.cwd(), base, working = false } = {}) {
  const git = (...args) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const entries = [];
  if (!working) {
    let baseCommit;
    try {
      baseCommit = git('rev-parse', '--verify', '--end-of-options', `${base || 'origin/main'}^{commit}`).trim();
      entries.push(...diffEntries(git('diff', '--name-status', '-z', '--no-renames', `${baseCommit}...HEAD`, '--')));
    } catch {
      if (base) throw new Error(`Cannot resolve comparison base: ${base}`);
      return { files: [], deleted: [], uncertain: 'origin/main is unavailable; fetch it or pass --base' };
    }
  }
  try {
    entries.push(...diffEntries(git('diff', '--name-status', '-z', '--no-renames', 'HEAD', '--')));
    const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
    entries.push(...untracked.map(file => ({ status: 'A', file })));
  } catch {
    return { files: [], deleted: [], uncertain: 'working-tree changes could not be determined' };
  }
  return {
    files: [...new Set(entries.map(entry => entry.file))].sort(),
    deleted: [...new Set(entries.filter(entry => entry.status === 'D').map(entry => entry.file))].sort(),
  };
}

export function planTests({ root = process.cwd(), files = [], deleted = [], uncertain } = {}) {
  const unique = [...new Set(files)].sort();
  const fullReason = uncertain
    || (unique.some(file => fullInputs.test(file)) && 'dependencies or shared test infrastructure changed')
    || (deleted.some(file => sourceFile.test(file)) && 'source was deleted; remaining imports cannot prove coverage');
  if (fullReason) return { mode: 'full', reason: fullReason, files: unique, readers: [] };
  if (!unique.length) return { mode: 'none', reason: 'no changed files', files: [], readers: [] };
  // Include documentation and assets: some tests read these without importing them.
  const readers = testsThatRead(unique, root).filter(file => !unique.includes(file));
  return { mode: 'related', reason: 'changed inputs plus importing and source-reading tests', files: unique, readers };
}

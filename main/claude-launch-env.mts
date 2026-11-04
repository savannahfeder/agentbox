// An npm Claude Code from before the package shipped a native binary is a
// `#!/usr/bin/env node` script. Opened from the Dock, the app's PATH is
// launchd's four folders, and with nvm lazy-loaded no profile adds node, so the
// app found that Claude Code and every worker died with
// `env: node: No such file or directory`
// (tests/an-old-npm-claude-code-starts-as-a-worker-from-the-dock).
//
// Narrower than main/codex-launch-env.mts on purpose. A worker's PATH is the
// PATH its agent's own commands run under, so it is changed only when this
// binary needs node and none is on it, and the node found is added at the end,
// where it cannot shadow anything the person's own PATH chose.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { candidatePaths, versionedPaths } from './claude-bin.mjs';

function executable(file: string) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch { return false; }
}

/** Whether `bin`, followed through its links, is a script run by node. */
function runsOnNode(bin: string) {
  try {
    const fd = fs.openSync(fs.realpathSync(bin), 'r');
    const head = Buffer.alloc(128);
    const read = fs.readSync(fd, head, 0, head.length, 0);
    fs.closeSync(fd);
    const first = head.subarray(0, read).toString('utf8').split('\n')[0];
    return /^#!.*\bnode\b/.test(first);
  } catch { return false; }
}

export interface LaunchEnvOptions {
  home?: string;
  exists?: (file: string) => boolean;
  readdir?: (dir: string) => string[];
}

export function claudeLaunchEnv(bin: string | null | undefined, source: NodeJS.ProcessEnv = process.env, {
  home = source.HOME || os.homedir(), exists = executable, readdir,
}: LaunchEnvOptions = {}) {
  if (!bin || !runsOnNode(bin)) return { ...source };
  const inherited = (source.PATH || '').split(path.delimiter).filter(Boolean);
  if (inherited.some(dir => exists(path.join(dir, 'node')))) return { ...source };
  // The node npm installed it with sits beside the link, or beside the real
  // file's package; then the places a Node install usually lives.
  let real = bin;
  try { real = fs.realpathSync(bin); } catch { /* keep the link */ }
  const directories = [...new Set([
    path.dirname(bin), path.dirname(real),
    ...candidatePaths(home).map(path.dirname),
    ...versionedPaths(home, readdir as undefined).map(path.dirname),
  ])];
  const nodeDir = directories.find(dir => exists(path.join(dir, 'node')));
  if (!nodeDir) return { ...source };
  return { ...source, PATH: [...inherited, nodeDir].join(path.delimiter) };
}

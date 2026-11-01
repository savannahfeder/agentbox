// An npm Codex executable starts with `#!/usr/bin/env node`. Finding that
// executable does not put its Node on a desktop app's launchd PATH.
// Resolve from disk, without running shell profiles or changing the app's env.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { candidatePaths, versionedPaths } from './codex-bin.mjs';

function executable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch { return false; }
}

export function codexLaunchEnv(bin, source = process.env, {
  home = source.HOME || os.homedir(), exists = executable, readdir,
} = {}) {
  if (!bin) return { ...source };
  const binDir = path.dirname(bin);
  const inherited = (source.PATH || '').split(path.delimiter).filter(Boolean);
  // Prefer the Node beside this Codex, then the user's existing PATH. A custom
  // npm prefix can hold Codex while its Node lives under nvm, fnm, or asdf.
  const directories = [...new Set([
    binDir, ...inherited,
    ...candidatePaths(home).map(path.dirname),
    ...versionedPaths(home, readdir).map(path.dirname),
  ])];
  const nodeDir = directories.find(dir => exists(path.join(dir, 'node')));
  return { ...source, PATH: [...new Set([binDir, ...(nodeDir ? [nodeDir] : []), ...inherited])].join(path.delimiter) };
}

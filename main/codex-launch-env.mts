// An npm Codex executable starts with `#!/usr/bin/env node`. Finding that
// executable does not put its Node on a desktop app's launchd PATH.
// Resolve from disk, without running shell profiles or changing the app's env.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { candidatePaths, versionedPaths } from './codex-bin.mjs';

function executable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch { return false; }
}

export interface CodexLaunchEnvOptions {
  home?: string;
  exists?: (file: string) => boolean;
  readdir?: (dir: string) => string[];
  platform?: NodeJS.Platform;
}

export function codexLaunchEnv(bin: string | null | undefined, source: NodeJS.ProcessEnv = process.env, {
  home = source.HOME || os.homedir(), exists = executable, readdir, platform = process.platform,
}: CodexLaunchEnvOptions = {}): NodeJS.ProcessEnv {
  if (!bin) return { ...source };
  if (platform === 'win32') return windowsLaunchEnv(bin, source);
  const binDir = path.dirname(bin);
  const inherited = (source.PATH || '').split(path.delimiter).filter(Boolean);
  // Prefer the Node beside this Codex, then the user's existing PATH. A custom
  // npm prefix can hold Codex while its Node lives under nvm, fnm, or asdf.
  const directories = [...new Set([
    binDir, ...inherited,
    ...candidatePaths(home).map(path.dirname),
    ...versionedPaths(home, readdir as never).map(path.dirname),
  ])];
  const nodeDir = directories.find(dir => exists(path.join(dir, 'node')));
  return { ...source, PATH: [...new Set([binDir, ...(nodeDir ? [nodeDir] : []), ...inherited])].join(path.delimiter) };
}

// codex.exe needs no Node. A Windows child handed several spellings of PATH
// sees only the first in sort order, so that one is kept and the rest go.
function windowsLaunchEnv(bin: string, source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  const keys = Object.keys(env).filter(k => k.toUpperCase() === 'PATH').sort();
  const key = keys[0] ?? 'PATH';
  const inherited = (env[key] || '').split(';').filter(Boolean);
  for (const k of keys) delete env[k];
  env[key] = [...new Set([path.win32.dirname(bin), ...inherited])].join(';');
  // What npm's codex.js sets before it runs this same exe.
  const npmPackage = /^(.*\\node_modules\\@openai\\codex)\\node_modules\\@openai\\codex-win32-[^\\]+\\vendor\\/i.exec(bin);
  if (npmPackage) {
    for (const by of ['NPM', 'BUN', 'PNPM', 'VITE_PLUS']) delete env[`CODEX_MANAGED_BY_${by}`];
    env.CODEX_MANAGED_PACKAGE_ROOT = npmPackage[1];
    env.CODEX_MANAGED_BY_NPM = '1';
  }
  return env;
}

// How a ship's git commands get the GitHub token without any environment
// holding it (scripts/ship.mjs). The push hook runs the branch's own tests as
// the user, and they can list the environment of every process the user runs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'push-credential.mjs');
const quoted = (s) => `'${s.replaceAll("'", "'\\''")}'`;

export function withConfig(env, pairs) {
  const n = Number(env.GIT_CONFIG_COUNT) || 0;
  const out = { ...env, GIT_CONFIG_COUNT: String(n + pairs.length) };
  pairs.forEach(([k, v], i) => { out[`GIT_CONFIG_KEY_${n + i}`] = k; out[`GIT_CONFIG_VALUE_${n + i}`] = v; });
  return out;
}

function remoteOf(cwd, env) {
  const branch = (spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, env, encoding: 'utf8' }).stdout ?? '').trim();
  const remote = branch ? (spawnSync('git', ['config', `branch.${branch}.remote`], { cwd, env, encoding: 'utf8' }).stdout ?? '').trim() : '';
  return remote || 'origin';
}

/**
 * A spawnSync for git commands that may need the sign-in. The token goes in a
 * file with no name, open on fd 3 of that one command; push-credential.mjs
 * reads it there once and empties it. Only a remote on the site gets it,
 * because git asks for no sign-in elsewhere and the file would stay full while
 * the hook ran. The empty helper clears any helper set before it, so a stale
 * keychain entry cannot answer first.
 */
export function signedGit({ token, site = 'https://github.com', node = process.execPath }) {
  return (args, { cwd, env = process.env, remote, pushing = false, ...opts } = {}) => {
    const url = token ? (spawnSync('git', ['remote', 'get-url', ...(pushing ? ['--push'] : []), remote ?? remoteOf(cwd, env)], { cwd, env, encoding: 'utf8' }).stdout ?? '').trim() : '';
    if (!token || !url.startsWith(`${site}/`)) return spawnSync('git', args, { cwd, env, encoding: 'utf8', ...opts });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'));
    const file = path.join(dir, 'sign-in');
    const fd = fs.openSync(file, 'w+', 0o600);
    try {
      fs.unlinkSync(file);
      fs.rmdirSync(dir);
      fs.writeSync(fd, token, 0);
      const helper = [[`credential.${site}.helper`, ''], [`credential.${site}.helper`, `!${quoted(node)} ${quoted(HELPER)}`]];
      return spawnSync('git', args, { cwd, encoding: 'utf8', ...opts, env: withConfig(env, helper), stdio: ['ignore', 'pipe', 'pipe', fd] });
    } finally {
      fs.closeSync(fd);
    }
  };
}

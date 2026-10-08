// Finder launches inherit launchd's PATH rather than the user's shell tools.
// Read only PATH: importing a profile's whole environment would import keys
// and login overrides too. Workers still pass through their billing scrub.
import { execFile } from 'node:child_process';
import path from 'node:path';

const MARKER = '\0agentbox-path\0';
function runShell(file, args, options) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin?.end();
  });
}

export async function recoverShellPath({ env = process.env, platform = process.platform, run = runShell } = {}) {
  const original = env.PATH || '';
  if (platform !== 'darwin') return { path: original, error: null };
  const shell = env.SHELL || '/bin/zsh';
  const value = path.basename(shell) === 'fish' ? '(string join : $PATH)' : '"$PATH"';
  try {
    // NUL framing keeps messages printed by .zshrc out of the returned PATH.
    const stdout = String(await run(shell, ['-ilc', `printf '\\0agentbox-path\\0%s\\0' ${value}`], {
      env: { ...env }, encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024,
    }));
    const start = stdout.lastIndexOf(MARKER);
    const end = start < 0 ? -1 : stdout.indexOf('\0', start + MARKER.length);
    const recovered = end < 0 ? '' : stdout.slice(start + MARKER.length, end);
    if (!recovered || /[\r\n]/.test(recovered)) throw Error('Your shell did not return its command search path.');
    const entries = [...new Set([...recovered.split(':'), ...original.split(':')].filter(Boolean))];
    if (!entries.length) throw Error('Your shell returned an empty command search path.');
    return { path: entries.join(':'), error: null };
  } catch (error) {
    return { path: original, error: String(error?.message || error) };
  }
}

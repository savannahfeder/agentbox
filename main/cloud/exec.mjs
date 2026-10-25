// A command run without holding up this process, which every cloud run's relay
// shares (./host.mjs): one run's git or tar must not stop the others.
import { spawn } from 'node:child_process';

// Resolves to stdout (a string, or a Buffer when `encoding` is null); rejects,
// as execFileSync throws, with "Command failed: <command>" and its stderr.
export function run(cmd, args, { cwd, env = process.env, input = null, encoding = 'utf8' } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (err) { reject(err); return; }
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      const stdout = Buffer.concat(out);
      if (code === 0) { resolve(encoding ? stdout.toString(encoding) : stdout); return; }
      const stderr = Buffer.concat(err).toString('utf8');
      const e = new Error(`Command failed: ${cmd} ${args.join(' ')}\n${stderr}`);
      Object.assign(e, { status: code, signal, stderr });
      reject(e);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? undefined);
  });
}

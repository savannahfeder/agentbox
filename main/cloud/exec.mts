// A command run without holding up this process, which every cloud run's relay
// shares (./host.mts): one run's git or tar must not stop the others.
import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

// Resolves to stdout (a string, or a Buffer when `encoding` is null); rejects,
// as execFileSync throws, with "Command failed: <command>" and its stderr.
export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string | Uint8Array | null;
  encoding?: BufferEncoding | null;
}

export function run(cmd: string, args: string[], { cwd, env = process.env, input = null, encoding = 'utf8' }: RunOptions = {}) {
  return new Promise<string | Buffer>((resolve, reject) => {
    let child: ChildProcessByStdio<Writable, Readable, Readable>;
    try { child = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (err) { reject(err); return; }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
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

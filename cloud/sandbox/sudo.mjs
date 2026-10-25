#!/usr/bin/env node
// `sudo` ON THE CLOUD MACHINE.
//
// AgentCore starts its containers with no_new_privs, so the real sudo cannot
// raise anything (measured 2026-10-17: "The no new privileges flag is set").
// This stands in for it: it hands the command to the sandbox server, which
// runs as root, over a socket only processes on this machine can reach, and
// passes input, output and the exit code straight through. The machine is the
// agent's for one run; this gives it nothing it could not have had with sudo.
//
//   sudo [-E -H -n -S -k ...] [--] [VAR=value ...] command [args ...]
import net from 'node:net';

const sockPath = process.env.AGENTBOX_ROOT_SOCK || '/run/agentbox-root.sock';
const args = process.argv.slice(2);
const env = {};
let i = 0;
for (; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--') { i += 1; break; }
  if (a === '-u' || a === '--user') {
    if (args[i + 1] !== 'root') { process.stderr.write('sudo: only root is available here\n'); process.exit(1); }
    i += 1;
    continue;
  }
  if (/^-[A-Za-z]+$/.test(a) || /^--[a-z-]+(=.*)?$/.test(a)) continue;
  break;
}
for (; i < args.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[i]); i += 1) {
  const at = args[i].indexOf('=');
  env[args[i].slice(0, at)] = args[i].slice(at + 1);
}
const argv = args.slice(i);
if (!argv.length) { process.stderr.write('usage: sudo command [args ...]\n'); process.exit(1); }

const sock = net.connect(sockPath);
let code = null;
sock.on('error', () => {
  process.stderr.write("sudo: the cloud machine's helper is not running, so nothing can run as root\n");
  process.exit(1);
});
sock.on('connect', () => {
  sock.write(JSON.stringify({ argv, env, cwd: process.cwd() }) + '\n');
  process.stdin.on('data', (d) => sock.write(`i ${d.toString('base64')}\n`));
  process.stdin.on('end', () => sock.write('I\n'));
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { sock.write(`k ${sig}\n`); setTimeout(() => process.exit(128 + 15), 500); });
});
let buf = '';
sock.on('data', (d) => {
  buf += d;
  let n;
  while ((n = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, n);
    buf = buf.slice(n + 1);
    if (line.startsWith('o ')) process.stdout.write(Buffer.from(line.slice(2), 'base64'));
    else if (line.startsWith('e ')) process.stderr.write(Buffer.from(line.slice(2), 'base64'));
    else if (line.startsWith('x ')) code = Number(line.slice(2));
  }
});
sock.on('close', () => process.stdout.write('', () => process.exit(code ?? 1)));

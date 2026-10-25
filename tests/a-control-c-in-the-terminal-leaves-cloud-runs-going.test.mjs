// A CONTROL-C IN THE TERMINAL LEAVES CLOUD RUNS GOING (w-4465054f04).
//
// In the cloud power test every Control-C on the app stopped the cloud runs
// with it: the four live at the two crashes were cancelled ("STOPPED by the
// Control-C SIGINT") and run again from the start once the app reopened. A
// quit leaves them going. Control-C is how a terminal user quits (`npx
// agentbox-app`, `agentbox` on Linux, `npm start`), and the terminal sends
// SIGINT to every process in the app's group at once, so each cloud relay
// heard it before the app's own quit could send the SIGHUP that leaves a run
// going, and took it as Stop.
//
// A cloud relay now starts in a process group of its own. Control-C reaches
// the app, which quits as it always does (bin/agentbox.mjs), and the relay
// hears only what the app sends it.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SUPERVISOR = fileURLToPath(new URL('../main/supervisor.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('..', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const groupOf = (pid) => Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim());

let tmp; let pids = [];
afterEach(() => {
  for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  pids = [];
  fs.rmSync(tmp, { recursive: true, force: true });
});

// A relay that writes down every signal it is sent.
const RELAY = `
const fs = require('node:fs');
const out = process.argv[2];
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => fs.appendFileSync(out, s + '\\n'));
fs.appendFileSync(out, 'ready\\n');
setInterval(() => {}, 1000);
`;

// The app, in a group of its own as a terminal starts it, starting one relay
// the way the supervisor does.
const APP = (host) => `
import { Supervisor } from ${JSON.stringify(SUPERVISOR)};
const [relay, said, pidFile] = process.argv.slice(2);
const sup = {
  appDir: ${JSON.stringify(REPO)},
  _cloudHostAvailable: () => ${host},
  _cloudHost: () => '/nonexistent/agentbox-cloud-host.sock',
  _cloudRunPath: () => relay,
  _cloudAccountEnv: () => ({}),
};
const child = Supervisor.prototype._spawnCloudRelay.call(sup, [said], { cwd: process.cwd(), env: process.env, stdio: 'ignore' });
import('node:fs').then((fs) => fs.writeFileSync(pidFile, String(child.pid)));
setInterval(() => {}, 1000);
`;

async function startApp({ host = false } = {}) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrl-c-'));
  const relay = path.join(tmp, 'relay.cjs');
  const said = path.join(tmp, 'said.txt');
  const pidFile = path.join(tmp, 'relay.pid');
  const app = path.join(tmp, 'app.mjs');
  fs.writeFileSync(relay, RELAY);
  fs.writeFileSync(app, APP(host));
  const child = spawn(process.execPath, [app, relay, said, pidFile], { cwd: tmp, detached: true, stdio: 'ignore' });
  pids.push(child.pid);
  const end = Date.now() + 10_000;
  while (!fs.existsSync(pidFile) && Date.now() < end) await wait(50);
  const relayPid = Number(fs.readFileSync(pidFile, 'utf8'));
  pids.push(relayPid);
  return { app: child.pid, relay: relayPid, said };
}

describe('a cloud relay', () => {
  it('runs in a process group of its own, not the app\'s', async () => {
    const { app, relay } = await startApp();
    expect(groupOf(relay)).toBe(relay);
    expect(groupOf(relay)).not.toBe(groupOf(app));
  });

  it('does not hear the terminal\'s Control-C, which the app does', async () => {
    const { app, relay, said } = await startApp();
    const end = Date.now() + 10_000;
    while (!(fs.existsSync(said) && fs.readFileSync(said, 'utf8').includes('ready')) && Date.now() < end) await wait(50);
    process.kill(-app, 'SIGINT');
    await wait(500);
    expect(alive(app)).toBe(false);
    expect(alive(relay)).toBe(true);
    expect(fs.readFileSync(said, 'utf8')).not.toMatch(/SIGINT/);
  }, 20_000);

  it('still hears what the app sends it', async () => {
    const { relay, said } = await startApp();
    const end = Date.now() + 10_000;
    while (!(fs.existsSync(said) && fs.readFileSync(said, 'utf8').includes('ready')) && Date.now() < end) await wait(50);
    process.kill(relay, 'SIGHUP');
    await wait(300);
    expect(fs.readFileSync(said, 'utf8')).toMatch(/SIGHUP/);
  }, 20_000);

  it('through the shared cloud host is in a group of its own too', async () => {
    const { app, relay } = await startApp({ host: true });
    expect(groupOf(relay)).toBe(relay);
    expect(groupOf(relay)).not.toBe(groupOf(app));
  }, 20_000);
});

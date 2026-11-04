#!/usr/bin/env node
// WHAT AGENTBOX SEES ON THIS MAC, AS IT WOULD SEE IT OPENED FROM THE DOCK.
//
// check-machines.mjs builds machines unlike this one. This reads the one it
// runs on, for real, through the same modules and in the same order the app
// uses at launch, and it is meant to be run by EVERY person on the team: the
// bugs that ship are the ones that only exist on somebody else's Mac, and
// this is how their Mac gets into the verification without anyone sharing a
// screen.
//
//   node .claude/skills/verify-agentbox/scripts/check-this-machine.mjs [--out <dir>] [--json]
//
// READ-ONLY. It runs the login shell the way the app does (which sources the
// profile), and it starts each tool it finds once with `--version`, under the
// environment a worker would get. Nothing is written but the report, nothing is
// sent anywhere, and paths are printed with ~ for the home folder so the
// output can be pasted into a thread. Exit 1 when the app would be unable to
// start a worker for a tool that IS installed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { recoverShellPath, readShellDataDirs } = await import(path.join(repo, 'main/shell-path.mjs'));
const { findClaudeBin, askShell } = await import(path.join(repo, 'main/claude-bin.mjs'));
const { findCodexBin } = await import(path.join(repo, 'main/codex-bin.mjs'));
const { harnessFor } = await import(path.join(repo, 'main/harnesses.mts'));

const args = process.argv.slice(2);
const at = args.indexOf('--out');
const out = at >= 0 ? path.resolve(args[at + 1]) : path.join('/tmp', 'agentbox-verify', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-this-machine`);
const home = os.homedir();
const tilde = (p) => (typeof p === 'string' && (p === home || p.startsWith(home + path.sep)) ? `~${p.slice(home.length)}` : p);
const sh = (cmd, a) => { try { return execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).trim(); } catch { return null; } };

// The launch environment a Dock or Finder launch gets on macOS: launchd's,
// not this terminal's. On Linux the launcher entry runs with the session's
// environment, so that is used as it is.
const DOCK_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const launchEnv = process.platform === 'darwin'
  ? { HOME: home, USER: os.userInfo().username, LOGNAME: os.userInfo().username, SHELL: process.env.SHELL || '/bin/zsh', PATH: DOCK_PATH, TMPDIR: os.tmpdir(), LANG: process.env.LANG || 'en_US.UTF-8' }
  : { ...process.env };

const report = {
  at: new Date().toISOString(),
  machine: {
    os: `${process.platform} ${os.release()}`,
    macos: process.platform === 'darwin' ? sh('sw_vers', ['-productVersion']) : null,
    arch: process.arch,
    rosetta: process.platform === 'darwin' ? sh('sysctl', ['-n', 'sysctl.proc_translated']) === '1' : false,
    node: process.version,
    shell: launchEnv.SHELL,
    homeHasSpace: home.includes(' '),
    homebrew: ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].filter((p) => fs.existsSync(p)),
    nvm: fs.existsSync(path.join(home, '.nvm')),
    profiles: ['.zshrc', '.zprofile', '.bash_profile', '.bashrc', '.profile', '.config/fish/config.fish'].filter((f) => fs.existsSync(path.join(home, f))),
  },
};

const t0 = Date.now();
const boot = await recoverShellPath({ env: launchEnv });
report.shellPath = { ms: Date.now() - t0, error: boot.error ?? null, entries: boot.path.split(':').map(tilde) };
const bootEnv = { ...launchEnv, PATH: boot.path };
const dirs = await readShellDataDirs({ env: launchEnv });
report.shellDirs = Object.fromEntries(Object.entries(dirs).map(([k, v]) => [k, tilde(v)]));

const problems = [];
for (const [engine, find] of [['claude', findClaudeBin], ['codex', findCodexBin]]) {
  const found = find({ env: bootEnv, shellLookup: () => askShell({ env: bootEnv, bin: engine }) });
  const fact = { found: found.found, from: found.from ?? null, certain: found.certain ?? null, path: tilde(found.path), evidence: tilde(found.evidence) };
  if (found.found && found.path) {
    let real = found.path;
    try { real = fs.realpathSync(found.path); } catch { /* keep the link */ }
    fact.resolvesTo = tilde(real);
    const head = (() => { try { const b = Buffer.alloc(64); const fd = fs.openSync(real, 'r'); fs.readSync(fd, b, 0, 64, 0); fs.closeSync(fd); return b.toString('utf8'); } catch { return ''; } })();
    fact.kind = head.startsWith('#!') ? `script (${head.split('\n')[0].slice(2).trim()})` : 'native binary';
    const h = harnessFor(engine);
    const env = h.launchEnv(found.path, h.workerEnv(bootEnv), { home });
    const run = spawnSync(found.path, ['--version'], { env, encoding: 'utf8', timeout: 15_000 });
    fact.version = run.status === 0 ? String(run.stdout).trim().split('\n')[0] : null;
    fact.startsForAWorker = run.status === 0;
    if (run.status !== 0) {
      fact.startError = String(run.stderr || run.error?.message || `exit ${run.status}`).trim().split('\n')[0];
      problems.push(`${engine} is installed at ${fact.path} but a worker could not start it: ${fact.startError}`);
    }
    // What a person sees in a terminal, for comparison. A different answer
    // here than above is a machine where the app and the terminal disagree.
    const inTerminal = sh(process.env.SHELL || '/bin/zsh', ['-ilc', `command -v ${engine}`]);
    fact.terminalSays = tilde(inTerminal?.split('\n').pop() ?? null);
    if (fact.terminalSays && fact.terminalSays !== fact.path && fact.terminalSays !== fact.resolvesTo) fact.differsFromTerminal = true;
  } else if (found.certain === false) {
    fact.note = 'the app could not be sure, so it would not say "not installed"';
  }
  report[engine] = fact;
}
report.problems = problems;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'this-machine.json'), `${JSON.stringify(report, null, 1)}\n`);
if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 1));
} else {
  const m = report.machine;
  console.log(`machine   ${m.macos ? `macOS ${m.macos}` : m.os} ${m.arch}${m.rosetta ? ' (under Rosetta)' : ''}, node ${m.node}, shell ${m.shell}${m.homeHasSpace ? ', SPACE IN HOME' : ''}`);
  console.log(`          homebrew: ${m.homebrew.join(', ') || 'none'}; nvm: ${m.nvm ? 'yes' : 'no'}; profiles: ${m.profiles.join(', ') || 'none'}`);
  console.log(`shell     PATH read back in ${report.shellPath.ms} ms${report.shellPath.error ? `, error: ${report.shellPath.error}` : ''}; ${report.shellPath.entries.length} folders`);
  for (const [k, v] of Object.entries(report.shellDirs)) console.log(`          ${k}=${v}`);
  for (const engine of ['claude', 'codex']) {
    const f = report[engine];
    if (!f.found) { console.log(`${engine.padEnd(9)} not found${f.certain === false ? ' (unsure)' : ''}`); continue; }
    console.log(`${engine.padEnd(9)} ${f.startsForAWorker ? 'starts' : 'DOES NOT START'}  ${f.version ?? f.startError}`);
    console.log(`          at ${f.path}${f.resolvesTo !== f.path ? ` -> ${f.resolvesTo}` : ''} (${f.kind}, found from ${f.from})`);
    if (f.differsFromTerminal) console.log(`          the terminal finds a different one: ${f.terminalSays}`);
  }
  console.log(problems.length ? `\nPROBLEMS\n  ${problems.join('\n  ')}` : '\nNo problems: the app finds and can start every tool installed here.');
  console.log(`Report: ${path.join(out, 'this-machine.json')}`);
}
process.exit(problems.length ? 1 : 0);

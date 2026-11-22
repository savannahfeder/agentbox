#!/usr/bin/env node
// THE REAL CHECK OF EVERY HARNESS ON OFFER.
//
//   npm run check:harnesses              every harness on offer
//   npm run check:harnesses -- codex     one of them
//   npm run check:harnesses -- --json    the verdicts as JSON on stdout
//   npm run check:harnesses -- --keep    leave the copy's folder to read afterwards
//   npm run check:harnesses -- --candidate opencode
//                                        also a harness nobody is offered yet
//
// It starts a copy of the app on a store of its own and drives it through the
// calls the screen makes: a new thread on each harness, replies, a restart, a
// stop, a command allowed and a command refused (scripts/lib/harness-check.mts
// holds the list). The agents are the real tools on this machine, signed in as
// they are, so a run spends a few one-word turns of each plan.
//
// Exit 0: every scenario of every harness passed. 1: one failed. 2: one could
// not be checked (not installed, not signed in, out of usage).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripTypesFlags } from '../main/strip-types.mts';
import { resolveEngine } from '../main/engine-bin.mts';
import { FRESH_USER_ENV } from '../shared/fresh-user-home.mts';
import { ENGINES, HARNESSES_IN_TESTING_ENV } from '../shared/engines.mts';
import { HARNESS_DEFINITIONS } from '../shared/harness-definitions.mts';
import { harnessesToCheck, checkHarness, standingVerdict, verdictsWithoutARun, exitCode, summaryLines, cleanEnv } from './lib/harness-check.mts';
import type { App, Row, Standing, Verdict } from './lib/harness-check.mts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNT = 'harness-check';
const PRODUCT = 'sandbox';
const args = process.argv.slice(2);
const json = args.includes('--json');
const keep = args.includes('--keep');
const candidates = args.flatMap((arg, i) => (arg === '--candidate' && args[i + 1] ? [args[i + 1]] : []));
const named = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--candidate');
const say = (line: string) => (json ? process.stderr : process.stdout).write(`${line}\n`);

interface Snapshot {
  items?: (Row & { engine?: string | null })[];
  approvals?: { id: string; item: string | null }[];
  supervisor?: { running?: { itemId?: string }[]; outOfUsage?: Record<string, { until?: number } | undefined> };
  engines?: { choices?: { id: string }[]; workspace?: string; byItem?: Record<string, string> };
}

function layOut() {
  const instance = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-harness-check-'));
  const at = (...parts: string[]) => path.join(instance, ...parts);
  for (const dir of ['data', 'proof', 'repo', path.join('store', 'accounts', ACCOUNT, PRODUCT)]) fs.mkdirSync(at(dir), { recursive: true });
  fs.writeFileSync(at('repo', 'README.md'), '# Sandbox\n\nA throwaway project for checking harnesses.\n');
  const git = (...a: string[]) => execFileSync('git', a, { cwd: at('repo'), stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.email=check@agentbox.invalid', '-c', 'user.name=check', 'commit', '-qm', 'seed');
  fs.writeFileSync(at('store', 'accounts', ACCOUNT, PRODUCT, 'project.json'), `${JSON.stringify({
    schemaVersion: 2, id: PRODUCT, name: 'Sandbox', repoPath: at('repo'), oneLiner: 'a throwaway project for checking harnesses',
  }, null, 1)}\n`);
  return { instance, data: at('data'), proof: at('proof'), log: at('app.log'), storeRoot: at('store') };
}

/** The copy's settings, written over what the app added on its last start. */
function writeConfig(place: ReturnType<typeof layOut>) {
  const file = path.join(place.data, 'zero.config.json');
  let had = {};
  try { had = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first start */ }
  fs.writeFileSync(file, `${JSON.stringify({
    ...had, storeRoot: place.storeRoot, accountId: ACCOUNT,
    // Lets a thread name its harness, as a person who turned the choice on can.
    engineChoice: '2026-01-01T00:00:00.000Z',
    maxConcurrentSessions: 2,
    // The copy runs with the real home, so the default would send threads to the owner's cloud.
    cloudRuns: false,
  }, null, 2)}\n`);
}

interface Copy { pid: number; base: string; token: string }

async function startCopy(place: ReturnType<typeof layOut>): Promise<Copy> {
  writeConfig(place);
  const from = fs.existsSync(place.log) ? fs.statSync(place.log).size : 0;
  const fd = fs.openSync(place.log, 'a');
  const child = spawn(process.execPath, [...stripTypesFlags(), path.join(REPO, 'bin', 'agentbox.mjs'), '--dir', place.data, '--no-open'], {
    cwd: REPO, detached: true, stdio: ['ignore', fd, fd],
    env: { ...cleanEnv(), [FRESH_USER_ENV]: '1', AGENTBOX_NO_SYSTEM_WINDOWS: '1', ...(candidates.length ? { [HARNESSES_IN_TESTING_ENV]: candidates.join(',') } : {}) },
  });
  child.unref();
  fs.closeSync(fd);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const found = fs.readFileSync(place.log, 'utf8').slice(from).match(/(http:\/\/127\.0\.0\.1:\d+)\/\?token=(\S+)/);
    if (found) return { pid: child.pid!, base: found[1], token: found[2] };
    if (child.exitCode !== null) break;
  }
  stopCopy(child.pid!);
  throw Error(`the copy of the app never printed its address. Its log ends:\n${fs.readFileSync(place.log, 'utf8').slice(-2000)}`);
}

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Ask the copy to quit, which stops its agents, then make sure of the whole group. */
function stopCopy(pid: number) {
  try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
  const deadline = Date.now() + 8_000;
  while (alive(pid) && Date.now() < deadline) spawnSync('sleep', ['0.2']);
  try { process.kill(-pid, 'SIGKILL'); } catch { /* nothing left */ }
}

/** Anything still running out of the copy's folder after its group is gone, such as a command an agent left behind. */
function stopStrays(instance: string) {
  const found = spawnSync('pgrep', ['-f', instance], { encoding: 'utf8' });
  for (const pid of String(found.stdout ?? '').split('\n').map(Number).filter((n) => n > 1 && n !== process.pid)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* gone already */ }
  }
}

function appOver(place: ReturnType<typeof layOut>, first: Copy) {
  let copy = first;
  const call = async <T,>(channel: string, payload?: unknown): Promise<T> => {
    const res = await fetch(`${copy.base}/api/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agentbox-token': copy.token },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw Error(`${channel} answered ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : null) as T;
  };
  const snapshot = () => call<Snapshot>('zero:snapshot');
  const ready = new Map<string, Pick<Standing, 'found' | 'signedIn'>>();
  const app: App & { settle(): Promise<void>; standing(harness: string): Promise<Standing>; pid(): number } = {
    async start(harness, words) {
      const out = await call<{ id?: string } | null>('zero:compose', { product: PRODUCT, title: words, engine: harness });
      if (!out?.id) throw Error(`the app did not file the thread: ${JSON.stringify(out).slice(0, 200)}`);
      return out.id;
    },
    async reply(id, words, mode = null) { await call('zero:answer', { product: PRODUCT, id, answer: words, ...(mode ? { permissionMode: mode } : {}) }); },
    async stop(id) { await call('zero:stop-session', { product: PRODUCT, id }); },
    async decide(cardId, allow) { await call('zero:approve', { id: cardId, allow }); },
    async row(id) { return (await snapshot()).items?.find((item) => item.id === id) ?? null; },
    async running(id) { return ((await snapshot()).supervisor?.running ?? []).some((run) => run.itemId === id); },
    async card(id) { return (await snapshot()).approvals?.find((card) => card.item === id)?.id ?? null; },
    async harnessOf(id) {
      const { engines } = await snapshot();
      return engines?.byItem?.[id] ?? engines?.workspace ?? null;
    },
    // The app's own sign-in check, asked of every harness on offer and awaited:
    // which one a thread runs on depends on all the answers, and a launch only
    // starts the question.
    async settle() {
      for (const { id } of ENGINES) {
        const said = await call<{ ok?: boolean; found?: boolean; signedIn?: boolean; certain?: boolean }>('zero:engine-setup', { action: 'ready', engine: id });
        ready.set(id, { found: said?.found === true, signedIn: said?.ok && said.certain !== false && said.found ? said.signedIn === true : null });
      }
    },
    async standing(harness) {
      const { engines, supervisor } = await snapshot();
      const offered = (engines?.choices ?? []).some((choice) => choice.id === harness);
      return {
        // The app offers a candidate only when it found its binary, and its sign-in is asked by its first thread.
        ...(ready.get(harness) ?? { found: offered, signedIn: null }),
        offered,
        spentUntil: supervisor?.outOfUsage?.[harness]?.until ?? null,
      };
    },
    async restart() {
      stopCopy(copy.pid);
      copy = await startCopy(place);
    },
    proofPath: (name) => path.join(place.proof, name),
    wrote: (name) => fs.existsSync(path.join(place.proof, name)),
    pid: () => copy.pid,
  };
  return app;
}

/** The version of each harness, from the binary the app's own search finds. A label only: null when it will not say. */
function versionsFound(harnesses: readonly string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const id of harnesses) {
    out[id] = null;
    try {
      const bin = resolveEngine(id).path;
      if (!bin) continue;
      const said = execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 15_000, env: { ...cleanEnv(), DISABLE_AUTOUPDATER: '1' }, stdio: ['ignore', 'pipe', 'ignore'] });
      out[id] = said.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
    } catch { /* a harness the search does not know, or one that would not run */ }
  }
  return out;
}

async function main() {
  const harnesses = harnessesToCheck(named, candidates);
  if (!fs.existsSync(path.join(REPO, 'renderer', 'dist', 'index.html'))) {
    say('Building the screen once, which the copy of the app needs to start.');
    const built = spawnSync('npx', ['vite', 'build', 'renderer', '--logLevel', 'warn'], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'], timeout: 10 * 60_000 });
    if (built.status !== 0) throw Error('the screen did not build, so the copy of the app cannot start');
  }
  const place = layOut();
  const verdicts: Verdict[] = [];
  let app: ReturnType<typeof appOver> | null = null;
  let versions: Record<string, string | null> = {};
  let failedARun = false;
  try {
    app = appOver(place, await startCopy(place));
    versions = versionsFound(harnesses);
    await app.settle();
    for (const harness of harnesses) {
      const word = HARNESS_DEFINITIONS.find((h) => h.id === harness)?.label ?? harness;
      const known = standingVerdict(harness, await app.standing(harness));
      if (known) {
        verdicts.push(...verdictsWithoutARun(harness, known));
        say(`${word}: ${known.outcome === 'failed' ? 'FAILED' : 'not checked'}. ${known.said}`);
        continue;
      }
      say(`${word}${versions[harness] ? ` ${versions[harness]}` : ''}: checking`);
      const mine = await checkHarness(app, harness, {
        onVerdict: (v) => say(`  ${v.outcome === 'passed' ? 'passed' : v.outcome === 'failed' ? 'FAILED' : 'not checked'} ${v.scenario}${v.said ? `: ${v.said}` : ''}`),
      });
      verdicts.push(...mine);
      if (mine.some((v) => v.outcome === 'failed')) failedARun = true;
    }
  } finally {
    if (app) stopCopy(app.pid());
    stopStrays(place.instance);
  }
  const exit = exitCode(verdicts);
  say('');
  for (const line of summaryLines(verdicts, versions)) say(line);
  // Kept for reading when a thread that ran went wrong; a harness nothing was asked of left nothing to read.
  if (keep || failedARun) say(`\nThe copy's store and log are kept at ${place.instance}`);
  else fs.rmSync(place.instance, { recursive: true, force: true });
  if (json) process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), exit, versions, verdicts }, null, 1)}\n`);
  process.exit(exit);
}

main().catch((error) => {
  process.stderr.write(`check:harnesses could not run: ${(error as Error)?.message ?? error}\n`);
  process.exit(2);
});

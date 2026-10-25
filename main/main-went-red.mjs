// MAIN GOES RED ON GITHUB AND ONE TASK SAYS WHICH TESTS (w-3836800002).
//
// Main was red on GitHub from 2026-10-09 to 2026-10-13 and nobody noticed. The
// `tests` workflow takes about five minutes, which is after the agent that
// shipped has already ended its turn, and `scripts/ship.mjs` signs off by
// printing "check the run" to a terminal nobody is reading. So the one gate
// that runs the WHOLE suite on both machines had no reader at all.
//
// The app ships the branch (main/ship-queue.mjs), so the app is the thing still
// running when that cross appears. After every successful ship it waits for
// that commit's run and files ONE task when main turns red: which tests, which
// machine each failed on, and the commit that did it.
//
// NOTHING BLOCKS ON THIS. No ship waits for it, no agent is held, and every
// failure here is silent: a machine without `gh`, or signed out of it, or
// without access to the repository, does nothing at all. A watcher that
// interrupted shipping to report on shipping would be worse than the gap it
// closes.
//
// ONE BREAKAGE IS ONE ROW. While main stays red, further ships file nothing:
// a row per red commit would be a dozen rows about one mistake. The green
// again lands on that same row as a note, so the row that told them reads as
// finished where they are already looking.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** How often to ask GitHub, and how long before giving up on a run. */
export const POLL_MS = 60 * 1000;
export const GIVE_UP_MS = 30 * 60 * 1000;

const STATE = 'main-tests.json';
const WORKFLOW = 'tests';
const LOG_BYTES = 16 * 1024 * 1024;

/** `gh`, with its own words back and never a throw. */
export function runGh(args, { cwd, timeout = 60 * 1000 } = {}) {
  return new Promise((resolve) => {
    execFile('gh', args, { cwd, encoding: 'utf8', timeout, maxBuffer: LOG_BYTES }, (error, stdout, stderr) => {
      if (error) resolve({ code: error.code ?? 1, out: `${stdout ?? ''}${stderr ?? ''}${error.message ?? ''}` });
      else resolve({ code: 0, out: String(stdout ?? '') });
    });
  });
}

/**
 * The run for the commit that was just shipped, or null while GitHub has not
 * made one yet.
 *
 * `scripts/ship.mjs` reports the SHORT sha and GitHub answers with the full
 * forty, so either may be the prefix of the other.
 */
export function runFor(runs, sha) {
  const want = String(sha ?? '').trim().toLowerCase();
  if (!want) return null;
  return (runs ?? []).find((run) => {
    const head = String(run?.headSha ?? '').toLowerCase();
    return head && (head.startsWith(want) || want.startsWith(head));
  }) ?? null;
}

/**
 * What that run says: `waiting`, `passing`, `failing`, or `ignore`.
 *
 * `cancelled` is IGNORED because a second push to main cancels the first
 * (the `concurrency` block in .github/workflows/tests.yml), so a cancelled run
 * is not a verdict on anything; the newer push's own watch carries it.
 * `startup_failure` is ignored because it is a GitHub ACCOUNT problem rather
 * than a test: for three weeks every run here ended that way, and the answer
 * was a payment method, not a commit (the head of that workflow file says so).
 * A row per push during a spell like that is noise with no fix in it.
 */
export function verdict(run) {
  if (!run || run.status !== 'completed') return 'waiting';
  const how = String(run.conclusion ?? '');
  if (how === 'success') return 'passing';
  if (how === 'failure' || how === 'timed_out') return 'failing';
  return 'ignore';
}

/** Which machine a job ran on, by the label the workflow asked for. */
export function machineOf(job) {
  const labels = (job?.labels ?? []).join(' ').toLowerCase();
  const name = String(job?.name ?? '');
  if (/ubuntu|linux/.test(`${labels} ${name}`)) return 'Linux';
  if (/macos/.test(`${labels} ${name}`)) return 'macOS';
  if (/windows/.test(`${labels} ${name}`)) return 'Windows';
  return name || 'that machine';
}

const ANSI = /\u001b\[[0-9;]*m/g;
// A job log is one timestamped line per line of output, and GitHub's own
// lines carry a kind in front of them.
const STAMP = /^\S+Z\s/;
const GITHUB_SAYS = /^##\[[a-z]+\]/;
const clean = (raw) => String(raw).replace(ANSI, '').replace(STAMP, '').replace(GITHUB_SAYS, '').trim();
// Vitest's own `FAIL  tests/x.test.mjs > suite > case`, and ONLY at the start
// of the line. A LINE VITEST QUOTED IS NOT THE RUNNER SPEAKING: the ship queue
// learned that three times over (w-560647d4db). A failing text assertion
// prints the file's own source as a diff (`+`/`-`) and as a code frame
// (`34|  ...`), and this repo's test files are sentences, so plenty of them
// carry "failed" or "FAIL" inside a name. Anchoring at FAIL rules all of that
// out, and the tick vitest puts on a file it ran green rules out the rest.
const NAMES_A_RED_TEST = /^FAIL\s+(\S+?\.(?:test|spec)\.[a-z]+)(?:\s|$)/;

/** Every test file the runner printed a FAIL for, once each, in order. */
export function failedTestsIn(log) {
  const found = [];
  for (const raw of String(log ?? '').split('\n')) {
    const name = NAMES_A_RED_TEST.exec(clean(raw))?.[1];
    if (name && !found.includes(name)) found.push(name);
  }
  return found;
}

// VITEST EXITS 1 FOR THINGS THAT ARE NOT A FAILING TEST, and none of them
// print FAIL: an error thrown after a file's tests have passed, a collection
// that never started, a worker that died. The row used to stop at "names no
// failing test" with the log it had already fetched left unread.
//
// A banner is matched along with the rule vitest draws it in, because a line
// vitest QUOTED is not the runner speaking. The plural heading over the whole
// section is not one of these, and the three lines of advice are about
// unhandled errors in general rather than about this run.
const UNHANDLED = /^⎯+\s*Unhandled (?:Error|Rejection)\s*⎯*$/;
const NAMES_A_BREAKAGE = /^(?:No test files found|FATAL ERROR:)/;
const ADVICE = /^(?:Vitest caught|This might cause|Serialized Error)/;
const SAID_AT_MOST = 5;

/** What the runner itself said, for a row that can name no failing test. */
export function whatTheRunnerSaid(log) {
  const lines = String(log ?? '').split('\n').map(clean);
  const said = [];
  const keep = (line) => {
    if (line && !ADVICE.test(line) && !said.includes(line)) said.push(line);
  };
  lines.forEach((line, i) => {
    if (UNHANDLED.test(line)) keep(lines.slice(i + 1, i + 8).find((l) => l && !ADVICE.test(l)));
    else if (NAMES_A_BREAKAGE.test(line)) keep(line);
  });
  return said.slice(0, SAID_AT_MOST);
}

const shortSha = (sha) => String(sha ?? '').slice(0, 7);
const NOTHING_NAMED = 'nothing in its log names a failing test';
// A log `gh` could not hand over says nothing about the run, and a row that
// reported it as "names no failing test" would be making that up.
const NOT_READ = 'its log could not be read from here';
const unread = (machines) => machines.length > 0 && machines.every((m) => m.read === false);
/** The first thing any machine said, cut to something a title can hold. */
const firstWords = (machines, max) => {
  const said = machines.flatMap((m) => m.said ?? []).find(Boolean);
  if (!said) return '';
  return said.length > max ? `${said.slice(0, max - 1).trimEnd()}…` : said;
};

/** The row's title: the one test, or the count and the machines. */
export function redTitle(machines) {
  const names = [...new Set(machines.flatMap((m) => m.tests))];
  if (names.length === 1) return `main went red on GitHub: ${names[0]}`;
  if (!names.length) {
    const said = firstWords(machines, 58);
    if (said) return `main went red on GitHub: ${said}`;
    if (unread(machines)) return `main went red on GitHub, and ${NOT_READ}`;
    return 'main went red on GitHub, and its log names no failing test';
  }
  const where = machines.filter((m) => m.tests.length).map((m) => m.machine);
  return `main went red on GitHub: ${names.length} tests, on ${where.join(' and ')}`;
}

/** The row's Context: what a reader gets before they open anything. */
export function redContext({ sha, machines }) {
  const names = [...new Set(machines.flatMap((m) => m.tests))];
  const where = machines.filter((m) => m.tests.length).map((m) => m.machine);
  if (!names.length) {
    const said = firstWords(machines, 110);
    let how = NOTHING_NAMED;
    if (said) how = `no test failed and the runner said "${said}"`;
    else if (unread(machines)) how = NOT_READ;
    return `main's tests run went red on GitHub at ${shortSha(sha)}, and ${how}. The run itself is in the task.`;
  }
  return [
    `main's tests run went red on GitHub at ${shortSha(sha)}, on ${where.join(' and ')}.`,
    `${names.length === 1 ? 'The failing test' : `The ${names.length} failing tests`}: ${names.join(', ')}.`,
    'Which machine each failed on, and the run, are in the task.',
  ].join(' ');
}

/** The whole row: what failed, where, and the commit that did it. */
export function redRow({ sha, subject, url, machines }) {
  return {
    title: redTitle(machines),
    problem: redContext({ sha, machines }),
    body: [
      "main's `tests` run went red on GitHub, at this commit:",
      '',
      `    ${shortSha(sha)}  ${subject || 'no title'}`,
      '',
      ...machines.flatMap(({ machine, tests, said, read }) => [
        `${machine}:`,
        ...(tests.length ? tests.map((t) => `- ${t}`) : [
          `- ${read === false ? NOT_READ : NOTHING_NAMED}${said?.length ? ', and the runner said:' : ''}`,
          ...(said ?? []).map((line) => `  ${line}`),
        ]),
        '',
      ]),
      ...(url ? [`The whole run: ${url}`, ''] : []),
      'That run finishes about five minutes after the agent that shipped has',
      'already ended, so nobody is watching it: main was red here from',
      '2026-10-09 to 2026-10-13 and nothing said so. This is the only row filed',
      'while main stays red, and a note lands here when it goes green again.',
    ].join('\n'),
  };
}

/** What that row hears when main comes back. */
export function greenAgain({ sha, subject }) {
  return `main's tests are green again on GitHub, as of ${shortSha(sha)}${subject ? ` (${subject})` : ''}.`;
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });

/**
 * The watch itself: one per successful ship, and never anything a person waits
 * on.
 *
 * WHETHER MAIN IS KNOWN RED LIVES IN THE APP'S OWN DATA FOLDER, beside the
 * ship settings, because it is a fact about this Mac's watching rather than
 * about anyone's work. With no file, main counts as fine, so the FIRST red run
 * this ever sees files a row: requiring a green first would have kept it silent
 * through exactly the four days that put this here.
 */
export class MainTests {
  constructor({ store, userDir, gh = runGh, wait = sleep, now = Date.now, log = console } = {}) {
    Object.assign(this, { store, userDir, gh, wait, now, log });
    this.stopped = false;
  }

  stop() { this.stopped = true; }

  stateFile() { return path.join(this.userDir, STATE); }

  read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.stateFile(), 'utf8'));
      return raw && typeof raw === 'object' ? raw : {};
    } catch { return {}; }
  }

  write(state) {
    try {
      const tmp = `${this.stateFile()}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(state)}\n`);
      fs.renameSync(tmp, this.stateFile());
    } catch (e) { this.log.warn?.(`main-tests: could not record where main stands: ${e.message}`); }
  }

  /** gh's JSON, or null if this machine cannot ask. */
  async ask(args, cwd) {
    const { code, out } = await this.gh(args, { cwd });
    if (code !== 0) return null;
    try { return JSON.parse(out); } catch { return null; }
  }

  async watch({ product, sha } = {}) {
    const cwd = product?.repoPath;
    if (!cwd || !sha || !fs.existsSync(cwd)) return null;
    const until = this.now() + GIVE_UP_MS;
    while (!this.stopped) {
      const runs = await this.ask(
        ['run', 'list', '--branch', 'main', '--workflow', WORKFLOW, '-L', '20',
          '--json', 'databaseId,headSha,status,conclusion,displayTitle,url'],
        cwd,
      );
      // No gh, signed out, or no access to this repository: nothing, quietly.
      if (!runs) return null;
      const run = runFor(runs, sha);
      const says = verdict(run);
      if (says === 'ignore') return null;
      if (says === 'passing') return this.wentGreen(product, run);
      if (says === 'failing') return this.wentRed(product, run, cwd);
      if (this.now() >= until) {
        this.log.info?.(`main-tests: ${shortSha(sha)}'s run has not finished in half an hour; leaving it.`);
        return null;
      }
      await this.wait(POLL_MS);
    }
    return null;
  }

  /** One row, and only while main was not already known red. */
  async wentRed(product, run, cwd) {
    const state = this.read();
    if (state.red) return null;
    const jobs = (await this.ask(['api', `repos/{owner}/{repo}/actions/runs/${run.databaseId}/jobs`, '--paginate'], cwd))?.jobs ?? [];
    const machines = [];
    for (const job of jobs) {
      if (String(job?.conclusion ?? '') !== 'failure') continue;
      const { code, out } = await this.gh(['api', `repos/{owner}/{repo}/actions/jobs/${job.id}/logs`], { cwd });
      const read = code === 0;
      const tests = read ? failedTestsIn(out) : [];
      machines.push({ machine: machineOf(job), tests, read, said: read && !tests.length ? whatTheRunnerSaid(out) : [] });
    }
    const row = redRow({ sha: run.headSha, subject: run.displayTitle, url: run.url, machines });
    let filed = null;
    try {
      filed = this.store.fileItem(product.slug, { ...row, kind: 'task' });
    } catch (e) {
      this.log.warn?.(`main-tests: could not file the red main: ${e.message}`);
      return null;
    }
    this.write({ ...state, red: { product: product.slug, id: filed.id, sha: run.headSha } });
    this.log.info?.(`main-tests: main went red at ${shortSha(run.headSha)}; filed ${filed.id}.`);
    return filed;
  }

  /** The green again, on the row that reported the red. */
  wentGreen(product, run) {
    const state = this.read();
    if (!state.red) return null;
    try {
      this.store.noteItem(state.red.product, state.red.id, greenAgain({ sha: run.headSha, subject: run.displayTitle }));
    } catch (e) {
      this.log.warn?.(`main-tests: could not say main is green again: ${e.message}`);
    }
    this.write({ ...state, red: null });
    return null;
  }
}

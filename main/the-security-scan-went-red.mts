// THE SECURITY SCAN WENT RED ON MAIN, AND ONE ROW IN NEEDS YOU SAYS SO.
//
// The `security` workflow's sibling of main/main-went-red.mts, borrowing its
// `gh` and its verdict. Unlike a red `tests` run, this row is a proposal, not a
// fix that starts on its own: the way to green includes judging a finding
// harmless, and that call is the person's. One red spell is one row; the green
// again is a note on it. Every failure here is quiet, as there.

import fs from 'node:fs';
import path from 'node:path';
import {
  GIVE_UP_MS, POLL_MS, runFor, runGh, verdict,
  type GhJob, type GhResult, type GhRun, type MainTestsProduct, type MainTestsStore,
} from './main-went-red.mts';

const STATE = 'main-security.json';
const WORKFLOW = 'security';
const RUNBOOK = 'docs/security-checks.md';

interface SecurityState { red?: { product: string; id: string; sha?: string } | null }

const shortSha = (sha: unknown) => String(sha ?? '').slice(0, 7);

/** The row for a red security run: which checks failed, at which commit, and where the steps are. */
export function securityRow({ sha, subject, url, failed }: { sha: unknown; subject?: string | null; url?: string | null; failed: string[] }) {
  const which = failed.length ? failed.join(' and ') : 'a check';
  return {
    title: `The security scan went red on main: ${which}`,
    problem: `main's security scan on GitHub failed at ${shortSha(sha)} (${which}). It may be a new risky pattern in the code or a new hole in a package. Nothing is fixed until someone reads it.`,
    body: [
      "main's `security` run went red on GitHub, at this commit:",
      '',
      `    ${shortSha(sha)}  ${subject || 'no title'}`,
      '',
      'The checks that failed:',
      ...(failed.length ? failed.map((name) => `- ${name}`) : ['- its jobs could not be read from here']),
      '',
      ...(url ? [`The whole run: ${url}`, ''] : []),
      `Read why and fix it the way step 1 of the daily review in ${RUNBOOK} says:`,
      'a finding judged harmless gets a `nosemgrep` with the reason, an advisory',
      'with no fix yet is listed in scripts/audit-packages.mjs with why it reaches',
      'nobody, and no rule is dropped to get green. A note lands here when the',
      'scan is green again.',
    ].join('\n'),
  };
}

export interface SecurityScanOptions {
  store?: MainTestsStore;
  userDir?: string;
  gh?: (args: string[], options?: { cwd?: string }) => Promise<GhResult>;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: { warn?: (line: string) => void; info?: (line: string) => void };
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms).unref?.(); });

export class SecurityScan {
  declare store: MainTestsStore;
  declare userDir: string;
  declare gh: NonNullable<SecurityScanOptions['gh']>;
  declare wait: NonNullable<SecurityScanOptions['wait']>;
  declare now: () => number;
  declare log: NonNullable<SecurityScanOptions['log']>;
  declare stopped: boolean;

  constructor({ store, userDir, gh = runGh, wait = sleep, now = Date.now, log = console }: SecurityScanOptions = {}) {
    Object.assign(this, { store, userDir, gh, wait, now, log });
    this.stopped = false;
  }

  stop() { this.stopped = true; }

  stateFile() { return path.join(this.userDir, STATE); }

  read(): SecurityState {
    try {
      const raw = JSON.parse(fs.readFileSync(this.stateFile(), 'utf8')) as SecurityState | null;
      return raw && typeof raw === 'object' ? raw : {};
    } catch { return {}; }
  }

  write(state: SecurityState) {
    try {
      const tmp = `${this.stateFile()}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(state)}\n`);
      fs.renameSync(tmp, this.stateFile());
    } catch (e) { this.log.warn?.(`main-security: could not record where the scan stands: ${(e as Error).message}`); }
  }

  async ask<T = unknown>(args: string[], cwd?: string): Promise<T | null> {
    const { code, out } = await this.gh(args, { cwd });
    if (code !== 0) return null;
    try { return JSON.parse(out) as T; } catch { return null; }
  }

  async watch({ product, sha }: { product?: MainTestsProduct; sha?: string } = {}) {
    const cwd = product?.repoPath;
    if (!cwd || !sha || !fs.existsSync(cwd)) return null;
    const until = this.now() + GIVE_UP_MS;
    while (!this.stopped) {
      const runs = await this.ask<GhRun[]>(
        ['run', 'list', '--branch', 'main', '--workflow', WORKFLOW, '-L', '20',
          '--json', 'databaseId,headSha,status,conclusion,displayTitle,url'],
        cwd,
      );
      if (!runs) return null;
      const run = runFor(runs, sha);
      const says = verdict(run);
      if (says === 'ignore') return null;
      if (says === 'passing') return this.wentGreen(product!, run!);
      if (says === 'failing') return this.wentRed(product!, run!, cwd);
      if (this.now() >= until) {
        this.log.info?.(`main-security: ${shortSha(sha)}'s scan has not finished in half an hour; leaving it.`);
        return null;
      }
      await this.wait(POLL_MS);
    }
    return null;
  }

  async wentRed(product: MainTestsProduct, run: GhRun, cwd: string) {
    const state = this.read();
    if (state.red) {
      this.write({ ...state, red: { ...state.red, sha: run.headSha } });
      return null;
    }
    const jobs = (await this.ask<{ jobs?: GhJob[] }>(['api', `repos/{owner}/{repo}/actions/runs/${run.databaseId}/jobs`], cwd))?.jobs ?? [];
    const failed = jobs.filter((job) => ['failure', 'timed_out'].includes(String(job?.conclusion ?? ''))).map((job) => String(job.name ?? job.id));
    const row = { ...securityRow({ sha: run.headSha, subject: run.displayTitle, url: run.url, failed }), kind: 'task' };
    let filed: { id: string };
    try {
      filed = this.store.fileItem(product.slug, row);
    } catch (e) {
      this.log.warn?.(`main-security: could not file the red scan: ${(e as Error).message}`);
      return null;
    }
    this.write({ ...state, red: { product: product.slug, id: filed.id, sha: run.headSha } });
    this.log.info?.(`main-security: the scan went red at ${shortSha(run.headSha)}; filed ${filed.id}.`);
    return filed;
  }

  wentGreen(_product: MainTestsProduct, run: GhRun) {
    const state = this.read();
    if (!state.red) return null;
    try {
      this.store.noteItem(state.red.product, state.red.id, `The security scan is green again on main, as of ${shortSha(run.headSha)}${run.displayTitle ? ` (${run.displayTitle})` : ''}.`);
    } catch (e) {
      this.log.warn?.(`main-security: could not say the scan is green again: ${(e as Error).message}`);
    }
    this.write({ ...state, red: null });
    return null;
  }
}

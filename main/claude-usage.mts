// Cached provider usage, read through Claude Code without starting a model turn.
// Snapshots never wait; only an explicit refresh waits for the CLI's answer.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readUsageReport } from '../shared/claude-usage.mts';
import { localZone, USAGE_UNREADABLE } from '../shared/usage.mts';
import { runClaudeUsage } from './claude-usage-process.mts';
import type { UsageRunner } from './claude-usage-process.mts';
import type { UsageLimit } from '../shared/usage.mts';
import { NO_METERED_KEY } from './harnesses/claude.mts';
import { CERTIFICATES, LOCALE, PROXIES } from './shell-path.mjs';

// WHAT A USAGE CHECK MAY INHERIT, BY NAME. Claude Code picks its login from
// more than CLAUDE_CONFIG_DIR (CLAUDE_SECURESTORAGE_CONFIG_DIR outranks it, set
// or empty), so a clear-list lets through whichever one nobody has named yet.
// USER is the keychain entry's account; the rest find programs, the network
// and the language.
const USAGE_KEEPS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', ...LOCALE, ...PROXIES, ...CERTIFICATES];

export function usageEnv(input: Record<string, string | undefined> | null | undefined, profile: string) {
  const env: Record<string, string> = {};
  for (const key of USAGE_KEEPS) if (typeof input?.[key] === 'string') env[key] = input[key];
  if (profile !== 'default') env.CLAUDE_CONFIG_DIR = profile;
  return env;
}

export const USAGE_WHOSE_UNKNOWN = 'Could not tell which account to read. Refresh to try again.';

// WHERE THE READING RUNS, AND WHY IT IS NOT "WHEREVER THE APP IS". An app
// opened from Finder has `/` as its working directory, and this used to spawn
// Claude Code without saying one, so it inherited that. Claude Code then did
// what it does in any project folder it is started in: it indexed the folder,
// which was the whole disk. Measured on her Mac the first time she opened the
// downloaded 0.1.3: a Claude Code transcript with `cwd: "/"` started at
// 18:07:31, and TCC recorded "the app" asking for files on a network volume at
// 18:07:41 and for her Apple Music library at 18:07:45. Those are `/Volumes/*`
// and `~/Music` being listed, ten seconds into a session whose only job was to
// print her usage.
//
// So the reading runs inside a folder of its own that holds nothing, under the
// temp directory, which macOS guards with no permission panel at all. Claude
// Code indexes an empty folder and asks for nothing. The same rule is already
// what `main/agents.mts` does for `claude agents --json`.
export function usageCwd() {
  const dir = path.join(os.tmpdir(), 'agentbox-usage');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* the fallback below still keeps it off the disk root */ }
  return fs.existsSync(dir) ? dir : os.tmpdir();
}

// How old a reading may be before the next look at it starts a refresh. Five
// minutes against a five hour limit is about a percent of it, which is finer
// than the number itself is reported to.
export const STALE_MS = 5 * 60_000;

const TIMEOUT_MS = 30_000;

// After a failure, how long before it is worth trying again. A machine that is
// signed out, rate limited, or has no Claude Code at all would otherwise be
// asked every five minutes forever.
const AFTER_A_MISS_MS = 30 * 60_000;

export interface UsageReading { limits: UsageLimit[]; at: number; profile: string }

export interface UsageResult { ok: boolean; error?: string; reading?: UsageReading | null }

export interface UsageAccount { profile: string; env?: NodeJS.ProcessEnv }

export interface ClaudeUsageOptions {
  bin?: () => string | null;
  onChange?: () => void;
  run?: UsageRunner;
  now?: () => number;
  where?: () => string;
  account?: () => UsageAccount | null;
}

export class ClaudeUsage {
  declare _bin: (() => string | null) | undefined;
  declare _selectedProfile: string | null;
  declare _generation: number;
  declare _pending: Promise<UsageResult> | null;
  declare _pendingGeneration: number | null | undefined;
  declare _onChange: () => void;
  declare _run: UsageRunner;
  declare _now: () => number;
  declare _where: () => string;
  declare _account: () => UsageAccount | null;
  declare _last: { limits: UsageLimit[], at: number, zone: string|null, profile: string }|null;
  declare _busy: boolean;
  declare _missedUntil: number;

  /**
   * @param how @param how.bin Where Claude Code
   * is, asked each time rather than captured: it can be installed while the
   * app is running, and the settings screen already promises that works.
   * @param [how.onChange] Told when a new reading lands, so the
   * window redraws, including a new checked time on unchanged percentages.
   * @param [how.account] WHOSE LIMIT
   * IS READ, asked each time. It used to be nobody's in particular: the
   * command ran with the app's own environment, which is the default login,
   * so a Mac with a second account picked as In use showed "No usage reading
   * yet" for good, because the default one was at its limit and Claude Code
   * printed no limits for it (2026-10-08, Claude Code 2.1.293). `profile` is
   * the account's name ('default' or its CLAUDE_CONFIG_DIR) and `env` is the
   * environment to run it in. Supervisor.usageAccount is the real one.
   */
  constructor({ bin, onChange = () => {}, run = runClaudeUsage, now = () => Date.now(), where = usageCwd, account = () => ({ profile: 'default' }) }: ClaudeUsageOptions = {}) {
    this._bin = bin;
    this._selectedProfile = null;
    this._generation = 0;
    this._pending = null;
    this._onChange = onChange;
    this._run = run;
    this._now = now;
    this._where = where;
    this._account = account;
    this._last = null;
    this._busy = false;
    this._missedUntil = 0;
  }

  // Null when the account cannot be named. That is never read as the default
  // login: a reading of the default under another account's name is the one
  // answer worse than none.
  _who() {
    try { return this._account() ?? null; } catch { return null; }
  }

  /**
   * THE LAST READING, INSTANTLY, and a refresh started if it has gone stale.
   *
   * Null until the first one lands, which is the honest answer for the first few
   * seconds of a launch: nothing is known yet, so the corner draws nothing rather
   * than a pill full of dashes.
   */
  read() {
    this._syncProfile();
    this._maybeRefresh();
    return this.peek();
  }

  // The secondary subscription can show its last reading without starting
  // another coding process merely to populate the sidebar.
  peek(): UsageReading | null {
    this._syncProfile();
    return this._last ? { limits: this._last.limits, at: this._last.at, profile: this._last.profile } : null;
  }

  /** Drop the last reading, so nothing serves it again. */
  forget() {
    this._last = null;
  }

  _syncProfile() {
    const who = this._who();
    const account = who ? who.profile || 'default' : null;
    if (account !== this._selectedProfile) {
      this._selectedProfile = account;
      this._generation++;
      this._last = null;
      this._missedUntil = 0;
    }
    return account;
  }

  _maybeRefresh() {
    const now = this._now();
    if (this._busy || now < this._missedUntil || this._selectedProfile === null) return;
    if (this._last && now - this._last.at < STALE_MS) return;
    this._refresh();
  }

  /** Ask again now, whatever the cache says. The settings screen's own button. */
  async refreshNow(): Promise<UsageResult> {
    if (this._syncProfile() === null) return { ok: false, error: USAGE_WHOSE_UNKNOWN };
    this._missedUntil = 0;
    // Join an existing reading, including one begun by the background poll.
    // If it belongs to the previous login, wait for it and then ask this one.
    const generation = this._generation;
    const pendingGeneration = this._pendingGeneration;
    const result = await (this._pending ?? this._refresh());
    this._syncProfile();
    if (generation !== this._generation) return { ok: false, error: 'The account changed. Refresh usage again.' };
    if (pendingGeneration != null && pendingGeneration !== generation) return this.refreshNow();
    return result;
  }

  _refresh() {
    const profile = this._syncProfile();
    const generation = this._generation;
    const bin = (() => { try { return this._bin?.(); } catch { return null; } })();
    const failure = (error: string = USAGE_UNREADABLE) => ({ ok: false, error });
    if (profile === null) return Promise.resolve(failure(USAGE_WHOSE_UNKNOWN));
    if (!bin) { this._missed(); return Promise.resolve(failure()); }
    this._busy = true;
    this._pendingGeneration = generation;
    let resolve: (value: UsageResult) => void;
    const pending = new Promise<UsageResult>(done => { resolve = done; });
    this._pending = pending;
    const finish = (err: Error | null, stdout?: string) => {
      this._busy = false;
      this._pending = null;
      this._pendingGeneration = null;
      this._syncProfile();
      if (generation !== this._generation) { resolve(failure()); this._onChange(); return; }
      // Failed or unreadable output cannot acquire a fresh checked time.
      const limits = err ? [] : readUsageReport(stdout, this._now());
      if (!limits.length) {
        this._missed();
        const unsupported = /get_usage.*(?:not supported|unknown)|unknown.*get_usage/i.test(err?.message ?? '');
        resolve(failure(unsupported ? 'Update Claude Code to read usage for this account.' : USAGE_UNREADABLE));
        return;
      }
      this._last = { limits, at: this._now(), zone: localZone(), profile };
      resolve({ ok: true, reading: this.peek() });
      // Even unchanged percentages now have a newly checked time to draw.
      this._onChange();
    };
    const env = usageEnv(this._who()?.env ?? process.env, profile);
    try { this._run(
      bin,
      ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
        '--no-session-persistence', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', '',
        '--settings', JSON.stringify({ ...NO_METERED_KEY, disableAllHooks: true })],
      // `cwd` is the whole fix for the permission panels; see usageCwd above.
      { cwd: this._where(), env, timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      finish,
    ); } catch (err) { finish(err as Error, ''); }
    return pending;
  }

  _missed() {
    this._missedUntil = this._now() + AFTER_A_MISS_MS;
  }
}

// Cached provider usage, read through Claude Code without starting a model turn.
// Snapshots never wait; only an explicit refresh waits for the CLI's answer.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readUsageReport } from '../shared/claude-usage.mjs';
import { localZone, USAGE_UNREADABLE } from '../shared/usage.mjs';
import { runClaudeUsage } from './claude-usage-process.mjs';
import { NO_METERED_KEY } from './harnesses/claude.mjs';

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
// what `main/agents.mjs` does for `claude agents --json`.
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

export class ClaudeUsage {
  /**
   * @param {object} how @param { => string|null} how.bin Where Claude Code
   * is, asked each time rather than captured: it can be installed while the
   * app is running, and the settings screen already promises that works.
   * @param { => void} [how.onChange] Told when a new reading lands, so the
   * window redraws, including a new checked time on unchanged percentages.
   * @param { => { profile: string, env?: object }} [how.account] WHOSE LIMIT
   * IS READ, asked each time. It used to be nobody's in particular: the
   * command ran with the app's own environment, which is the default login,
   * so a Mac with a second account picked as In use showed "No usage reading
   * yet" for good, because the default one was at its limit and Claude Code
   * printed no limits for it (2026-10-08, Claude Code 2.1.293). `profile` is
   * the account's name ('default' or its CLAUDE_CONFIG_DIR) and `env` is the
   * environment to run it in. Supervisor.usageAccount is the real one.
   */
  constructor({ bin, onChange = () => {}, run = runClaudeUsage, now = () => Date.now(), where = usageCwd, account = () => ({ profile: 'default' }) } = {}) {
    this._bin = bin;
    this._selectedProfile = null;
    this._generation = 0;
    this._pending = null;
    this._onChange = onChange;
    this._run = run;
    this._now = now;
    this._where = where;
    this._account = account;
    /** @type {{ limits: any[], at: number, zone: string|null, profile: string }|null} */
    this._last = null;
    this._busy = false;
    this._missedUntil = 0;
  }

  _who() {
    try { return this._account() ?? { profile: 'default' }; } catch { return { profile: 'default' }; }
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
  peek() {
    this._syncProfile();
    return this._last ? { limits: this._last.limits, at: this._last.at, profile: this._last.profile } : null;
  }

  _syncProfile() {
    const account = this._who().profile || 'default';
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
    if (this._busy || now < this._missedUntil) return;
    if (this._last && now - this._last.at < STALE_MS) return;
    this._refresh();
  }

  /** Ask again now, whatever the cache says. The settings screen's own button. */
  async refreshNow() {
    this._syncProfile();
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
    const bin = (() => { try { return this._bin(); } catch { return null; } })();
    const failure = (error = USAGE_UNREADABLE) => ({ ok: false, error });
    if (!bin) { this._missed(); return Promise.resolve(failure()); }
    this._busy = true;
    this._pendingGeneration = generation;
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    this._pending = pending;
    const finish = (err, stdout) => {
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
    const env = { ...(this._who().env ?? process.env) };
    for (const key of Object.keys(env)) {
      if (/^ANTHROPIC_|^CLAUDE_CODE_/.test(key) || ['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CONFIG_DIR'].includes(key)) delete env[key];
    }
    if (profile !== 'default') env.CLAUDE_CONFIG_DIR = profile;
    try { this._run(
      bin,
      ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
        '--no-session-persistence', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', '',
        '--settings', JSON.stringify({ ...NO_METERED_KEY, disableAllHooks: true })],
      // `cwd` is the whole fix for the permission panels; see usageCwd above.
      { cwd: this._where(), env, timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      finish,
    ); } catch (err) { finish(err, ''); }
    return pending;
  }

  _missed() {
    this._missedUntil = this._now() + AFTER_A_MISS_MS;
  }
}

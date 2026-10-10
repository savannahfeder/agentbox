// RUNNING `/usage`, WHICH TAKES TWENTY-FIVE SECONDS AND MUST NEVER BE WAITED ON.
//
// The pure half is shared/claude-usage.mjs: the text in, the limits out, the
// words the pill prints. This is the half that shells out, and everything about
// its shape comes from one measurement.
//
// TIMED TWICE ON HER MAC, 2026-08-31: 23.2s and 28.0s for `claude -p '/usage'`.
// The percentage did not move between the two, which is the other half of the
// answer: this is not a number that changes second to second, so nothing is lost
// by reading it every few minutes and everything is lost by reading it on a
// timer the window waits for.
//
// SO IT IS A CACHE WITH A BACKGROUND REFRESH, and never a call anything awaits:
//
//   - `read` answers instantly, always, from the last measurement or with null.
//     It never blocks and never throws.
//   - A refresh is kicked off when the cached figure is older than STALE_MS,
//     and only ever one at a time.
//   - The window is told when a new one lands, the same way everything else in
//     this app tells it: a push.
//
// WHY NOT A SESSION. Agentbox spawns real workers through the supervisor and could
// have asked one of them. It must not: a worker is a unit of her work, it lands
// in her inbox and burns a slot in the fleet, and this is a status reading. It
// gets its own short-lived child process with no store, no brief and no row.
//
// WHAT IS NOT SENT ANYWHERE. The output carries her usage figures and nothing
// else leaves this machine because of it; `main/analytics.mjs` is the only file
// that sends, and none of its eight counts is fed from here.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readUsage } from '../shared/claude-usage.mjs';
import { localZone } from '../shared/usage.mjs';

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

// Long enough for the slowest run measured plus most of the same again. Past
// this the reading is not late, it is not coming.
const TIMEOUT_MS = 90_000;

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
   * window redraws. Never called for a refresh that changed nothing.
   * @param { => { profile: string, env?: object }} [how.account] WHOSE LIMIT
   * IS READ, asked each time. It used to be nobody's in particular: the
   * command ran with the app's own environment, which is the default login,
   * so a Mac with a second account picked as In use showed "No usage reading
   * yet" for good, because the default one was at its limit and Claude Code
   * printed no limits for it (2026-10-08, Claude Code 2.1.293). `profile` is
   * the account's name ('default' or its CLAUDE_CONFIG_DIR) and `env` is the
   * environment to run it in. Supervisor.usageAccount is the real one.
   */
  constructor({ bin, onChange = () => {}, run = execFile, now = () => Date.now(), where = usageCwd, account = () => ({ profile: 'default' }) } = {}) {
    this._bin = bin;
    this._onChange = onChange;
    this._run = run;
    this._now = now;
    this._where = where;
    this._account = account;
    /** @type {{ limits: any[], at: number, zone: string|null, profile: string }|null} */
    this._last = null;
    this._busy = false;
    this._missedUntil = 0;
    this._missedFor = null;
  }

  _who() {
    try { return this._account() ?? { profile: 'default' }; } catch { return { profile: 'default' }; }
  }

  // ONE ACCOUNT'S FIGURE IS NEVER SHOWN AS ANOTHER'S. After she switches, the
  // old reading is still fresh by the clock, and drawing it under the new
  // account's name would be the page telling her something untrue. Nothing is
  // drawn until the new account's own reading lands.
  _mine() {
    return this._last && this._last.profile === this._who().profile ? this._last : null;
  }

  /**
   * THE LAST READING, INSTANTLY, and a refresh started if it has gone stale.
   *
   * Null until the first one lands, which is the honest answer for the first few
   * seconds of a launch: nothing is known yet, so the corner draws nothing rather
   * than a pill full of dashes.
   */
  read() {
    this._maybeRefresh();
    const last = this._mine();
    return last ? { limits: last.limits, at: last.at } : null;
  }

  // The secondary subscription can show its last reading without starting
  // another coding process merely to populate the sidebar.
  peek() {
    const last = this._mine();
    return last ? { limits: last.limits, at: last.at } : null;
  }

  _maybeRefresh() {
    const now = this._now();
    const { profile } = this._who();
    if (this._busy) return;
    // A miss holds off THAT account only: a signed-out or limited login says
    // nothing about the one she has just switched to.
    if (now < this._missedUntil && this._missedFor === profile) return;
    const last = this._mine();
    if (last && now - last.at < STALE_MS) return;
    this._refresh();
  }

  /** Ask again now, whatever the cache says. The settings screen's own button. */
  refreshNow() {
    this._missedUntil = 0;
    if (!this._busy) this._refresh();
  }

  _refresh() {
    const bin = (() => { try { return this._bin(); } catch { return null; } })();
    const { profile, env } = this._who();
    if (!bin) { this._missed(profile); return; }
    this._busy = true;
    this._run(
      bin,
      ['-p', '/usage', '--output-format', 'text'],
      // `cwd` is the whole fix for the permission panels; see usageCwd above.
      // `env` names the login, by its CLAUDE_CONFIG_DIR or by the lack of one.
      { cwd: this._where(), timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', ...(env ? { env } : {}) },
      (err, stdout) => {
        this._busy = false;
        // A COMMAND THAT FAILED LEAVES THE OLD READING ALONE. It is stale rather
        // than wrong, and a corner that empties itself every time the network
        // hiccups is worse than one that is five minutes behind.
        if (err && !stdout) { this._missed(profile); return; }
        const limits = readUsage(stdout, this._now(), localZone());
        if (!limits.length) { this._missed(profile); return; }
        const before = JSON.stringify(this._last ? [this._last.profile, this._last.limits] : null);
        this._last = { limits, at: this._now(), zone: localZone(), profile };
        if (JSON.stringify([profile, limits]) !== before) this._onChange();
      },
    );
  }

  _missed(profile) {
    this._missedUntil = this._now() + AFTER_A_MISS_MS;
    this._missedFor = profile;
  }
}

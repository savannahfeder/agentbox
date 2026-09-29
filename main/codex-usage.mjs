// WHAT CODEX HAS ALREADY SAID IS LEFT, AND NOTHING IS SPENT ASKING.
//
// The pure half is shared/codex-usage.mjs: the payload in, the limits out. This
// is the half that holds what a running app-server reported, and the whole of
// its shape is two rules.
//
// NEVER SPAWN ANYTHING TO DRAW A PICTURE. main/claude-usage.mjs is built around
// the opposite fact -- `claude -p /usage` costs a child process and twenty-five
// seconds, so it is a cache with a background refresh and a thirty-minute
// backoff after a miss. None of that applies here and none of it is copied.
// Codex's figures ride the `codex app-server` THE FLEET IS ALREADY RUNNING:
// they arrive unprompted as `account/rateLimits/updated` during a turn.
//
// AND NEVER ASK FOR ONE EITHER. This reader briefly
// also sent an explicit rate-limits read down that pipe whenever its figure
// went stale. It is deliberately gone, and this paragraph is here so the next
// reader does not put it back as an obvious improvement.
//
//   IT IS NOT A LOCAL LOOKUP. Measured on this Mac 2026-09-05 against a real
//   `codex app-server` 0.148.0 in a scratch CODEX_HOME with no credentials, that
//   read answered `{"error":{"code":-32600,"message":"codex account
//   authentication required to read rate limits"}}` -- an auth demand, not an
//   empty snapshot. A call served out of state the app-server already holds does
//   not need an account token; one that has to SEND that token does. The binary
//   agrees: `app-server/src/request_processors/account_processor.rs` reaches
//   `backend-client/src/client/rate_limit_resets.rs`, and the strings beside it
//   are `/api/codex/usage`, `https://chatgpt.com/backend-api`, `failed to fetch
//   codex rate limits: no snapshots returned` and `rate limit reset credit
//   detail request timed out`. Local state does not time out, and has no
//   snapshots to fail to return.
//
//   SO IT IS A NEW NETWORK CALL, and CLAUDE.md's rule on those is not
//   negotiable: "Anything that leaves the machine... a new network call of any
//   kind" means `legal/privacy.html` and `legal/terms.html` are edited IN THE
//   SAME SESSION. Those pages live in the founder's store rather than in this
//   repo, so that obligation cannot be discharged from a session working here,
//   and shipping the call without it would break a stated law rather than bend
//   one.
//
//   THE COST OF LIVING WITHOUT IT WAS MEASURED AND IS SMALL. The push is free
//   and already arrives, so the corner fills a beat later -- once a Codex turn
//   starts pushing -- rather than being asked for. And a workspace set to Codex
//   with nothing running drew no corner either way, because there was no
//   app-server there to ask.
//
// SO THERE IS NO READING AT ALL UNTIL A TURN REPORTS ONE, AND THAT IS A NORMAL
// TUESDAY rather than a failure. On a Mac where no Codex work has run the corner
// draws nothing, and nothing was spent finding that out. That is the honest
// answer and the one the dashboard law asks for: a limit nobody has read is not
// a limit at nothing, and it may never be drawn as a zero.
//
// A READING OUTLIVES THE PROCESS THAT GAVE IT, deliberately. The app-server
// goes down with the last worker; the figures it reported are still the last
// true thing anybody knows, and the panel already says how old they are.
//
// AND A READING BELONGS TO THE LOGIN THAT GAVE IT. There is one app-server per
// CODEX_HOME since a second Codex login became real (`_codexServer` in
// main/supervisor.mjs), and CODEX_HOME is the variable that names which account
// pays. A reading taken under one home is not a fact about another, so it is
// dropped rather than redrawn when the home moves. Showing login A's percentage
// over login B's work is exactly the defect this whole slice is fixing, one
// level down.

import { codexLimits, mergeRateLimits } from '../shared/codex-usage.mjs';
import { loggedCodexLimits } from './codex-usage-file.mjs';

export class CodexUsage {
  /**
   * @param {object} how @param { => string|null} how.home Which CODEX_HOME the
   * current login is, so a reading taken under another one is dropped rather
   * than redrawn. @param { => void} [how.onChange] Told when the figures move,
   * so the window redraws. Never called for an update that changed nothing.
   */
  constructor({ home = () => null, onChange = () => {}, now = () => Date.now(), readLog = loggedCodexLimits } = {}) {
    this._home = home;
    this._onChange = onChange;
    this._now = now;
    /** Handed in so a test can answer without a session log on disk. */
    this._readLog = readLog;
    /** @type {{ primary: object|null, secondary: object|null }|null} */
    this._snapshot = null;
    this._at = 0;
    this._takenUnder = null;
  }

  /**
   * THE LAST THING CODEX REPORTED, INSTANTLY AND WITHOUT ASKING ANYBODY.
   *
   * Null until the first push lands, which on most Macs is for ever, because
   * most Macs never run a Codex worker. The corner draws nothing then rather
   * than a bar full of zeroes: a limit nobody has read is not a limit at
   * nothing.
   */
  read() {
    if (this._takenUnder !== null && this._takenUnder !== this._home()) this._forget();
    const limits = codexLimits(this._snapshot);
    if (limits.length) return { limits, at: this._at };
    // NOTHING HAS PUSHED, SO ASK WHAT CODEX ALREADY WROTE DOWN. This is the
    // whole of: the push only ever arrives for work the app itself ran, and she
    // runs Codex in its own app, so on her Mac the panel stayed empty while her
    // weekly limit was full. main/codex-usage-file.mjs is a read of a file
    // under this same CODEX_HOME. It starts no process and sends nothing
    // anywhere, so neither rule above is bent.
    return this._logged();
  }

  /**
   * The last figure in Codex's own session log under this home, shaped exactly
   *  like a pushed one. Null on a Mac where Codex has never run. */
  _logged() {
    const reading = this._readLog(this._home(), { now: this._now() });
    const limits = codexLimits(reading?.snapshot);
    return limits.length ? { limits, at: reading.at } : null;
  }

  /**
   * A NOTIFICATION OFF THE APP-SERVER'S LOOSE CHANNEL, AND THE ONLY WAY A FIGURE
   * EVER GETS IN HERE. Everything that belongs to no thread arrives on it
   * (main/codex-app-server.mjs `onNotification`), so this is handed every one of
   * them and keeps the one it is about.
   *
   * IT MERGES. The update is documented sparse -- see shared/codex-usage.mjs for
   * the schema's own wording -- so a notification carrying only the five hour
   * window must not take the week away with it.
   */
  saw(method, params, home = this._home()) {
    if (method !== 'account/rateLimits/updated') return false;
    // A login that is not the one the corner is about has nothing to say about
    // it. There is one app-server per home and they all report through here.
    if (home !== this._home()) return false;
    return this._keep(mergeRateLimits(this._snapshot, params?.rateLimits), home);
  }

  _keep(snapshot, home) {
    const before = JSON.stringify(this._snapshot);
    this._snapshot = snapshot;
    this._at = this._now();
    this._takenUnder = home;
    if (JSON.stringify(snapshot) === before) return false;
    this._onChange();
    return true;
  }

  _forget() {
    this._snapshot = null;
    this._at = 0;
    this._takenUnder = null;
  }
}

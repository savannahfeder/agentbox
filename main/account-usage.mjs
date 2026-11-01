// EVERY CLAUDE ACCOUNT'S OWN USAGE, for the Settings page.
//
// main/claude-usage.mjs reads the account in use, for the corner on every
// screen. This reads all of them, only when Settings asks, so the page can say
// which login has room, and so a reading can take back a mark the account no
// longer deserves (`Supervisor#noteUsageReading`).
import { ClaudeUsage, STALE_MS, USAGE_WHOSE_UNKNOWN } from './claude-usage.mjs';
import { SAME_MOMENT_MS, USAGE_SAME_AS_ANOTHER, sameUsage } from '../shared/usage.mjs';

export class AccountUsage {
  /**
   * `identity(profile)` says whose subscription a folder holds, so one
   * subscription signed into two folders is not taken for two accounts
   * reporting the same numbers.
   */
  constructor({ bin, env = () => process.env, onReading = () => {}, run, now = () => Date.now(), where, identity = () => null } = {}) {
    this._bin = bin;
    this._env = env;
    this._onReading = onReading;
    this._run = run;
    this._now = now;
    this._where = where;
    this._identity = identity;
    this._readers = new Map();
  }

  _reader(profile) {
    let reader = this._readers.get(profile);
    if (!reader) {
      reader = new ClaudeUsage({
        bin: this._bin, run: this._run, now: this._now, where: this._where,
        account: () => ({ profile, env: this._env() }),
      });
      this._readers.set(profile, reader);
    }
    return reader;
  }

  _subscription(profile) {
    try { return this._identity(profile)?.accountUuid ?? `folder:${profile}`; } catch { return `folder:${profile}`; }
  }

  /** One answer per account, in the order given: its limits, or why there are none. */
  async readAll(profiles, { refresh = false } = {}) {
    const answers = await Promise.all(profiles.map(async (profile) => {
      const reader = this._reader(profile);
      const last = reader.peek();
      const fresh = !refresh && last && this._now() - last.at < STALE_MS;
      const result = fresh ? { ok: true, reading: last } : await reader.refreshNow();
      if (result.ok && result.reading) {
        // A reader answers for its own folder, and a reading is never relabelled.
        if (result.reading.profile !== profile) return { reading: { profile, error: USAGE_WHOSE_UNKNOWN }, isNew: false };
        return { reading: { ...result.reading, profile }, isNew: !fresh };
      }
      return { reading: { ...(reader.peek() ?? {}), profile, error: result.error ?? null }, isNew: false };
    }));

    // Two subscriptions with one set of numbers: one login was read for both.
    // Which one is real cannot be told, so neither is shown or kept.
    const twins = new Set();
    answers.forEach(({ reading: a }, i) => answers.forEach(({ reading: b }, j) => {
      if (j <= i || !a.limits?.length || !b.limits?.length) return;
      if (this._subscription(a.profile) === this._subscription(b.profile)) return;
      if (Math.abs(a.at - b.at) <= SAME_MOMENT_MS && sameUsage(a.limits, b.limits)) twins.add(i).add(j);
    }));

    return answers.map(({ reading, isNew }, i) => {
      if (twins.has(i)) {
        this._reader(reading.profile).forget();
        return { profile: reading.profile, unconfirmed: true, error: USAGE_SAME_AS_ANOTHER };
      }
      if (isNew) this._onReading(reading.profile, reading);
      return reading;
    });
  }
}

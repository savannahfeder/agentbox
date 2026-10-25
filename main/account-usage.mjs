// EVERY CLAUDE ACCOUNT'S OWN USAGE, for the Settings page.
//
// main/claude-usage.mjs reads the account in use, for the corner on every
// screen. This reads all of them, only when Settings asks, so the page can say
// which login has room, and so a reading can take back a mark the account no
// longer deserves (`Supervisor#noteUsageReading`).
import { ClaudeUsage, STALE_MS } from './claude-usage.mjs';

export class AccountUsage {
  constructor({ bin, env = () => process.env, onReading = () => {}, run, now = () => Date.now(), where } = {}) {
    this._bin = bin;
    this._env = env;
    this._onReading = onReading;
    this._run = run;
    this._now = now;
    this._where = where;
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

  /** One answer per account, in the order given: its limits, or why there are none. */
  async readAll(profiles, { refresh = false } = {}) {
    return Promise.all(profiles.map(async (profile) => {
      const reader = this._reader(profile);
      const last = reader.peek();
      const fresh = !refresh && last && this._now() - last.at < STALE_MS;
      const result = fresh ? { ok: true, reading: last } : await reader.refreshNow();
      if (result.ok && result.reading) {
        if (!fresh) this._onReading(profile, result.reading);
        return { ...result.reading, profile };
      }
      return { ...(reader.peek() ?? {}), profile, error: result.error ?? null };
    }));
  }
}

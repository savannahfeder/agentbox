// EVERY CLAUDE ACCOUNT'S OWN USAGE, for the Settings page.
//
// main/claude-usage.mts reads the account in use, for the corner on every
// screen. This reads all of them, only when Settings asks, so the page can say
// which login has room, and so a reading can take back a mark the account no
// longer deserves (`Supervisor#noteUsageReading`).
import { ClaudeUsage, STALE_MS, USAGE_WHOSE_UNKNOWN } from './claude-usage.mts';
import type { UsageResult } from './claude-usage.mts';
import type { UsageRunner } from './claude-usage-process.mts';
import type { UsageLimit } from '../shared/usage.mts';
import { SAME_MOMENT_MS, USAGE_SAME_AS_ANOTHER, sameUsage } from '../shared/usage.mts';

export interface AccountReading {
  profile: string;
  limits?: UsageLimit[];
  at?: number;
  error?: string | null;
  unconfirmed?: boolean;
}

export interface AccountUsageOptions {
  bin?: () => string | null;
  env?: () => NodeJS.ProcessEnv;
  onReading?: (profile: string, reading: AccountReading) => void;
  run?: UsageRunner;
  now?: () => number;
  where?: () => string;
  identity?: (profile: string) => { accountUuid?: string | null } | null;
}

export class AccountUsage {
  declare _bin: (() => string | null) | undefined;
  declare _env: () => NodeJS.ProcessEnv;
  declare _onReading: (profile: string, reading: AccountReading) => void;
  declare _run: UsageRunner | undefined;
  declare _now: () => number;
  declare _where: (() => string) | undefined;
  declare _identity: (profile: string) => { accountUuid?: string | null } | null;
  declare _readers: Map<string, ClaudeUsage>;

  /**
   * `identity(profile)` says whose subscription a folder holds, so one
   * subscription signed into two folders is not taken for two accounts
   * reporting the same numbers.
   */
  constructor({ bin, env = () => process.env, onReading = () => {}, run, now = () => Date.now(), where, identity = () => null }: AccountUsageOptions = {}) {
    this._bin = bin;
    this._env = env;
    this._onReading = onReading;
    this._run = run;
    this._now = now;
    this._where = where;
    this._identity = identity;
    this._readers = new Map();
  }

  _reader(profile: string) {
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

  _subscription(profile: string) {
    try { return this._identity(profile)?.accountUuid ?? `folder:${profile}`; } catch { return `folder:${profile}`; }
  }

  /** One answer per account, in the order given: its limits, or why there are none. */
  async readAll(profiles: string[], { refresh = false }: { refresh?: boolean } = {}) {
    const answers: { reading: AccountReading; isNew: boolean }[] = await Promise.all(profiles.map(async (profile) => {
      const reader = this._reader(profile);
      const last = reader.peek();
      const fresh = !refresh && last && this._now() - last.at < STALE_MS;
      const result: UsageResult = fresh ? { ok: true, reading: last } : await reader.refreshNow();
      if (result.ok && result.reading) {
        // A reader answers for its own folder, and a reading is never relabelled.
        if (result.reading.profile !== profile) return { reading: { profile, error: USAGE_WHOSE_UNKNOWN }, isNew: false };
        return { reading: { ...result.reading, profile }, isNew: !fresh };
      }
      return { reading: { ...(reader.peek() ?? {}), profile, error: result.error ?? null }, isNew: false };
    }));

    // Two subscriptions with one set of numbers: one login was read for both.
    // Which one is real cannot be told, so neither is shown or kept.
    const twins = new Set<number>();
    answers.forEach(({ reading: a }, i) => answers.forEach(({ reading: b }, j) => {
      if (j <= i || !a.limits?.length || !b.limits?.length) return;
      if (this._subscription(a.profile) === this._subscription(b.profile)) return;
      if (Math.abs(a.at! - b.at!) <= SAME_MOMENT_MS && sameUsage(a.limits, b.limits)) twins.add(i).add(j);
    }));

    return answers.map(({ reading, isNew }, i): AccountReading => {
      if (twins.has(i)) {
        this._reader(reading.profile).forget();
        return { profile: reading.profile, unconfirmed: true, error: USAGE_SAME_AS_ANOTHER };
      }
      if (isNew) this._onReading(reading.profile, reading);
      return reading;
    });
  }
}

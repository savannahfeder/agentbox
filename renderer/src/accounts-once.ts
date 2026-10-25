// EACH CLAUDE ACCOUNT ONCE, WHEREVER IT IS SIGNED IN, with one reading.
//
// Usage belongs to the subscription, not to the place. This computer reads it
// through Claude Code and the cloud off a reply's headers, at different
// times, so a page that drew each place's own reading drew the same account
// twice with two numbers (tests/an-account-shows-one-reading-wherever-it-is-signed-in).
import { accountLabel, type CloudAccount } from './cloud-menu';
import type { AccountUsageReading, Usage, UsageLimit } from './types';

/** A login on this computer, as the Claude Code page reads it. */
export type HereLogin = {
  profile: string;
  email: string | null;
  plan: string | null;
  chosen: boolean;
  signedIn: boolean;
  /** Why it cannot be used, in main's words, or null. */
  trouble: string | null;
  /** The trouble is only that it is at its limit, which its meters can say better. */
  atLimit?: boolean;
  /** The folder, needed only to print the command that signs it back in. */
  dir: string | null;
};

export type OneAccount = {
  key: string;
  name: string;
  plan: string | null;
  here: HereLogin | null;
  cloud: CloudAccount | null;
  limits: UsageLimit[] | null;
  checkedAt: number | null;
  /** Why the place this reading comes from could not read it again. */
  usageError: string | null;
};

/** A login's own reading here, or the corner's when the corner is reading that same login. */
export function accountReadingFor(profile: string, readings: AccountUsageReading[], current: Usage | null): Usage | null {
  const own = readings.find(r => r.profile === profile && r.limits?.length && r.at);
  const candidates = [own ? { engine: 'claude' as const, profile, at: own.at!, limits: own.limits! } : null,
    current && (current.profile ?? 'default') === profile ? current : null];
  return candidates.filter((r): r is Usage => !!r).sort((a, b) => b.at - a.at)[0] ?? null;
}

/**
 * The account in use here first, then the rest of this computer's in their
 * order, then the cloud's that are signed in nowhere here. `cloud` is the
 * counted Claude logins (`countedAccounts`), oldest first.
 */
export function accountsOnce({ here, cloud = [], readings = [], current = null }: {
  here: HereLogin[];
  cloud?: CloudAccount[];
  readings?: AccountUsageReading[];
  current?: Usage | null;
}): OneAccount[] {
  const paired = new Map<string, CloudAccount>();
  for (const c of cloud) if (c.profile && here.some((h) => h.profile === c.profile) && !paired.has(c.profile)) paired.set(c.profile, c);
  const picked = here.some((h) => h.chosen);
  const mine = [...here].sort((x, y) => Number(picked && y.chosen) - Number(picked && x.chosen)).map((h) => one(h, paired.get(h.profile) ?? null));
  const alone = cloud.filter((c) => ![...paired.values()].includes(c)).map((c) => one(null, c));
  return [...mine, ...alone];

  function one(h: HereLogin | null, c: CloudAccount | null): OneAccount {
    const local = h ? accountReadingFor(h.profile, readings, current) : null;
    const remote = c?.limits?.length && c.readAt ? { limits: c.limits, at: c.readAt } : null;
    const fromCloud = !!remote && (!local || remote.at > local.at);
    const shown = fromCloud ? remote : local;
    const localError = h ? readings.find((r) => r.profile === h.profile)?.error ?? null : null;
    return {
      key: h?.profile ?? `cloud:${c!.key}`,
      name: h?.email ?? (c ? accountLabel(c, cloud) : 'Not signed in'),
      plan: (h?.signedIn ? h.plan : null) ?? c?.plan ?? null,
      here: h,
      cloud: c,
      limits: shown?.limits ?? null,
      checkedAt: shown?.at ?? null,
      usageError: fromCloud || (!local && !h) ? c?.readError ?? null : localError,
    };
  }
}

/**
 * The same for Codex. A Codex login in the cloud names its email and no
 * folder, so it is matched here by email. `readings` is each login's own, out
 * of its folder's logs; `current` is the one in use, as Codex pushes it.
 */
export function codexAccountsOnce({ here, cloud = [], readings = [], current = null }: {
  here: HereLogin[];
  cloud?: CloudAccount[];
  readings?: AccountUsageReading[];
  current?: Usage | null;
}): OneAccount[] {
  const matched = cloud.map((c) => ({ ...c, profile: c.profile ?? (c.name ? here.find((h) => h.email === c.name)?.profile : null) ?? null }));
  const inUse = here.find((h) => h.chosen)?.profile ?? 'default';
  return accountsOnce({ here, cloud: matched, readings, current: current && { ...current, profile: inUse } });
}

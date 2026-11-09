// The cloud's accounts on the phone's Claude Code and Codex pages, as the
// desktop's tiles say them (renderer/src/accounts-once.ts and Settings.tsx
// `accountTile`), from the computer's copy (shared/phone-settings.mjs cloudOf).
import { accountName } from '../../../shared/account-names.mts';
import type { UsageLimit } from '../../../renderer/src/types';

type Engine = 'claude' | 'codex';
type Usage = { at: number | null; limits: UsageLimit[] } | null;
export type CloudLogin = { engine: Engine; email: string | null; inUse: boolean; plan: string | null; state: string; limitedUntil: number | null; same: string | null; usage: Usage };
type Copy = { cloud?: { inUse?: Partial<Record<Engine, string | null>>; accounts?: CloudLogin[] } | null };

const loginsOf = (w: Copy, engine: Engine) => (w.cloud?.accounts ?? []).filter((a) => a.engine === engine);
const labelOf = (a: CloudLogin, all: CloudLogin[]) => accountName({ email: a.email, engine: a.engine, index: all.indexOf(a), total: all.length });

/** The account "Use the cloud" names; a computer from before the accounts rode names it by its address. */
export function cloudInUseName(w: Copy, engine: Engine): string | null {
  if (!w.cloud) return null;
  if (!w.cloud.accounts) return w.cloud.inUse?.[engine] ?? null;
  const all = loginsOf(w, engine);
  const live = all.find((a) => a.inUse);
  return live ? labelOf(live, all) : null;
}

/** Where one of this computer's logins works: here, and in the cloud while its sign-in there holds. */
export function placesOf(w: Copy, engine: Engine, localId: string): string[] {
  if (!w.cloud) return [];
  const there = loginsOf(w, engine).some((a) => a.same === localId && a.state !== 'broken');
  return there ? ['Local', 'Cloud'] : ['Local'];
}

export const withPlaces = (line: string, places: string[]) => [line, ...places].join(' · ');

/** What Settings' front page says beside Claude Code or Codex: the login in use, or how many the page lists. */
export function accountsAside(local: readonly { chosen: boolean; email: string | null }[] | undefined, cloudOnly: number): string | undefined {
  const chosen = local?.find((a) => a.chosen)?.email;
  if (chosen) return chosen;
  const n = (local?.length ?? 0) + cloudOnly;
  return n ? `${n} account${n === 1 ? '' : 's'}` : undefined;
}

/** The cloud's accounts signed in nowhere on this computer, each on a row of its own. */
export function cloudOnlyAccounts(w: Copy, engine: Engine): { name: string; desc: string; usage: Usage }[] {
  const all = loginsOf(w, engine);
  return all.filter((a) => !a.same).map((a) => ({
    name: labelOf(a, all),
    desc: [a.plan, a.state === 'broken' ? null : 'Cloud'].filter(Boolean).join(' · '),
    usage: a.usage,
  }));
}

/** A login here's reading, or its cloud twin's when that one is newer. */
export function newerUsage(w: Copy, engine: Engine, localId: string, here: Usage): Usage {
  const twin = loginsOf(w, engine).find((a) => a.same === localId)?.usage ?? null;
  return twin && (!here || (twin.at ?? 0) > (here.at ?? 0)) ? twin : here;
}

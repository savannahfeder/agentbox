// The cloud's accounts on the phone's Claude Code and Codex pages, as the
// desktop's tiles say them (renderer/src/accounts-once.ts and Settings.tsx
// `accountTile`), from the computer's copy (shared/phone-settings.mjs cloudOf).
import { accountName } from '../../../shared/account-names.mts';
import { cloudSlotWords, inUseWhere } from '../../../renderer/src/cloud-places';
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

type LocalCopy<A, B> = { claude?: { found: boolean }; codex?: { found: boolean }; accounts?: A[]; codexAccounts?: B[] };

/** The computer's own logins for an agent, none while the agent is not on it (the web's `webSettingsGroups`). */
export function computerAccounts<A, B>(w: LocalCopy<A, B>, engine: Engine): (A | B)[] {
  if (!w[engine]?.found) return [];
  return (engine === 'claude' ? w.accounts : w.codexAccounts) ?? [];
}

/** What a login's row is called: its email, else its name, else "Not signed in" as the desktop says, else "Claude account". */
export const loginLabel = (a: { email: string | null; name?: string | null; signedIn?: boolean }, engine: Engine, index: number, total: number) =>
  a.email ?? a.name ?? (a.signedIn === false ? 'Not signed in' : accountName({ engine, index, total }));

/** What Settings' front page says beside Claude Code or Codex: the login in use, or how many signed-in ones the page lists. */
export function accountsAside(local: readonly { chosen: boolean; email: string | null; signedIn?: boolean }[] | undefined, cloudOnly: number): string | undefined {
  const chosen = local?.find((a) => a.chosen)?.email;
  if (chosen) return chosen;
  const n = (local ?? []).filter((a) => a.signedIn !== false).length + cloudOnly;
  if (!n && local?.length) return 'Not signed in';
  return n ? `${n} account${n === 1 ? '' : 's'}` : undefined;
}

/** The cloud's accounts signed in nowhere on this computer, each on a row of its own. */
export function cloudOnlyAccounts(w: Copy, engine: Engine): { name: string; desc: string; usage: Usage; inUse: boolean }[] {
  const all = loginsOf(w, engine);
  return all.filter((a) => !a.same).map((a) => ({
    name: labelOf(a, all),
    desc: [a.plan, a.state === 'broken' ? null : 'Cloud'].filter(Boolean).join(' · '),
    usage: a.usage,
    inUse: a.inUse,
  }));
}

type Mode = 'mac' | 'full' | 'all';

/** The desktop's empty Cloud card (cloud-places.ts `showsCloudSlot`), in the phone's words for the computer. */
export function agentCloudSlot(w: Copy, engine: Engine): { title: string; line: string } | null {
  if (!w.cloud || loginsOf(w, engine).length) return null;
  const { title, line } = cloudSlotWords(engine === 'claude' ? 'Claude Code' : 'Codex');
  return { title, line: line.replace('this computer', 'your computer') };
}

/** The cloud's login in use can take a thread: main/cloud/logins.mts `mayRunOn`. */
export function cloudCanRun(w: Copy, engine: Engine): boolean {
  const live = loginsOf(w, engine).find((a) => a.inUse);
  return !!live && (live.state === 'ready' || live.state === 'stale');
}

/** Whether a login here wears In use: the desktop's `inUseWhere`, for this login and its cloud twin. */
export function inUseHere(w: Copy, engine: Engine, mode: Mode, a: { id: string; chosen: boolean }): boolean {
  const canRun = cloudCanRun(w, engine);
  const twinInUse = loginsOf(w, engine).some((l) => l.same === a.id && l.inUse);
  const at = inUseWhere({ chosenHere: a.chosen, isCloudInUse: twinInUse, cloudCanRun: canRun, mode });
  return at.here || at.cloud;
}

/** With the cloud on, each place has its own login, so the line is no longer true. */
export const oneAtATimeLine = (logins: number, mode: Mode): string | null =>
  logins > 1 && mode === 'mac' ? 'Your agents run on one account at a time.' : null;

/** A login here's reading, or its cloud twin's when that one is newer. */
export function newerUsage(w: Copy, engine: Engine, localId: string, here: Usage): Usage {
  const twin = loginsOf(w, engine).find((a) => a.same === localId)?.usage ?? null;
  return twin && (!here || (twin.at ?? 0) > (here.at ?? 0)) ? twin : here;
}

// WHAT AN ACCOUNT ROW SAYS ABOUT ITS OWN ROOM, on this computer and in the cloud.
import type { CloudAccount, CloudStatus } from './cloud-menu';
import type { UsageLimit } from './types';
import { resetDay, toMinute } from '../../shared/usage.mjs';

/** "5:10pm", "8pm": the clock as the usage rows already print it. */
export function hourWords(ts: number): string {
  const d = new Date(toMinute(ts));
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** `percent` is null for a window that has reset since it was read. */
export interface Meter { key: string; word: string; percent: number | null; resets: string | null }

/**
 * "6:19pm" today, "Thu 4pm" this week, "Tue Oct 27, 1pm" six or more days out
 *  (`resetDay`). A cloud reading carries only the instant, so it is said in
 *  this computer's clock.
 */
export function resetWords(l: UsageLimit, now = Date.now()): string | null {
  if (l.resetsAt) {
    if (l.resetsAt <= now) return null;
    const day = resetDay(l.resetsAt, now);
    if (!day) return hourWords(l.resetsAt);
    return `${day}${day.includes(' ') ? ',' : ''} ${hourWords(l.resetsAt)}`;
  }
  if (!l.resetsText) return null;
  return l.resetsOn ? `${l.resetsOn}, ${l.resetsText}` : l.resetsText;
}

/**
 * The numbers every account shows: this session, this week (all models), and each model's own week
 *  where Claude Code reports one ("Fable"), each with when it starts over.
 */
export function meterPair(limits: UsageLimit[] | undefined | null, now = Date.now()): Meter[] {
  const all = limits ?? [];
  const session = all.find((l) => l.span === 'session');
  const week = all.find((l) => l.span === 'week' && (!l.qualifier || /all/i.test(l.qualifier))) ?? all.find((l) => l.span === 'week');
  // A window that has reset since it was read: its number belongs to the old
  // window, and the new one has not been read, so it has none.
  const meter = (key: string, word: string, l: UsageLimit): Meter => {
    const over = !!l.resetsAt && l.resetsAt <= now;
    return { key, word, percent: over ? null : Math.round(l.percent), resets: over ? 'Reset' : resetWords(l, now) };
  };
  const models = all.filter((l) => l.span === 'week' && l !== week && l.qualifier && Number.isFinite(l.percent));
  return [
    ...(session && Number.isFinite(session.percent) ? [meter('session', 'Session', session)] : []),
    ...(week && Number.isFinite(week.percent) ? [meter('week', 'Week', week)] : []),
    ...models.map((l) => meter(`week:${l.qualifier}`, l.qualifier!, l)),
    // Codex's other windows (shared/codex-usage.mjs `windowSpan`), which the
    // type does not list: a free plan's month, or one named by its length.
    ...all.filter((l) => ['month', 'window'].includes(l.span) && Number.isFinite(l.percent))
      .map((l) => meter(l.span as string, (l.span as string) === 'month' ? 'Month' : l.name, l)),
  ];
}

/** One cloud login's state, in the words the Settings row prints. */
export function cloudAccountState(a: CloudAccount, now = Date.now()): string {
  const state = a.state as string | undefined;
  if (state === 'limited' || (a.limitedUntil && a.limitedUntil > now)) {
    return a.limitedUntil ? `At its limit, back at ${hourWords(a.limitedUntil)}` : 'At its limit';
  }
  if (state === 'broken') return 'Stopped working. Sign in again from the cloud menu.';
  if (state === 'renew') return 'Renewing its sign-in';
  return 'Ready';
}

/**
 * The cloud card's first line: when threads go there, and on which account.
 *
 * ONE ACCOUNT, HOWEVER MANY ARE SIGNED IN. This read "on these accounts in
 * turn" until w-dac993a554; `pickCloudLogin` takes one and the rest are there
 * to switch to.
 */
export function cloudPlaceLine(cloud: Pick<CloudStatus, 'mode'>, accounts: number): string {
  if (cloud.mode === 'mac') return 'Off, so every thread runs on this computer. Press C to turn it on.';
  const when = cloud.mode === 'all' ? 'Threads start here first' : 'Threads start here when this computer is full';
  return `${when}, on ${accounts > 1 ? 'the account in use' : 'this account'}.`;
}

// THE CLOUD MENU'S WORDS AND NUMBERS (tests/the-cloud-button-chooses-where-threads-run).
// The button and the menu are drawn in threads/Pages.tsx, beside the filters
// button and built like its menu; what they say lives here.
import type { UsageLimit } from './types';
import { accountName } from '../../shared/account-names.mjs';
import { teammateIdOf } from '../../shared/teammates.mjs';

export type CloudMode = 'mac' | 'full' | 'all';

export interface CloudMonth {
  runs: number;
  agentHours: number;
  estimatedCost: number;
  costPerAgentHour: number | null;
}

// A sign-in going on in the cloud (main/cloud/logins.mjs). Claude: its page
// opens, she copies the code it shows. Codex: OpenAI's page opens, she types
// the code shown here, and it finishes by itself.
export interface CloudSignIn {
  engine: 'claude' | 'codex';
  // The cloud account it adds, or signs in again.
  key: string;
  state: 'starting' | 'needs-code' | 'waiting' | 'checking' | 'saved' | 'failed';
  url: string | null;
  code: string | null;
  message: string | null;
  // One sign-in, told from the next, which may show the same link.
  attempt?: string;
}

// AN ACCOUNT SHE ADDED FOR THE CLOUD. Not this Mac's account: any she likes
// (2026-10-14: "we shouldn't predefine which accounts to sign up with").
export interface CloudAccount {
  engine: 'claude' | 'codex';
  key: string;
  // Its email, when the vendor said it.
  name: string | null;
  ready: boolean;
  // 'broken' (stopped working), 'renew' / 'stale' (a Codex login being
  // renewed), 'limited' (at its usage limit until it resets), 'duplicate'
  // (the same Claude account as an earlier one), 'ready'.
  state?: 'broken' | 'renew' | 'stale' | 'limited' | 'duplicate' | 'ready';
  savedAt?: number | null;
  limitedUntil?: number | null;
  /** The earlier account this one is the same Claude account as (state 'duplicate'). */
  duplicateOf?: string | null;
  /** Its session and week, read off a reply's own headers in the cloud. */
  limits?: UsageLimit[] | null;
  readAt?: number | null;
  /** The plan of the folder here in the same organization ("Max 20x"). */
  plan?: string | null;
  /** That folder, when it holds the same subscription: the two share one reading. */
  profile?: string | null;
  /** Why the cloud's last look at it failed, when no look has read it since. */
  readError?: string | null;
  /** The one the cloud runs on (Supervisor#_cloudAccounts). */
  inUse?: boolean;
}

export interface CloudStatus {
  setUp: boolean;
  /** Agentbox Cloud can be signed in to here, and nobody has yet. */
  offered?: boolean;
  /** Set up through Agentbox Cloud's server, not the owner's own AWS. */
  managed?: boolean;
  mode: CloudMode;
  /** What "on" means, kept while the cloud is off. */
  whenOn?: Exclude<CloudMode, 'mac'>;
  running: number;
  month: CloudMonth;
  accounts?: CloudAccount[];
  /** Engines whose account on this Mac has no working sign-in in the cloud, so their threads run here. */
  notInCloud?: Array<'claude' | 'codex'>;
  signIns?: CloudSignIn[];
  /** 'resting' after runs failed in a row before their agent started, until `restingUntil`. */
  health?: 'ok' | 'failing' | 'resting';
  lastError?: string | null;
  restingUntil?: number | null;
  /** Agentbox Cloud had no room for this person a moment ago: no plan, hours spent, every agent running, paused, or terms not accepted. */
  noRoom?: { error: 'plan' | 'hours' | 'agents' | 'paused' | 'terms'; message: string | null } | null;
  /** The cloud image's Claude Code or Codex, as major.minor, when it is not this Mac's; `blocks` for a different major. */
  versionGap?: { engine: 'claude' | 'codex'; cloud: string; mac: string; blocks: boolean } | null;
  /** The slugs of the projects whose threads the cloud may run (supervisor `_cloudTakesProject`). */
  projects?: string[];
  /** The Agentbox Cloud plan the server last said; 'none' is no plan. */
  plan?: string | null;
  /** Runs on this Mac the cloud could take now (supervisor `_movableToCloud`). */
  movable?: string[];
}

const agentName = (engine: 'claude' | 'codex') => (engine === 'codex' ? 'Codex' : 'Claude Code');
const rebuildLine = (g: NonNullable<CloudStatus['versionGap']>) => `The cloud's ${agentName(g.engine)} is ${g.cloud}, this Mac's is ${g.mac}: rebuild the cloud image`;

export const engineWord = (a: { engine: 'claude' | 'codex' }) => (a.engine === 'codex' ? 'Codex' : 'Claude');

const GOING = new Set(['starting', 'needs-code', 'waiting', 'checking']);
export const signingIn = (s: CloudSignIn | null | undefined) => !!s && GOING.has(s.state);

// The page a sign-in opens, and what tells this opening from the last: two
// Codex sign-ins show the same link, and each must open it.
export function pageToOpen(s: CloudSignIn | null): { key: string; url: string } | null {
  return s && s.url ? { key: `${s.engine}:${s.key}:${s.attempt ?? ''}:${s.url}`, url: s.url } : null;
}

// What an account is called: its email, or, when the vendor would not say,
// "Claude account 2", counted among that engine's accounts. The rule itself is
// shared, because the sentence a thread gets when a login runs out names one
// too (shared/account-names.mjs).
export function accountLabel(a: CloudAccount, all: CloudAccount[]): string {
  const same = all.filter((x) => x.engine === a.engine);
  return accountName({ email: a.name, engine: a.engine, index: same.indexOf(a), total: same.length });
}

export const CLOUD_MODES: { id: CloudMode; label: string; note: string }[] = [
  { id: 'mac', label: 'This Mac only', note: 'Threads that don’t fit wait for a free agent.' },
  { id: 'full', label: 'When this Mac is full', note: 'Threads that don’t fit here start in the cloud.' },
  { id: 'all', label: 'Everything', note: 'Threads start in the cloud first, wherever they can.' },
];

// THE CLOUD IS ON OR OFF (2026-10-16, her pick of five drawings). C flips it;
// what "on" means, when this Mac is full or everything, is kept as a
// preference in the menu and survives the cloud being off.
export const CLOUD_KEY = '⌘C';

/**
 * ⌘C (Ctrl+C) TURNS THE CLOUD ON OR OFF (2026-10-17: a plain C was hit by
 * accident). It is Copy first: never with text selected, in a field, or over a
 * dialog.
 */
export function cloudChord(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  { inInput, selection, modal }: { inInput: boolean; selection: string; modal: boolean },
): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'c') return false;
  return !inInput && !modal && !selection.trim();
}

export const CLOUD_WHEN_ON: { id: Exclude<CloudMode, 'mac'>; label: string; note: string }[] = [
  { id: 'full', label: 'When this Mac is full', note: 'Threads that don’t fit here start in the cloud.' },
  { id: 'all', label: 'Everything', note: 'Threads start in the cloud first, wherever they can.' },
];

type OnOff = { mode: CloudMode; whenOn?: Exclude<CloudMode, 'mac'> } | null | undefined;

export const cloudIsOn = (status: OnOff) => !!status && status.mode !== 'mac';

/** The accounts that count: one added twice counts once. */
export const countedAccounts = (accounts: CloudAccount[]) => accounts.filter((a) => a.state !== 'duplicate');

/**
 * THE ONE ACCOUNT THE CLOUD RUNS ON, as the app marks it. The rule is
 * `pickCloudLogin`'s (main/cloud/logins.mjs) and it starts from this Mac's own
 * account, which the screen's copy of the cloud accounts cannot see. One at
 * its usage limit is still the account, and the cloud waits for it.
 */
export const cloudAccountInUse = (accounts: CloudAccount[], engine: 'claude' | 'codex') =>
  countedAccounts(accounts ?? []).find((a) => a.engine === engine && a.inUse) ?? null;

/**
 * THE MENU'S LAST LINE: what runs in the cloud, or, while the cloud is on and
 * the account it runs on is at its usage limit, that and when it comes back
 * (2026-10-16: "our cloud must be broken", when it was out of usage).
 */
const clock = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();

export function cloudFootLine(cloud: CloudStatus, now = Date.now()): string {
  if (cloud.health === 'resting' && cloud.restingUntil && cloud.restingUntil > now) {
    const why = String(cloud.lastError || 'its runs failed before they started').slice(0, 120);
    return `The cloud is failing (${why}). Threads run on this Mac until ${clock(cloud.restingUntil)}.`;
  }
  const gap = cloud.versionGap;
  if (gap?.blocks) return `${rebuildLine(gap)}. ${gap.engine === 'codex' ? 'Codex' : 'Claude'} threads run on this Mac until then.`;
  if (cloudIsOn(cloud) && cloud.notInCloud?.includes('claude')) {
    return 'The Claude account this Mac uses is not signed in to the cloud, so threads run on this Mac. Sign it in to run them there.';
  }
  // ONE ACCOUNT RUNS IN THE CLOUD (w-dac993a554). This used to wait until
  // EVERY account was at its limit, which was right while runs rotated over
  // all of them and is silence now: the cloud starts nothing the moment the
  // account in use is out, however many others are signed in.
  const inUse = cloudAccountInUse(cloud.accounts || [], 'claude');
  const until = inUse?.limitedUntil && inUse.limitedUntil > now ? inUse.limitedUntil : null;
  if (cloudIsOn(cloud) && until) {
    return `The Claude account the cloud runs on is at its usage limit until ${clock(until)}. Threads run on this Mac until then.`;
  }
  if (gap) return rebuildLine(gap);
  return cloud.running ? `${cloud.running} running in the cloud now` : 'Nothing running in the cloud now';
}

/**
 * THE MENU'S LINE ABOUT RUNS ON THIS MAC THE CLOUD COULD TAKE. With Everything
 * they move by themselves and the line says so; when this Mac is full, it
 * offers to move them. Null with none, or with the cloud off.
 */
export function cloudMoveLine({ mode, movable }: { mode: CloudMode; movable: number }): { say: string; go: string | null } | null {
  if (!movable || mode === 'mac') return null;
  const threads = `${movable} thread${movable === 1 ? '' : 's'}`;
  if (mode === 'all') return { say: `Moving ${threads} to the cloud`, go: null };
  return { say: `${threads} could run in the cloud`, go: movable === 1 ? 'Move it' : 'Move them' };
}

/** Where C takes it: off from either kind of on, back on to what "on" means. */
export function cloudToggleTarget(status: OnOff): CloudMode {
  if (cloudIsOn(status)) return 'mac';
  return status?.whenOn === 'all' ? 'all' : 'full';
}

/** The note after C, naming where new threads go now. */
export function cloudToggleNote(mode: CloudMode): string {
  if (mode === 'mac') return 'Cloud off: new threads run on this Mac';
  if (mode === 'all') return 'Cloud on: everything starts in the cloud';
  return 'Cloud on: threads that don’t fit here start in the cloud';
}

/** ⌘K's rows: on or off with its key first, then each meaning of on. */
export function cloudCommands(status: OnOff): { mode: CloudMode; label: string; keyHint?: string; hint?: string }[] {
  const on = cloudIsOn(status);
  return [
    { mode: cloudToggleTarget(status), label: on ? 'Turn the cloud off' : 'Turn the cloud on', keyHint: CLOUD_KEY },
    ...CLOUD_WHEN_ON.map((c) => ({
      mode: c.id,
      label: `Cloud on: ${c.label[0].toLowerCase()}${c.label.slice(1)}`,
      ...(on && status?.mode === c.id ? { hint: 'On now' } : {}),
    })),
  ];
}

// `cloudRuns` in the config, read the way the supervisor reads it: false is
// off, 'all' is everything, anything else is "when this Mac is full".
export function cloudModeOf(cloudRuns: unknown): CloudMode {
  if (cloudRuns === false) return 'mac';
  if (cloudRuns === 'all') return 'all';
  return 'full';
}

export function cloudButtonCount(status: { running: number } | null | undefined): number | null {
  return status && status.running > 0 ? status.running : null;
}

const hours = (n: number) => String(Math.round(n * 10) / 10);

// USE, NEVER A PRICE (2026-10-16): each person is on their own plan and pays
// nothing like the estimate, so the hours are said and the cost is not.
export function cloudMonthLine(month: CloudMonth): string {
  if (!month.runs) return 'Nothing in the cloud yet this month';
  return `${hours(month.agentHours)} agent-hours`;
}

/** Set up for the cloud, and not on Agentbox Cloud without a plan. */
export function onCloudPlan(cloud: CloudStatus | null | undefined): cloud is CloudStatus {
  if (!cloud?.setUp) return false;
  return !(cloud.managed && (cloud.plan === 'none' || cloud.noRoom?.error === 'plan'));
}

/**
 * WHERE ONE THREAD RUNS, for its menu's row (threads/ThreadMenu.tsx): in the
 * cloud now, kept on this Mac, or here and free to go to the cloud. Null where
 * the cloud could never run it: no cloud set up, the cloud off and the thread
 * not kept, or a project the cloud does not take.
 */
export function threadPlace(
  item: { id: string; product: string; onMac?: boolean; needsMac?: string; labels?: string[] },
  session: { where?: string; movable?: boolean } | null,
  cloud: CloudStatus | null,
): 'cloud' | 'here' | 'kept' | 'move' | 'needs' | null {
  if (teammateIdOf(item)) return null;
  // The phone has no cloud status, only the computer's word on each run.
  if (session?.movable && session.where !== 'cloud') return 'move';
  if (!onCloudPlan(cloud)) return null;
  if (item.needsMac) return 'needs';
  if (item.onMac) return 'kept';
  if (session?.where === 'cloud') return 'cloud';
  if (!cloudIsOn(cloud)) return null;
  if (cloud.movable?.includes(item.id)) return 'move';
  return cloud.projects?.includes(item.product) ? 'here' : null;
}

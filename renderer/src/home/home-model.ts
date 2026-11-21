// What Home shows, worked out from data the app already has.
import { harnessOf } from '../box-filter';

export function greeting(hour: number, name?: string | null): string {
  const part = hour < 4 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

const DAY = 86_400_000;

/** Things finished on each of the last seven days, oldest first and today
 *  last. Days to come are never drawn. */
export function weekCounts(finishedAt: readonly number[], now: number): number[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 6 * DAY;
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const at of finishedAt) {
    if (at < start || at > now) continue;
    const d = new Date(at); d.setHours(0, 0, 0, 0);
    const i = Math.round((d.getTime() - start) / DAY);
    if (i >= 0 && i < 7) out[i] += 1;
  }
  return out;
}

export type DoorKey = 'inbox' | 'progress' | 'team';
export type Door = { key: DoorKey; label: string; count: number | null };

/** The places Home opens onto. Team is only there for someone on a team, and a door with nothing behind it shows no number. */
export function doors({ needs, progress, team }: { needs: number; progress: number; team: boolean }): Door[] {
  const out: Door[] = [
    { key: 'inbox', label: 'Inbox', count: needs > 0 ? needs : null },
    { key: 'progress', label: 'In progress', count: progress > 0 ? progress : null },
  ];
  if (team) out.push({ key: 'team', label: 'Team', count: null });
  return out;
}

export function agoShort(at: number, now: number): string {
  const m = Math.max(0, Math.floor((now - at) / 60_000));
  if (m < 1) return 'now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr`;
  return `${Math.floor(h / 24)} d`;
}

type EngineFacts = {
  running?: readonly { itemId: string; product: string; engine?: string }[];
  engines?: { workspace?: string | null; byItem?: Record<string, string> } | null;
};

/** Which coding agent a row is on: the run that really started, else a Codex
 *  conversation, else main's answer for its next run. The row's own `engine`
 *  is only what it asked for, and is absent when it takes the workspace default. */
export function rowEngine(
  item: { id: string; product: string; labels?: readonly string[]; engine?: string | null },
  facts: EngineFacts,
): string {
  const run = facts.running?.find((r) => r.itemId === item.id && r.product === item.product);
  if (run?.engine) return run.engine;
  if (harnessOf({ labels: item.labels ? [...item.labels] : [], engine: item.engine }) === 'codex') return 'codex';
  return facts.engines?.byItem?.[item.id] ?? facts.engines?.workspace ?? item.engine ?? 'claude';
}

export function engineName(engine: string | undefined): string {
  return engine === 'codex' ? 'Codex' : 'Claude Code';
}

/** The letter on a row's tile: C for Claude Code, X for Codex, so the two read apart. */
export function engineLetter(engine: string | undefined): string {
  return engine === 'codex' ? 'X' : 'C';
}

/**
 * A page drawn in place of the Inbox list (Home, a person's or the team's place,
 * the Team page, a file over the whole window) hides its selected row, so no key
 * may act on it. An open thread answers its own keys.
 */
export function somethingCoversTheList(p: {
  homeOn: boolean; homeOpen: boolean; threadOpen: boolean; searching: boolean; settingsOpen: boolean;
  teamShown: boolean; placeShown: boolean; fileOverTheList: boolean;
}): boolean {
  if (p.threadOpen || p.settingsOpen) return false;
  if (p.teamShown || p.placeShown || p.fileOverTheList) return true;
  return p.homeOn && p.homeOpen && !p.searching;
}

export type TeamRowState = 'working' | 'waiting' | 'quiet';

export function teamRowState({ agents, waitingOnYou }: { agents: number | null; waitingOnYou: boolean }): TeamRowState {
  if (waitingOnYou) return 'waiting';
  return agents ? 'working' : 'quiet';
}

/** A Home row is on the Needs you card or the In progress card; a running thread is never in Needs you. */
export function homeRowOpens<E extends { key: string }, I>(key: string, needs: readonly E[], progress: readonly I[], keyOf: (item: I) => string): { entry: E } | { item: I } | null {
  const entry = needs.find((e) => e.key === key);
  if (entry) return { entry };
  const item = progress.find((i) => keyOf(i) === key);
  return item ? { item } : null;
}

const STATE_RANK: Record<TeamRowState, number> = { waiting: 0, working: 1, quiet: 2 };

/** Team this week, busiest first: whoever waits on you, then whoever is
 *  working, then the most finished this week, then the latest of it. Ties keep
 *  the Team page's order. */
export function busiestFirst<T extends { state: TeamRowState; week: readonly number[]; total: number }>(rows: readonly T[]): T[] {
  const latest = (w: readonly number[]) => { for (let i = w.length - 1; i >= 0; i--) if (w[i]) return i; return -1; };
  return rows.map((r, i) => ({ r, i })).sort((a, b) =>
    STATE_RANK[a.r.state] - STATE_RANK[b.r.state]
    || b.r.total - a.r.total
    || latest(b.r.week) - latest(a.r.week)
    || a.i - b.i).map((x) => x.r);
}

// A ROOM'S WALL AND THE ROW MY MAC PUBLISHES FOR IT (w-3d0fa23ffb).
//
// Pure. Rows are as the cloud sends them (cloud/supabase/migrations/
// 20261021000000_rooms.sql): `room_profiles` say what a person lets a card
// show, `room_presence` is one row per Mac. docs/team/ROOMS-PLAN.md has the
// rules; the test is tests/a-room-wall-shows-each-person-as-they-chose.
import { localDate, streakOf } from './agent-hours.mts';
import type { AgentHoursSummary } from './agent-hours.mts';
import { visibilityOf } from './thread-cards.mjs';

type Row = Parameters<typeof visibilityOf>[0];
type Seen = Parameters<typeof visibilityOf>[1];
type Stamp = string | number | null | undefined;
type Working = { workingOn: string | null; workingPrivate: boolean };
type MonthRow = { month?: unknown; hours?: unknown } | null;

/** One room_presence row, as the cloud sends it. */
export interface PresenceRowLike {
  person_id?: string;
  gone?: boolean;
  hours_total?: unknown;
  hours_week?: unknown;
  hours_today?: unknown;
  week_start?: unknown;
  day?: unknown;
  active_days?: unknown[] | null;
  hours_by_month?: unknown;
  updated_at?: Stamp;
  agents_running?: unknown;
  working_at?: Stamp;
  working_on?: string | null;
  working_private?: boolean | null;
}

/** One room_profiles row, as the cloud sends it. */
export interface WallProfile {
  person_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  headline?: string | null;
  bio?: string | null;
  show_working?: string;
  show_agents?: boolean;
  show_level?: boolean;
  show_status?: boolean;
  show_activity?: boolean;
  invisible_until?: Stamp;
  status_text?: string | null;
  status_until?: Stamp;
}

/** The cards of the team that a person's own working-on name is read from. */
export interface TeamCardLike {
  personId?: string;
  state?: string;
  visible?: boolean;
  title?: unknown;
  updatedAt?: unknown;
}

/** One person's card on a room's wall. */
export interface WallCard extends Working {
  id: string;
  me: boolean;
  away?: boolean;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  agents: number | null;
  hoursTotal: number;
  hoursWeek: number;
  hoursToday: number;
  streak: number;
  byMonth: { month: string; hours: number }[];
  teammate: boolean;
  showActivity: boolean;
  activity: null;
  status: string | null;
}

/** The presence row this Mac sends. */
export interface MyPresenceRow {
  agents_running: number;
  working_on: string | null;
  working_private: boolean;
  working_at: string | null;
  hours_total: number;
  hours_week: number;
  week_start: string;
  hours_today: number;
  day: string;
  streak_days: number;
  active_days: string[];
  hours_by_month: { month: string; hours: number }[];
  activity: unknown[];
}

export const PRESENCE_STALE_MS: number = 15 * 60_000;
export const WORKING_ON_MAX: number = 64;
const DAY_MS = 86_400_000;

export function displayNameOf(name: unknown, { full = false }: { full?: boolean } = {}): string {
  let s = String(name ?? '').trim();
  if (s.includes('@')) s = s.split('@')[0];
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2 || full) return words.join(' ');
  return `${words[0]} ${words.at(-1)![0].toUpperCase()}.`;
}

const ms = (v: Stamp): number => (v == null ? NaN : typeof v === 'number' ? v : Date.parse(v));
// A date the publisher wrote in their own zone, read as local midnight here.
const dayMs = (d: unknown): number => (typeof d === 'string' ? new Date(`${d}T00:00:00`).getTime() : NaN);
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

function sumPresence(rows: readonly PresenceRowLike[], now: number) {
  let agents = 0, total = 0, week = 0, today = 0;
  const days = new Set<string>();
  const months = new Map<string, number>();
  let lead: PresenceRowLike | null = null;
  for (const r of rows) {
    if (r.gone) continue;
    total += num(r.hours_total);
    if (now < dayMs(r.week_start) + 7 * DAY_MS) week += num(r.hours_week);
    if (now < dayMs(r.day) + DAY_MS) today += num(r.hours_today);
    for (const d of r.active_days ?? []) days.add(String(d).slice(0, 10));
    for (const m of Array.isArray(r.hours_by_month) ? r.hours_by_month as MonthRow[] : []) {
      if (typeof m?.month === 'string') months.set(m.month, (months.get(m.month) ?? 0) + num(m.hours));
    }
    const fresh = now - ms(r.updated_at) < PRESENCE_STALE_MS;
    if (!fresh || !(num(r.agents_running) > 0)) continue;
    agents += num(r.agents_running);
    if (!lead || (ms(r.working_at) || 0) > (ms(lead.working_at) || 0)) lead = r;
  }
  const byMonth = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, hours]) => ({ month, hours }));
  return { agents, total, week, today, streak: streakOf([...days], now), byMonth, lead };
}

function workingOf({ profile, lead, teammate, cards }: { profile: WallProfile; lead: PresenceRowLike | null; teammate: boolean; cards: readonly TeamCardLike[] }): Working {
  const none = { workingOn: null, workingPrivate: false };
  if (!lead) return none;
  if (profile.show_working === 'none' || lead.working_private) return { workingOn: null, workingPrivate: true };
  if (profile.show_working === 'everyone' && lead.working_on) return { workingOn: lead.working_on, workingPrivate: false };
  // Running, and no name this viewer may read: it says Private thread.
  const hidden = { workingOn: null, workingPrivate: true };
  if (!teammate) return hidden;
  const card = cards
    .filter((c) => c.state === 'running' && c.visible !== false && c.title)
    .sort((a, b) => num(b.updatedAt) - num(a.updatedAt))[0];
  return card ? { workingOn: String(card.title).slice(0, WORKING_ON_MAX), workingPrivate: false } : hidden;
}

// One card per member with a profile, sorted by name so cards never jump.
// Invisible people are already hidden from others by the cloud; my own
// profile still reaches me, so I leave my own wall too. `mine` is what this
// Mac knows I am working on, which my own card shows whatever others see.
// `names` is the cloud's room_names for this room, or null on a cloud without
// it: a member with no card at all is on the wall, named, as not on Rooms yet.
// In a `listed` room, open to anyone, my own card shows me what strangers see.
export function wallCards({ members = [], profiles = [], presence = [], teammates = [], teamCards = [], meId = null, now = Date.now(), mine = null, names = null, listed = false }: {
  members?: readonly string[];
  profiles?: readonly WallProfile[];
  presence?: readonly PresenceRowLike[];
  teammates?: readonly string[];
  teamCards?: readonly TeamCardLike[];
  meId?: string | null;
  now?: number;
  mine?: { agents?: number; workingOn?: string | null } | null;
  names?: readonly { person_id: string; has_card?: boolean; name?: string; avatar_url?: string | null }[] | null;
  listed?: boolean;
}): WallCard[] {
  const inRoom = new Set<string>(members);
  const mates = new Set<string>(teammates);
  const out: WallCard[] = [];
  for (const p of profiles) {
    if (!p?.person_id || !inRoom.has(p.person_id)) continue;
    if (now < ms(p.invisible_until)) continue;
    const id = p.person_id;
    const s = sumPresence(presence.filter((r) => r.person_id === id), now);
    const cards = teamCards.filter((c) => c.personId === id);
    out.push({
      id,
      me: id === meId,
      name: p.display_name || '',
      avatarUrl: p.avatar_url ?? null,
      headline: p.headline ?? null,
      bio: p.bio ?? null,
      // My own count is this Mac's, not the cloud's last word on it.
      agents: p.show_agents === false ? null : id === meId && Number.isFinite(mine?.agents) ? mine!.agents as number : s.agents,
      hoursTotal: s.total,
      hoursWeek: s.week,
      hoursToday: s.today,
      streak: s.streak,
      byMonth: s.byMonth,
      teammate: mates.has(id) && id !== meId,
      showActivity: p.show_activity !== false,
      // A list of threads an older Mac still sends is read by nobody.
      activity: null,
      status: p.show_status !== false && p.status_text && !(ms(p.status_until) <= now) ? p.status_text : null,
      ...(id === meId && mine ? ownWorking(mine, listed && p.show_working !== 'everyone')
        : workingOf({ profile: p, lead: s.lead, teammate: mates.has(id) && id !== meId, cards })),
    });
  }
  for (const n of names ?? []) {
    if (n.has_card || !inRoom.has(n.person_id) || n.person_id === meId) continue;
    out.push({
      id: n.person_id, me: false, away: true, name: displayNameOf(n.name), avatarUrl: n.avatar_url ?? null, headline: null, bio: null,
      agents: null, hoursTotal: 0, hoursWeek: 0, hoursToday: 0, streak: 0, byMonth: [],
      teammate: mates.has(n.person_id), showActivity: false, activity: null, status: null, workingOn: null, workingPrivate: false,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

const ownWorking = (mine: { workingOn?: string | null }, hidden: boolean): Working => (hidden
  ? { workingOn: null, workingPrivate: !!mine.workingOn }
  : { workingOn: mine.workingOn ?? null, workingPrivate: false });

const shortName = (item: Row | undefined): string => (String(item?.label ?? '').trim() || String(item?.title ?? '')).slice(0, WORKING_ON_MAX);

// The presence row this Mac sends. `running` is the supervisor's running
// sessions ({itemId, product, startedAt}); `summary` is summarizeRuns'.
// A thread is named only when its project and its own word leave it to the
// whole team, and only when I let everyone see it: realtime sends whole rows,
// so a name on the row reaches everyone in my rooms.
export function myPresence({ running = [], items = [], products = [], summary, now = Date.now(), showWorking = 'everyone' }: {
  running?: readonly { itemId?: string; product?: string; startedAt?: number }[];
  items?: readonly Row[];
  products?: readonly (NonNullable<Seen> & { slug?: string })[];
  summary?: AgentHoursSummary | null;
  now?: number;
  showWorking?: string;
}): MyPresenceRow {
  const lead = [...running].sort((a, b) => num(b.startedAt) - num(a.startedAt))[0];
  let working_on: string | null = null;
  let working_private = false;
  if (lead && showWorking !== 'none') {
    const item = items.find((i) => i.id === lead.itemId);
    const product = products.find((p) => p.slug === (item?.product ?? lead.product));
    const v = item ? visibilityOf(item, product) : 'private';
    if (v !== undefined && v !== 'team') working_private = true;
    else if (showWorking === 'everyone') working_on = shortName(item) || null;
  }
  return {
    agents_running: running.length,
    working_on,
    working_private,
    working_at: lead ? new Date(num(lead.startedAt) || now).toISOString() : null,
    hours_total: round2(summary?.total),
    hours_week: round2(summary?.week),
    week_start: summary?.weekStart ?? localDate(now),
    hours_today: round2(summary?.today),
    day: summary?.day ?? localDate(now),
    streak_days: summary?.streak ?? 0,
    active_days: summary?.activeDays ?? [],
    hours_by_month: summary?.byMonth ?? [],
    // Never a list of threads: it reached everyone in my rooms.
    activity: [],
  };
}

const round2 = (v: unknown): number => Math.round(num(v) * 100) / 100;

// A switch turned off keeps that value off the cloud, so nobody can read it
// from the row, a realtime event or an invite preview.
export function withoutHidden<T>(row: T, profile: { show_agents?: unknown; show_level?: unknown } | null | undefined): T {
  const out = { ...row } as Record<string, unknown>;
  if (profile?.show_agents === false) out.agents_running = 0;
  if (profile?.show_level === false) {
    Object.assign(out, { hours_total: 0, hours_week: 0, hours_today: 0, streak_days: 0, active_days: [], hours_by_month: [] });
  }
  return out as T;
}

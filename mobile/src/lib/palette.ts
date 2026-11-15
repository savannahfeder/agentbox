// The magnifier opens ⌘K, drawn for a phone (renderer/src/components/Palette.tsx):
// threads first as you type, then the commands. These are the ones a phone has;
// the ones about a Mac or its keyboard were never offered here.
import { matchesQuery, rankMatches } from '../../../renderer/src/palette-rows';
import { cloudCommands, type CloudMode } from '../../../renderer/src/cloud-menu';
import { moveProduct } from '../../../shared/rank.mts';
import type { PlaceId } from './groups';
import type { PhoneLook } from './look';
import type { Change } from './settings-view';

export type Act = { go: PlaceId; menu?: boolean } | { push: string } | { look: PhoneLook } | { group: string } | { setting: Change & { value: unknown } } | { teammate: string; paused: boolean };
/** `typed`: one row of many alike (one per teammate, per project, per cloud mode), shown once something is typed. */
export interface PhoneCommand { id: string; label: string; keywords?: string; aside?: string; act: Act; typed?: true }

/** The copy's projects, already in the computer's running order, with an order still on its way laid over them. */
export function inRunningOrder<P extends { slug: string }>(projects: readonly P[], order: readonly string[]): P[] {
  const placed = order.map((slug) => projects.find((p) => p.slug === slug)).filter((p): p is P => !!p);
  return [...placed, ...projects.filter((p) => !order.includes(p.slug))];
}

/** What the computer's settings copy says, for the commands that change it. */
export interface ComputerFacts {
  paused: boolean; projects: readonly { slug: string; name: string }[]; order: readonly string[];
  /** Null when the computer is not set up for the cloud. */
  cloud?: { mode: CloudMode; whenOn?: Exclude<CloudMode, 'mac'> } | null;
}

/** The desktop's ⌘K rows for the computer (renderer/src/components/Palette.tsx), in its words. */
function computerCommands(c: ComputerFacts): PhoneCommand[] {
  const slugs = c.projects.map((p) => p.slug);
  const set = (key: string, value: unknown): Act => ({ setting: { scope: 'workspace', key, value } });
  return [
    { id: 'pause', label: c.paused ? 'Unpause agents' : 'Pause agents', keywords: 'stop hold sessions spawn', act: set('paused', !c.paused) },
    { id: 'resume-stopped', label: 'Resume interrupted agents', keywords: 'respawn stranded usage limit crash', act: set('resumeStopped', true) },
    ...(c.cloud ? cloudCommands(c.cloud).map((r, i) => ({
      id: i === 0 ? 'cloud-toggle' : `cloud-${r.mode}`, label: r.label.replace('this Mac', 'your computer'),
      ...(r.hint ? { aside: r.hint } : {}),
      keywords: 'cloud where threads run computer overflow everything move on off', act: set('cloudRuns', r.mode), typed: true as const,
    })) : []),
    { id: 'usage', label: 'Usage and limits', aside: 'Settings', keywords: 'usage limit limits left remaining quota accounts week session', act: { push: '/settings/claude' } },
    ...c.projects.map((p, i) => ({
      id: `rank-${p.slug}`, label: `Rank ${p.name} first`,
      aside: c.order.includes(p.slug) ? `now #${i + 1} of ${c.projects.length}` : 'not ranked yet',
      keywords: 'priority order top', act: set('productOrder', moveProduct(slugs, p.slug, 0)), typed: true as const,
    })),
  ];
}

export function phoneCommands({ team, mates = [], groups = [], looks = [], pages = [], computer = null }: {
  /** A team is on: In progress, Later and Done sit under Everything else. */
  team: boolean;
  mates?: readonly { id: string; name: string; paused?: boolean }[];
  groups?: readonly { id: string; name: string }[];
  looks?: readonly { id: PhoneLook; name: string }[];
  pages?: readonly { id: string; label: string }[];
  /** Null until the computer has sent its settings. */
  computer?: ComputerFacts | null;
}): PhoneCommand[] {
  return [
    { id: 'new', label: 'New thread', keywords: 'compose write task', act: { push: '/new' } },
    { id: 'inbox', label: 'Needs you', keywords: 'inbox', act: { go: 'inbox' } },
    ...(team ? [
      { id: 'everything', label: 'Everything else', keywords: 'team board cards', act: { go: 'everything' as const } },
      { id: 'chats', label: 'Chats', keywords: 'groups messages people', act: { go: 'chats' as const } },
    ] : []),
    { id: 'progress', label: 'In progress', keywords: 'running working', act: { go: 'progress' } },
    { id: 'later', label: 'Later', keywords: 'snoozed scheduled', act: { go: 'snoozed' } },
    { id: 'done', label: 'Done', keywords: 'closed finished', act: { go: 'done' } },
    { id: 'filter', label: 'View and filters', keywords: 'board list sort', act: { go: 'inbox', menu: true } },
    ...(mates.length ? [{ id: 'new-mate', label: 'New teammate', keywords: 'hire ai', act: { push: '/teammate/new' } }] : []),
    ...mates.map((t) => ({ id: `mate-${t.id}`, label: t.name, aside: 'Teammate', keywords: 'chat message ai', act: { push: `/teammate/${t.id}` } })),
    ...mates.map((t) => ({ id: `teammate-pause-${t.id}`, label: `${t.paused ? 'Resume' : 'Pause'} ${t.name}`, keywords: 'teammate pause resume stop hold', act: { teammate: t.id, paused: !t.paused }, typed: true as const })),
    ...groups.map((g) => ({ id: `group-${g.id}`, label: g.name, aside: 'Group', keywords: 'chat room', act: { group: g.id } })),
    ...looks.map((l) => ({ id: `look-${l.id}`, label: l.name, aside: 'Appearance', keywords: 'theme look dark light', act: { look: l.id } })),
    ...pages.map((p) => ({ id: `page-${p.id}`, label: p.label, aside: 'Settings', keywords: 'settings', act: { push: `/settings/${p.id}` } })),
    ...(computer ? computerCommands(computer) : []),
    // The desktop's team list (Palette.tsx `team-list-shipped`).
    ...(team ? [{ id: 'team-list-shipped', label: 'What shipped this week', keywords: 'shipped live released launched what went out this week', act: { push: '/shipped' } }] : []),
  ];
}

/** Every command, or those a query finds, best first. */
export function commandsFor(query: string, commands: readonly PhoneCommand[]): PhoneCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands.filter((c) => !c.typed);
  return rankMatches(q, commands.filter((c) => matchesQuery(q, c)));
}

/** How many threads the box lists before "See all" (Palette.tsx `THREADS_SHOWN`). */
export const THREADS_SHOWN = 5;

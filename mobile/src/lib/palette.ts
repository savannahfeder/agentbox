// The magnifier opens ⌘K, drawn for a phone (renderer/src/components/Palette.tsx):
// threads first as you type, then the commands. These are the ones a phone has;
// the ones about a Mac or its keyboard were never offered here.
import { matchesQuery, rankMatches } from '../../../renderer/src/palette-rows';
import type { PlaceId } from './groups';
import type { PhoneLook } from './look';

export type Act = { go: PlaceId; menu?: boolean } | { push: string } | { look: PhoneLook } | { group: string };
export interface PhoneCommand { id: string; label: string; keywords?: string; aside?: string; act: Act }

export function phoneCommands({ team, mates = [], groups = [], looks = [], pages = [] }: {
  /** A team is on: In progress, Later and Done sit under Everything else. */
  team: boolean;
  mates?: readonly { id: string; name: string }[];
  groups?: readonly { id: string; name: string }[];
  looks?: readonly { id: PhoneLook; name: string }[];
  pages?: readonly { id: string; label: string }[];
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
    ...groups.map((g) => ({ id: `group-${g.id}`, label: g.name, aside: 'Group', keywords: 'chat room', act: { group: g.id } })),
    ...looks.map((l) => ({ id: `look-${l.id}`, label: l.name, aside: 'Appearance', keywords: 'theme look dark light', act: { look: l.id } })),
    ...pages.map((p) => ({ id: `page-${p.id}`, label: p.label, aside: 'Settings', keywords: 'settings', act: { push: `/settings/${p.id}` } })),
  ];
}

/** Every command, or those a query finds, best first. */
export function commandsFor(query: string, commands: readonly PhoneCommand[]): PhoneCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...commands];
  return rankMatches(q, commands.filter((c) => matchesQuery(q, c)));
}

/** How many threads the box lists before "See all" (Palette.tsx `THREADS_SHOWN`). */
export const THREADS_SHOWN = 5;

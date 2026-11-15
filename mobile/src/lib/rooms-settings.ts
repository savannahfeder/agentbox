// The Rooms page on the phone: the desktop's rows and words
// (renderer/src/team/rooms/RoomsSettings.tsx), and the same writes to your own
// room card that main/team/rooms.mts saveProfile, goInvisible and comeBack make.
// The Mac hears the change and sends its next presence by it.
import { displayNameOf } from '../../../shared/room-cards.mts';
import { invisibleNotice, sentence } from '../../../renderer/src/team/rooms/room-rules';
import { GROUP_COLS } from '../../../renderer/src/phone-groups';
import type { RoomProfile } from '../../../renderer/src/types';

export const ROOMS_SEARCH_ROWS = ['rooms/Show my full name', 'rooms/What you are working on', 'rooms/Your activity on your page', 'rooms/Go invisible'];

/** The desktop draws the page while Rooms is on. */
export const roomsPageShown = (settings: { workspace?: { alpha?: { rooms?: boolean } } } | null | undefined) => !!settings?.workspace?.alpha?.rooms;

export type RoomRowId = 'fullName' | 'working' | 'outside' | 'agents' | 'level' | 'status' | 'activity' | 'invisible';
export type RoomRow = { id: RoomRowId; label: string; on: boolean; desc: string | null };

export function roomCardGroups(me: RoomProfile, fullName: string, now: number): { label: string; rows: RoomRow[] }[] {
  const full = !!fullName.trim() && me.display_name === fullName.trim().split(/\s+/).join(' ');
  const working = me.show_working !== 'none';
  const invisible = invisibleNotice(me.invisible_until, now);
  const row = (id: RoomRowId, label: string, on: boolean, desc: string | null = null): RoomRow => ({ id, label, on, desc });
  return [
    { label: 'Your name', rows: [row('fullName', 'Show my full name', full, sentence(`${full ? 'On' : 'Off'}, rooms show you as ${me.display_name}`))] },
    { label: 'Your card', rows: [
      row('working', 'What you are working on', working, working ? null : 'Off, it reads Private thread. Your team still sees your shared threads on its board.'),
      ...(working ? [row('outside', 'Show it to people outside your team', me.show_working === 'everyone', me.show_working === 'everyone' ? 'On, everyone in your rooms sees the name and your activity.' : 'Off, they see Private thread and no activity.')] : []),
      row('agents', 'How many agents are running', !!me.show_agents),
      row('level', 'Your agent hours', !!me.show_level),
      row('status', 'Your status', !!me.show_status),
      row('activity', 'Your activity on your page', me.show_activity !== false, me.show_activity === false ? 'Off, people see only your progress.' : null),
    ] },
    { label: 'Invisible', rows: [row('invisible', 'Go invisible', !!invisible, invisible ?? 'Leave every room until you turn it off.')] },
  ];
}

// No end is "until I turn it off", held as a date ten years ahead (rooms.mts goInvisible).
const FOR_GOOD_MS = 3650 * 24 * 60 * 60_000;

/** What one switch writes to your card, or null for a switch or value the page does not have. */
export function roomCardPatch(id: string, on: unknown, { me, fullName, now }: { me: RoomProfile; fullName: string; now: number }): Partial<RoomProfile> | null {
  if (typeof on !== 'boolean') return null;
  switch (id) {
    case 'fullName': return { display_name: displayNameOf(fullName, { full: on }) || me.display_name || 'Someone' };
    case 'working': return { show_working: on ? 'everyone' : 'none' };
    case 'outside': return { show_working: on ? 'everyone' : 'team' };
    case 'agents': return { show_agents: on };
    case 'level': return { show_level: on };
    case 'status': return { show_status: on };
    case 'activity': return { show_activity: on };
    case 'invisible': return { invisible_until: on ? new Date(now + FOR_GOOD_MS).toISOString() : null };
    default: return null;
  }
}

type Rest = {
  session: () => { user: { id: string } } | null;
  select: (table: string, query: string) => Promise<unknown[]>;
  update: (table: string, query: string, patch: Record<string, unknown>) => Promise<unknown[]>;
};

const CHANGES = new Set(['display_name', 'show_working', 'show_agents', 'show_level', 'show_status', 'show_activity', 'invisible_until']);

function meOf(c: Rest): string {
  const id = c.session()?.user.id;
  if (!id) throw new Error('not signed in');
  return id;
}

/** Your card, or null until the computer has made it, and the name your account goes by. */
export async function readMyRoomCard(c: Rest): Promise<{ me: RoomProfile | null; fullName: string }> {
  const id = encodeURIComponent(meOf(c));
  const [cards, people] = await Promise.all([
    c.select('room_profiles', `select=${GROUP_COLS.profile}&person_id=eq.${id}&limit=1`),
    c.select('people', `select=name&id=eq.${id}&limit=1`),
  ]);
  // The card's columns are GROUP_COLS.profile, the RoomProfile shape.
  return { me: (cards[0] as RoomProfile | undefined) ?? null, fullName: String((people[0] as { name?: unknown } | undefined)?.name ?? '') };
}

export async function saveMyRoomCard(c: Rest, patch: Record<string, unknown>): Promise<RoomProfile> {
  const keys = Object.keys(patch);
  if (!keys.length || keys.some((k) => !CHANGES.has(k))) throw new Error('That is not part of your room card.');
  const saved = await c.update('room_profiles', `person_id=eq.${encodeURIComponent(meOf(c))}`, patch);
  if (!saved[0]) throw new Error('Your room card is not made yet.');
  return saved[0] as RoomProfile;
}

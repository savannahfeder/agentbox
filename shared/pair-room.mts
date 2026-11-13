/** What both Macs agree on about a room, from the cloud. */
export interface PairRoomFacts { id: string; kind: string; teamId: string | null; members: number; createdAt: number }

/** Everyone a room's view names: its wall and, where the cloud says, its people. */
export const listedIn = (r: { wall?: readonly { id: string }[]; people?: readonly { id: string }[] | null }): string[] =>
  [...(r.wall ?? []), ...(r.people ?? [])].map((p) => p.id);

/**
 * My two-person groups with this person, the one both Macs write to first.
 * Two can exist when both people start the chat in the same moment; ordering
 * by what the cloud stamped, not by list order, keeps both sides on one.
 */
export function pairRooms<R extends PairRoomFacts>(rooms: readonly R[], personId: string, peopleOf: (r: R) => readonly string[]): R[] {
  return rooms
    .filter((r) => r.kind === 'group' && !r.teamId && r.members === 2 && peopleOf(r).includes(personId))
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Messages from several rooms as one chat, oldest first. */
export function oneConversation<M extends { id: string; at: number }>(lists: readonly (readonly M[])[]): M[] {
  return lists.flat().sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type RoomNamed = { id: string; name: string };
export type RoomSaid = { id: string; by: string | null; body: string; at: number; mentions?: string[]; inReplyTo?: string | null; deleted?: boolean };
export type GroupRow = {
  id: string; messageId: string; roomId: string; roomName: string; by: string | null; byName: string; body: string; at: number;
  thread: 'yours' | 'theirs' | null; unread: boolean;
  /** Where a row about a file opens. */
  note?: string | null; file?: string | null;
};
export function groupFileRow(args: {
  roomId: string; roomName: string; marks?: readonly { id: string; by: string | null; mark: object; at: number }[]; me: string | null; myName?: string | null;
  doneAt?: number; nameOf?: (id: string | null) => string;
}): GroupRow | null;
export function mentionsIn(body: string, people: readonly RoomNamed[]): string[];
export function addressedByOpening(body: string, people: readonly RoomNamed[]): string[];
export function groupRow(args: {
  roomId: string; roomName: string; messages?: readonly RoomSaid[]; mentioned?: readonly RoomSaid[]; me: string | null;
  people?: readonly RoomNamed[]; doneAt?: number; answeredAt?: number; readAt?: number; nameOf?: (id: string | null) => string;
}): GroupRow | null;

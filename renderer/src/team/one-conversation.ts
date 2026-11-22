// Two people have one conversation while Rooms is live: their Rooms chat, on
// the person's page. The older direct record is kept for what a chat cannot
// carry and for whatever was said there before.
import { personChatOpens } from './everything/place';

/** Where a message from the New thread card goes. */
export type MessageGoes = 'task' | 'chat' | 'direct';

export function whereAMessageGoes({ asTask, people, chat, level, subject, threadLinks }: {
  asTask: boolean;
  /** How many people it is to. */
  people: number;
  /** Rooms is live, so a chat with one person can take it. */
  chat: boolean;
  /** A level only goes when someone picked one. */
  level: number | undefined;
  subject: string;
  /** It names threads with @, which only the direct record draws as links. */
  threadLinks: boolean;
}): MessageGoes {
  if (asTask) return 'task';
  if (!chat || people !== 1 || level !== undefined || subject || threadLinks) return 'direct';
  return 'chat';
}

/** What pressing a person opens: their page, or with Rooms off a newer direct record. */
export function personPressOpens({ roomsLive, direct, room }: {
  roomsLive: boolean; direct: { at: number } | null; room: { at: number } | null;
}): 'place' | 'direct' {
  if (roomsLive) return 'place';
  return personChatOpens(direct, room) === 'direct' ? 'direct' : 'place';
}

/**
 * Where the chat goes on a person's page. Until the groups have been read, the
 * one with them may exist unseen, so the page says nothing rather than "first
 * message", and offers no box that would start a second chat.
 */
export function personChatShows({ roomsLive, ready, room }: {
  roomsLive: boolean; ready: boolean; room: boolean;
}): 'chat' | 'not yet' | 'first message' | 'off' {
  if (!roomsLive) return 'off';
  if (room) return 'chat';
  return ready ? 'first message' : 'not yet';
}

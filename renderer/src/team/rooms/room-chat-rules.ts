// PURE. The rules a room's chat draws by (./RoomChat.tsx): where the New line
// goes, which messages are drawn, how an @name is marked, and the name a file
// is stored under.
import type { RoomMessage } from '../../types';
import { markMentions } from './room-rules';

/**
 * The first message to sit under the New line: the oldest one in the chat
 * (not in a thread) written by someone else after where you had read to.
 * Null when there is nothing new.
 */
export function newLineAt(messages: readonly RoomMessage[], readAt: number | null | undefined, me: string | null): string | null {
  if (readAt == null) return null;
  const first = messages.find((m) => !m.inReplyTo && !m.deleted && m.at > readAt && m.by !== me);
  return first?.id ?? null;
}

/** A deleted message is drawn only while replies hang off it, as a line saying so. */
export function drawnRoots(messages: readonly RoomMessage[]): RoomMessage[] {
  const answered = new Set(messages.map((m) => m.inReplyTo).filter(Boolean));
  return messages.filter((m) => !m.inReplyTo && (!m.deleted || answered.has(m.id)));
}

/**
 * The message as markdown, each @name made a mention link so it can be drawn
 * as one, when it is a whole word. `me` is what you answer to in it, your
 * name and first name, and those are told apart.
 */
export function mentionMarkdown(body: string, names: readonly string[], me: readonly string[] = []): string {
  const mine = new Set(me.filter(Boolean).map((n) => `@${n}`.toLowerCase()));
  const parts = markMentions(body, [...names, ...me]);
  return parts.map((part, i) => {
    if (!part.mention || /^[\p{L}\p{N}]/u.test(parts[i + 1]?.text ?? '')) return part.text;
    return `[${part.text}](${mine.has(part.text.toLowerCase()) ? '#mention-me' : '#mention'})`;
  }).join('');
}

/** The name a file sent in a room is stored under: unique, and still ending in its own name. */
export function storedName(name: string, now = Date.now(), rand = Math.random().toString(36).slice(2, 8)): string {
  const safe = String(name || 'file').replace(/[^\w.-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 80) || 'file';
  return `${now.toString(36)}-${rand}-${safe}`;
}

/**
 * Whether the open room holds off reading itself. Marking it unread, from a
 * message or from the list, holds it until you leave; marking it read again
 * lets go. Opening a room already marked unread does not hold: opening it is
 * reading it.
 */
export function holdsRead(held: boolean, wasMarked: boolean, isMarked: boolean): boolean {
  if (isMarked && !wasMarked) return true;
  if (!isMarked && wasMarked) return false;
  return held;
}

/** How long a room stays in front of you before it counts as read: longer than
 *  Tab resting on its tab on the way past, so walking the tabs reads nothing. */
export const READ_AFTER_MS = 2000;

/**
 * Reads the open room once it has been on screen for READ_AFTER_MS, then each
 * new message as it arrives. `open` starts the wait (the room drawn, the
 * window back in front), `away` drops it, `close` stops. `canRead` is asked
 * at the moment of reading.
 */
export function roomReader({ read, canRead, wait = READ_AFTER_MS }: { read: () => void; canRead: () => boolean; wait?: number }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stayed = false;
  const stop = () => { clearTimeout(timer); timer = undefined; stayed = false; };
  return {
    open() {
      stop();
      timer = setTimeout(() => { timer = undefined; stayed = true; if (canRead()) read(); }, wait);
    },
    arrived() { if (stayed && canRead()) read(); },
    away: stop,
    close: stop,
  };
}

/** My messages in the room with these words in this place, by id. */
export function sameMessages(messages: readonly RoomMessage[], m: { by: string | null; body: string; inReplyTo: string | null }): RoomMessage[] {
  return messages.filter((x) => x.by === m.by && !x.deleted && x.body === m.body && (x.inReplyTo ?? null) === (m.inReplyTo ?? null));
}

/**
 * Whether a message tried before is already in the room: mine, the same words
 * in the same place, and not one that was already there when it was first
 * tried, so saying "ok" twice is never mistaken for one "ok" landing.
 */
export function landed(messages: readonly RoomMessage[], m: { by: string | null; body: string; inReplyTo: string | null; before: ReadonlySet<string> }): boolean {
  return sameMessages(messages, m).some((x) => !m.before.has(x.id));
}

/**
 * The words left in the box once a send of `sent` lands: none if the box
 * still says just that, what was typed after it if it was added to, and the
 * box as it is if it was rewritten while sending.
 */
export function wordsLeftAfterSend(now: string, sent: string): string {
  if (now === sent) return '';
  if (sent && now.startsWith(sent)) return now.slice(sent.length).replace(/^\s+/, '');
  return now;
}

/** The bar's quick emoji take half a side panel's width, so only a full-width chat shows them, and not in a thread. */
export function quickOnBar({ full, thread }: { full: boolean; thread: boolean }): boolean {
  return full && !thread;
}

/** The newest message of mine in the chat itself, for ↑ in an empty box. */
export function myNewest(messages: readonly RoomMessage[], me: string | null, inReplyTo: string | null = null): RoomMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.by === me && !m.deleted && (m.inReplyTo ?? null) === inReplyTo) return m;
  }
  return null;
}

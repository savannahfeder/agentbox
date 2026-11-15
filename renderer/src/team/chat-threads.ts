// PURE. THREADS IN A CHAT WITH TEAMMATES (w-920461cbe6), "like in Slack".
//
// A reply in a thread is an ordinary message line that also names the message
// it answers (`inReplyTo`, that message's line uid). This file decides three
// things about them and nothing else: which messages leave the chat for a
// thread, what the one line under a message with replies says, and how wide
// the panel beside the chat may be dragged. Drawn by ../components/Thread.tsx
// and ./ThreadPanel.tsx, pinned by tests/a-reply-in-a-thread-sits-beside-the-chat.
//
// The pick, in the person's words: "Yeah, definitely agree with the panel
// beside the chat. I think in Slack you can resize this so we might want to
// allow resizing."
import { agoWords } from '../threads/summary-rules';
import type { AgentEvent, AgentTurn } from '../types';
import type { Waits } from '../../../shared/team-rules.mts';

/**
 * Lift the replies out of a chat. A reply whose message is in this chat goes
 * under that message's uid, oldest first; one whose message is nowhere here (a
 * page not arrived yet, a line from a newer build) stays in the chat, because
 * somebody's words drawn in the wrong place beat somebody's words not drawn.
 */
export function liftReplies(events: AgentEvent[]): { events: AgentEvent[]; replies: Record<string, AgentTurn[]> } {
  const isTurn = (e: AgentEvent): e is AgentTurn => e.kind !== 'work';
  const parents = new Set(events.filter(isTurn).filter((e) => e.uid && !e.inReplyTo).map((e) => e.uid!));
  const replies: Record<string, AgentTurn[]> = {};
  const kept: AgentEvent[] = [];
  for (const e of events) {
    if (isTurn(e) && e.inReplyTo && parents.has(e.inReplyTo)) {
      (replies[e.inReplyTo] ??= []).push(e);
      continue;
    }
    kept.push(e);
  }
  return { events: kept, replies };
}

/** How many faces the line under a message shows before it stops. */
const FACES = 3;

/**
 * THE LINE UNDER A MESSAGE WITH REPLIES: "3 replies", the faces of the people
 * who replied (once each, the most recent three, in the order they spoke), and
 * "Last reply 33 min ago". Faces are person ids; the drawing looks them up.
 */
export function threadLine(replies: readonly AgentTurn[], now = Date.now()): { count: string; faces: string[]; last: string } {
  const n = replies.length;
  const count = `${n} ${n === 1 ? 'reply' : 'replies'}`;
  const faces: string[] = [];
  for (let k = replies.length - 1; k >= 0 && faces.length < FACES; k -= 1) {
    const who = replies[k].by ?? 'you';
    if (!faces.includes(who)) faces.push(who);
  }
  faces.reverse();
  const newest = replies.reduce((at, r) => Math.max(at, r.at ?? 0), 0);
  // agoWords capitalises "Yesterday" to open a row of its own; here it is in
  // the middle of a sentence.
  const when = agoWords(newest, now);
  const last = n ? `Last reply ${/^[A-Z]/.test(when) ? when[0].toLowerCase() + when.slice(1) : when}` : '';
  return { count, faces, last };
}

/**
 * HOW WIDE THE PANEL MAY BE. `start` is the drawn width. `min` keeps a reply
 * readable; `max` stops a very wide window from making the thread the page;
 * `chat` is what the conversation always keeps beside it, so dragging the
 * panel all the way across never eats the chat it belongs to.
 *
 * `start` WAS 440 (w-140ac855b1, 2026-10-13): "the space for the reply and
 * thread area could be a little bigger". At 480 the reply box carries the
 * chat's whole formatting bar and Send without dropping any of it.
 */
export const THREAD_WIDTH = { start: 480, min: 320, max: 760, chat: 560 } as const;

/** The width to draw, given what was dragged to and how wide the pane is. */
export function clampThreadWidth(width: number, pane: number): number {
  const most = Math.min(THREAD_WIDTH.max, pane - THREAD_WIDTH.chat);
  const want = Number.isFinite(width) ? width : THREAD_WIDTH.start;
  return Math.round(Math.max(THREAD_WIDTH.min, Math.min(want, most)));
}

/** Where the dragged width is kept, so the panel opens at it next time. */
export const THREAD_WIDTH_KEY = 'zero.chatThreadWidth';

/**
 * WHICH THREAD OPENS BY ITSELF WHEN YOU OPEN A CHAT: the one thread waiting on
 * you, when it is the only news (w-920461cbe6). With news in the chat too, the
 * chat stays in front and the thread is marked; with two threads waiting, which
 * to read first is yours to choose.
 */
export function threadToOpen(waits: Waits | null): string | null {
  return waits && waits.chat === 0 && waits.threads.length === 1 ? waits.threads[0].uid : null;
}

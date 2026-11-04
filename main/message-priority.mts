// A MESSAGE FROM A TEAMMATE IS SORTED BY HOW URGENT IT IS (2026-10-01): the
// agent reads each message and gives it a priority, so the reader does not
// have to.
//
// A message is made with priority 0 and nothing ever moved it, so the inbox's
// priority sort could not tell "the checkout page is down" from "thanks!". Now
// the Mac the message waits on asks the same small model the namer uses
// (main/row-label.mts) for one of the four levels, once per message, and
// writes it onto the row as an agent. A level the person set by hand wins, by
// the fold's own rule, and this does not ask again after one.
import { askSmallModel } from './row-label.mts';
import { isTaskRow } from '../shared/team-rules.mjs';

/** The four words, onto the app's own values (renderer/src/priority.ts). */
export const LEVELS: Record<string, number> = { urgent: 9, high: 7, medium: 5, low: 2 };

interface Wrote { by?: string | null; ts: number; source?: string }
export interface MessageItem {
  agent?: unknown;
  status?: string;
  assignee?: string | null;
  answer?: string | null;
  body?: string | null;
  priority?: number;
  labels?: string[];
  wrote?: { answer?: Wrote; body?: Wrote; priority?: Wrote };
}
export interface MessageProduct { team?: { direct?: unknown } | null }
export interface LatestMessage { text: string; by: string | null; ts: number }

const LIVE = new Set<string | undefined>(['open', 'claimed', 'blocked']);

/**
 * PURE. The newest message on a conversation: its words, who wrote it and
 * when. A reply is the newest when there is one; otherwise the opening body.
 */
export function latestMessage(item?: MessageItem | null): LatestMessage | null {
  const a = item?.wrote?.answer;
  const b = item?.wrote?.body;
  const answered = !!a && !!item?.answer && item.answer !== '(withdrawn)' && (!b || a.ts >= b.ts);
  const w = answered ? a : b;
  const text = String((answered ? item.answer : item?.body) ?? '').trim();
  if (!w || !text) return null;
  return { text, by: w.by ?? null, ts: w.ts ?? 0 };
}

/**
 * PURE. Does this row hold a message for me to sort? Only a conversation that
 * is still going, waiting on me, whose newest message someone else wrote, and
 * which has not been sorted since that message. Never one whose priority the
 * person set by hand: the fold keeps theirs over ours, so asking would only
 * repeat forever.
 */
export function wantsPriority(item: MessageItem | null | undefined, product: MessageProduct | null | undefined, me?: string | null): boolean {
  if (!me || !item || item.agent) return false;
  if (!product?.team?.direct || isTaskRow(item)) return false;
  if (!LIVE.has(item.status)) return false;
  if (item.assignee !== me) return false;
  const latest = latestMessage(item);
  if (!latest || !latest.by || latest.by === me) return false;
  const set = item.wrote?.priority;
  if (set?.source === 'founder') return false;
  // AND NEVER OVER THE LEVEL THE SENDER PICKED (w-7ba439c883). A message now
  // crosses carrying how urgent the person who wrote it thought it was, and a
  // guess from here would overwrite it: the sender's line is composeItem's, so
  // it claims no authority the fold would defend, and a guess from here is not
  // what the sender said.
  // A row nobody chose a level for is composeItem's 0, so a number above it is
  // exactly "somebody picked one", and `by` says it was not this Mac.
  if (set?.by && set.by !== me && Number.isFinite(item.priority) && item.priority! > 0) return false;
  return !(set && set.source !== 'system' && set.ts >= latest.ts);
}

/** PURE. The one question, about the message alone, cut short. */
export function priorityPrompt(latest?: { text?: unknown } | null): string {
  const text = String(latest?.text ?? '').replace(/\r/g, '').trim().slice(0, 1500);
  return [
    'A teammate sent this message to the person you work for. How soon do they',
    'need to read it and answer? Reply with one word: urgent, high, medium or low.',
    '',
    'urgent: something is broken or blocked now, or it is due within hours.',
    'high: it needs an answer today.',
    'medium: an ordinary question or request.',
    'low: a thank you, an FYI or a social note that needs no answer.',
    '',
    '--- message ---',
    text,
    '---',
  ].join('\n');
}

/** PURE. The model's reply as one of the four words, or '' when it is not one. */
export function cleanPriority(text: unknown): string {
  const first = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  const word = first.replace(/^["'`“”‘’]+|["'`“”‘’.!]+$/g, '').trim().toLowerCase();
  return Object.hasOwn(LEVELS, word) ? word : '';
}

/** Ask the small model about one message. '' on every failure, never a throw. */
export function sortMessage(latest: LatestMessage | null, opts: Parameters<typeof askSmallModel>[2] = {}) {
  return askSmallModel(priorityPrompt(latest), cleanPriority, opts);
}

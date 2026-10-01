// A MESSAGE FROM A TEAMMATE IS SORTED BY HOW URGENT IT IS (w-2ad23ca814,
// asked for 2026-10-01: "it would be nice if the agent categorized priority,
// read the messages and categorized them for me in terms of priority").
//
// A message is made with priority 0 and nothing ever moved it, so the inbox's
// priority sort could not tell "the checkout page is down" from "thanks!". Now
// the Mac the message waits on asks the same small model the namer uses
// (main/row-label.mjs) for one of the four levels, once per message, and
// writes it onto the row as an agent. A level the person set by hand wins, by
// the fold's own rule, and this does not ask again after one.
import { askSmallModel } from './row-label.mjs';

/** The four words, onto the app's own values (renderer/src/priority.ts). */
export const LEVELS = { urgent: 9, high: 7, medium: 5, low: 2 };

const LIVE = new Set(['open', 'claimed', 'blocked']);

/**
 * PURE. The newest message on a conversation: its words, who wrote it and
 * when. A reply is the newest when there is one; otherwise the opening body.
 */
export function latestMessage(item) {
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
export function wantsPriority(item, product, me) {
  if (!me || !item || item.agent) return false;
  if (!product?.team?.direct) return false;
  if (!LIVE.has(item.status)) return false;
  if (item.assignee !== me) return false;
  const latest = latestMessage(item);
  if (!latest || !latest.by || latest.by === me) return false;
  const set = item.wrote?.priority;
  if (set?.source === 'founder') return false;
  return !(set && set.source !== 'system' && set.ts >= latest.ts);
}

/** PURE. The one question, about the message alone, cut short. */
export function priorityPrompt(latest) {
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
export function cleanPriority(text) {
  const first = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  const word = first.replace(/^["'`“”‘’]+|["'`“”‘’.!]+$/g, '').trim().toLowerCase();
  return Object.hasOwn(LEVELS, word) ? word : '';
}

/** Ask the small model about one message. '' on every failure, never a throw. */
export function sortMessage(latest, opts = {}) {
  return askSmallModel(priorityPrompt(latest), cleanPriority, opts);
}

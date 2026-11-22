// A CHAT BROUGHT IN FROM CLAUDE CODE, REWRITTEN THE WAY EVERY THREAD HERE READS:
// a name, a few sentences of context, what the person needs to decide, and
// three options. One small-model call rather than an agent run resuming the
// chat, so it lands on any account or engine with room
// (tests/an-imported-chat-is-rewritten-the-way-every-thread-reads).

import { askSmallModel, NAME_MODEL } from './row-label.mts';
import type { SmallModelOptions } from './row-label.mts';
import { saysItStopped } from '../shared/carried-on-outside.mts';

/** A rewrite writes more than a name, so it gets longer than the namer's 90s. */
export const CATCH_UP_TIMEOUT_MS = 150_000;

const cut = (s: unknown, n: number) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);

/** `saidOutside` is what the person last typed where the chat started
 *  (main/chat-follow.mts), and `earlier` the turns before it. Without the
 *  project the model guessed the folder from the person's own Claude Code settings. */
export interface CatchUpItem { body?: string | null; title?: string | null; result?: string | null; saidOutside?: string | null; project?: string | null; earlier?: string[] }

export const EARLIER_MOST = 6;
const TURN_CHARS = 700;
// Its end is where a turn asks, and the gap is said: a draft cut short was
// taken for one its agent never finished.
const shortTurn = (s: unknown) => {
  const text = cut(s, Infinity);
  return text.length <= TURN_CHARS ? text : `${text.slice(0, 300)} [left out here] ${text.slice(-380)}`;
};

/** The turns of a chat carried on where it started, after its opening and
 *  before the last thing typed there, off the row's history. A write-up is
 *  never a turn. */
export function turnsBefore(lines: readonly { source?: unknown; patch?: Record<string, unknown> | null }[]): string[] {
  const turns: string[] = [];
  let lastYours = 0;
  for (const { source, patch } of lines) {
    if (source === 'founder' && typeof patch?.saidOutside === 'string') {
      lastYours = turns.length;
      turns.push(`Person: ${shortTurn(patch.saidOutside)}`);
    } else if (source === 'agent' && typeof patch?.result === 'string' && !patch.problem && !saysItStopped(patch.result)) {
      turns.push(`Agent: ${shortTurn(patch.result)}`);
    }
  }
  return turns.slice(0, lastYours).slice(-EARLIER_MOST);
}

export interface CatchUpCard { title: string; context: string; ask: string; said: string; options: string[] }

export function catchUpPrompt(item: CatchUpItem | null | undefined) {
  return [
    'A conversation between a person and a coding agent has been brought into an inbox',
    'that shows each thread as a short card, not as a chat. Rewrite where it stands now as',
    'that card, written as the agent speaking to the person ("I found", "Should I").',
    'Plain words, no markdown, no code, no file paths unless one is the point.',
    '',
    'Reply with one JSON object and nothing else:',
    '{',
    '  "title": "3 to 7 words naming the work, sentence case",',
    '  "context": "what this conversation is about, for someone who has forgotten it: what the person asked for and why, in their words, 2 or 3 sentences, 45 words at most; where it stands goes in said, not here",',
    '  "ask": "the one thing the person needs to decide now, as a plain question naming the choice, under 15 words",',
    '  "said": "2 to 3 short sentences on what you found or did and what you propose",',
    '  "options": ["three options: the next steps the person could pick, the one the agent would recommend first, each under 12 words"]',
    '}',
    '',
    ...(cut(item?.project, 120) ? ['--- the project ---', cut(item?.project, 120)] : []),
    '--- the person opened with ---',
    cut(item?.body || item?.title, 1500),
    ...(item?.earlier?.length ? ['--- then, oldest first ---', ...item.earlier] : []),
    ...(cut(item?.saidOutside, 1500) ? ['--- the person then said ---', cut(item?.saidOutside, 1500)] : []),
    '--- the agent last said ---',
    cut(item?.result, 5000) || '(nothing)',
    '---',
  ].join('\n');
}

const line = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** PURE. A reply is a card only with every part and at least two options; '' otherwise. */
export function cleanCatchUp(text: unknown): CatchUpCard | '' {
  const raw = String(text ?? '');
  const from = raw.indexOf('{');
  const to = raw.lastIndexOf('}');
  if (from < 0 || to <= from) return '';
  let got: Record<string, unknown> | null;
  try { got = JSON.parse(raw.slice(from, to + 1)); } catch { return ''; }
  const card = {
    title: line(got?.title).replace(/[.。]+$/, ''),
    context: line(got?.context),
    ask: line(got?.ask),
    said: line(got?.said),
    options: (Array.isArray(got?.options) ? got.options : []).map((o) => line(o).replace(/\s*\(recommended\)$/i, '')).filter(Boolean).slice(0, 3),
  };
  if (!card.title || card.title.length > 64 || !card.context || !card.ask || !card.said || card.options.length < 2) return '';
  return card;
}

/** The answer as every worker writes one: the ask in bold, the words, then the options. */
export function catchUpResult(card: CatchUpCard) {
  return [
    `**${card.ask.replace(/\*+/g, '')}**`,
    '',
    card.said,
    '',
    '## Options',
    ...card.options.map((o, i) => `${i + 1}. ${o}${i === 0 ? ' (recommended)' : ''}`),
  ].join('\n');
}

/** One rewrite. Resolves to a card, or '' for every failure, never a throw. */
export function catchUpRow(item: CatchUpItem | null | undefined, opts: SmallModelOptions = {}) {
  return askSmallModel(catchUpPrompt(item), cleanCatchUp as (text: string) => string, { model: NAME_MODEL, timeoutMs: CATCH_UP_TIMEOUT_MS, ...opts });
}

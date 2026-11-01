// A CHAT BROUGHT IN FROM CLAUDE CODE, REWRITTEN THE WAY EVERY THREAD HERE READS:
// a name, a few sentences of context, what the person needs to decide, and
// three options. One small-model call rather than an agent run resuming the
// chat, so it lands on any account or engine with room
// (tests/an-imported-chat-is-rewritten-the-way-every-thread-reads).

import { askSmallModel, NAME_MODEL } from './row-label.mjs';

/** A rewrite writes more than a name, so it gets longer than the namer's 90s. */
export const CATCH_UP_TIMEOUT_MS = 150_000;

const cut = (s, n) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);

export function catchUpPrompt(item) {
  return [
    'A conversation between a person and a coding agent has been brought into an inbox',
    'that shows each thread as a short card, not as a chat. Rewrite where it stands as',
    'that card, written as the agent speaking to the person ("I found", "Should I").',
    'Plain words, no markdown, no code, no file paths unless one is the point.',
    '',
    'Reply with one JSON object and nothing else:',
    '{',
    '  "title": "3 to 7 words naming the work, sentence case",',
    '  "context": "what this conversation is about and where it stands, 2 or 3 sentences, 45 words at most",',
    '  "ask": "the one thing the person needs to decide now, as a plain question naming the choice, under 15 words",',
    '  "said": "2 to 3 short sentences on what you found or did and what you propose",',
    '  "options": ["three options: the next steps the person could pick, the one the agent would recommend first, each under 12 words"]',
    '}',
    '',
    '--- the person opened with ---',
    cut(item?.body || item?.title, 1500),
    '--- the agent last said ---',
    cut(item?.result, 5000) || '(nothing)',
    '---',
  ].join('\n');
}

const line = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** PURE. A reply is a card only with every part and at least two options; '' otherwise. */
export function cleanCatchUp(text) {
  const raw = String(text ?? '');
  const from = raw.indexOf('{');
  const to = raw.lastIndexOf('}');
  if (from < 0 || to <= from) return '';
  let got;
  try { got = JSON.parse(raw.slice(from, to + 1)); } catch { return ''; }
  const card = {
    title: line(got?.title).replace(/[.。]+$/, ''),
    context: line(got?.context),
    ask: line(got?.ask),
    said: line(got?.said),
    options: (Array.isArray(got?.options) ? got.options : []).map(line).filter(Boolean).slice(0, 3),
  };
  if (!card.title || card.title.length > 64 || !card.context || !card.ask || !card.said || card.options.length < 2) return '';
  return card;
}

/** The answer as every worker writes one: the ask in bold, the words, then the options. */
export function catchUpResult(card) {
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
export function catchUpRow(item, opts = {}) {
  return askSmallModel(catchUpPrompt(item), cleanCatchUp, { model: NAME_MODEL, timeoutMs: CATCH_UP_TIMEOUT_MS, ...opts });
}

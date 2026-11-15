// THE EMOJI YOU USED LAST COME FIRST (w-0d55a2b160).
//
// In the person's words: "it would be nice if it worked like Slack does with
// emoji responses: it remembers your most recent ones and then gives them as
// the first options ... I'm always searching for the same emojis over and
// over."
//
// Measured before: the short row was a fixed list (ChatActions.tsx
// `CHAT_EMOJI`, 👍 🙏 👀 ✅ 🎉 ❤️ 😄 🤔) and nothing anywhere recorded a pick,
// so 🔥 picked from the full list ten times was still behind the + and the
// search box the eleventh.
//
// Now every pick — a reaction, or an emoji put into a message — is remembered
// on this Mac, newest first, and the short row and the top of the full list
// open on them, the fixed list filling whatever is left.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { used, quickRow, readRecent, rememberEmoji, chipPressed, RECENT_KEY } from '../renderer/src/team/recent-emoji.ts';
import { CHAT_EMOJI, EmojiPick, Reactions } from '../renderer/src/team/ChatActions.tsx';

const storeOf = (init = {}) => {
  const data = { ...init };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
};

describe('remembering a pick', () => {
  it('puts the newest first and does not list one twice', () => {
    expect(used([], '🔥')).toEqual(['🔥']);
    expect(used(['👍', '🔥'], '🔥')).toEqual(['🔥', '👍']);
    expect(used(['👍', '🔥'], '💯')).toEqual(['💯', '👍', '🔥']);
  });

  it('keeps a bounded number', () => {
    const many = Array.from({ length: 40 }, (_, i) => String.fromCodePoint(0x1f600 + i));
    expect(used(many, '🔥').length).toBe(24);
    expect(used(many, '🔥')[0]).toBe('🔥');
  });

  it('survives in storage, and reads nothing from a store that holds junk', () => {
    const store = storeOf();
    rememberEmoji('🔥', store);
    rememberEmoji('💯', store);
    expect(readRecent(store)).toEqual(['💯', '🔥']);
    expect(readRecent(storeOf({ [RECENT_KEY]: 'not json' }))).toEqual([]);
    expect(readRecent(storeOf({ [RECENT_KEY]: '[1, "🔥", null]' }))).toEqual(['🔥']);
    expect(readRecent(undefined)).toEqual([]);
  });
});

describe('the short row', () => {
  it('opens on your recent ones, then the usual ones, the same length as before', () => {
    expect(quickRow(['🔥', '💯'], CHAT_EMOJI)).toEqual(['🔥', '💯', ...CHAT_EMOJI.slice(0, CHAT_EMOJI.length - 2)]);
  });

  it('does not show one twice when a recent one is also a usual one', () => {
    const row = quickRow(['👀', '🔥'], CHAT_EMOJI);
    expect(row.slice(0, 2)).toEqual(['👀', '🔥']);
    expect(new Set(row).size).toBe(row.length);
    expect(row.length).toBe(CHAT_EMOJI.length);
  });

  // THE CASE THAT MUST STAY AS IT WAS: nobody has picked anything yet.
  it('is the usual list when nothing has been picked', () => {
    expect(quickRow([], CHAT_EMOJI)).toEqual(CHAT_EMOJI);
  });

  it('is what the picker draws', () => {
    const was = globalThis.localStorage;
    globalThis.localStorage = storeOf({ [RECENT_KEY]: JSON.stringify(['🔥']) });
    try {
      const html = renderToStaticMarkup(createElement(EmojiPick, { onPick: () => {}, onClose: () => {} }));
      const drawn = [...html.matchAll(/class="chat-emoji-one" title="([^"]+)"/g)].map((m) => m[1]);
      expect(drawn[0]).toBe('🔥');
      expect(drawn.length).toBe(CHAT_EMOJI.length);
    } finally {
      globalThis.localStorage = was;
    }
  });
});

describe('adding yourself to a reaction already there', () => {
  it('counts as using it, and taking yours off does not', () => {
    const store = storeOf();
    chipPressed('🔥', false, store);
    expect(readRecent(store)).toEqual(['🔥']);
    chipPressed('💯', true, store);
    expect(readRecent(store)).toEqual(['🔥']);
  });

  it('is what a chip does when pressed', () => {
    const src = fs.readFileSync(new URL('../renderer/src/team/ChatActions.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/chipPressed\(emoji, mine\)/);
    // Still drawn as it was.
    const html = renderToStaticMarkup(createElement(Reactions, { on: { '🔥': ['p-a'] }, me: 'p-me', onReact: () => {} }));
    expect(html).toContain('🔥');
  });
});

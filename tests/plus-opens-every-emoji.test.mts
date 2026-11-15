// PLUS OPENS EVERY EMOJI.
//
// Asked for 2026-10-05 (w-45cbac227a): "It'd be great if, like in Slack and
// anywhere else, you can typically hit Plus and then see a more complete list
// of emojis. We don't necessarily need everything." The plate under React held
// eight emoji and nothing else; anything outside them could only be typed into
// a message, never put on one.
//
// So the eight stay where they were, a ninth square says +, and it opens a
// panel of about three hundred in the usual groups, with a box to find one by
// name. The panel floats over the page rather than inside the message, because
// the thread panel scrolls and clips anything that hangs out of it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmojiPick, EveryEmoji, CHAT_EMOJI } from '../renderer/src/team/ChatActions.tsx';
import { EMOJI_GROUPS, findEmoji } from '../renderer/src/team/emoji-list.ts';

const noop = () => {};

describe('the short list', () => {
  const html = renderToStaticMarkup(React.createElement(EmojiPick, { onPick: noop, onClose: noop }));

  it('still offers the eight, in their order', () => {
    const shown = [...html.matchAll(/class="chat-emoji-one"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(shown).toEqual(CHAT_EMOJI);
  });

  it('ends with a + that opens the rest', () => {
    expect(html).toMatch(/class="chat-emoji-one chat-emoji-more"[^>]*aria-label="More emoji"[^>]*aria-expanded="false"/);
  });
});

describe('the whole list', () => {
  const html = renderToStaticMarkup(React.createElement(EveryEmoji, { onPick: noop }));
  const all = EMOJI_GROUPS.flatMap((g) => g.emoji.map(([e]) => e));

  it('is a lot more than eight, and has every group under its name', () => {
    expect(all.length).toBeGreaterThan(250);
    for (const g of EMOJI_GROUPS) expect(html).toContain(`>${g.name}<`);
  });

  it('draws every emoji once', () => {
    const drawn = [...html.matchAll(/class="chat-emoji-cell"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(drawn).toEqual(all);
    expect(new Set(all).size).toBe(all.length);
  });

  it('has a box to find one by name, and a jump to each group', () => {
    expect(html).toMatch(/<input[^>]*class="chat-emoji-search"[^>]*placeholder="Search emoji"/);
    expect([...html.matchAll(/class="chat-emoji-tab"/g)]).toHaveLength(EMOJI_GROUPS.length);
  });

  it('contains the eight from the short list, so nothing is lost by opening it', () => {
    for (const e of CHAT_EMOJI) expect(all).toContain(e);
  });
});

describe('finding one by name', () => {
  it('finds by the words you would type', () => {
    expect(findEmoji('thumbs').map(([e]) => e)).toEqual(['👍', '👎']);
    expect(findEmoji('party').map(([e]) => e)).toEqual(expect.arrayContaining(['🥳', '🎉']));
    expect(findEmoji('ROCKET').map(([e]) => e)).toEqual(['🚀']);
  });

  it('puts a word that starts with it ahead of a word that only holds it', () => {
    const ok = findEmoji('ok').map(([e]) => e);
    expect(ok.indexOf('👌')).toBeLessThan(ok.indexOf('📖'));
  });

  // THE CASES THAT MUST FIND NOTHING.
  it('finds nothing for nothing, or for words no emoji has', () => {
    expect(findEmoji('')).toEqual([]);
    expect(findEmoji('   ')).toEqual([]);
    expect(findEmoji('qqzx')).toEqual([]);
  });
});

describe('Escape inside the whole list', () => {
  // The pane takes Escape at the window to close the thread; inside the
  // picker's search box it must close the picker and leave the thread alone.
  it('is left to the picker by the pane', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toMatch(/closest\?\.\('[^']*\.chat-emoji-all/);
  });
});

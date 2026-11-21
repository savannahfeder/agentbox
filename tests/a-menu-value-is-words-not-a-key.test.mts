// A MENU VALUE IS WORDS, NOT A KEY (w-f702d60afe, 2026-11-21).
//
// A screen review of the thread's dots menu: "Medium" beside Priority and
// "Only you" beside Who can open it were drawn in the mono key-cap style the
// shortcut "Ctrl+J" uses, so a value read as a key to press.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadMenuList } from '../renderer/src/threads/ThreadMenu.tsx';
import { ShareList } from '../renderer/src/threads/SharePanel.tsx';
globalThis.React = React;

describe('a row in the thread menu', () => {
  it('draws its value as words and its shortcut as a key', () => {
    const html = renderToStaticMarkup(React.createElement(ThreadMenuList, { rows: [
      { id: 'priority', label: 'Priority', key: null, detail: 'Medium' },
      { id: 'terminal', label: 'Open terminal', key: '⌘J' },
    ], change: null, onPick() {} } as never));
    expect(html).toContain('<span class="ts-more-detail">Medium</span>');
    expect(html).not.toContain('<kbd>Medium</kbd>');
    expect(html).toMatch(/<kbd>[^<]*J<\/kbd>/);
  });
  it('says who can open it in words', () => {
    const html = renderToStaticMarkup(React.createElement(ShareList, { link: true, others: true, seen: 'Only you', onCopy() {}, onSendOther() {}, onSee() {} } as never));
    expect(html).toContain('<span class="ts-more-detail">Only you</span>');
  });
});

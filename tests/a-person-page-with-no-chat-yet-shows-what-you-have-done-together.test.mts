// A PERSON'S PAGE WITH NO CHAT YET SHOWS WHAT YOU HAVE DONE TOGETHER (w-f702d60afe, rounds six and seven, 2026-11-20).
//
// The PM tester opened Priya's page after a morning of help asks, reviews and
// notes between them: "Observe 'Send Priya your first message' and no history."
// Photographed again on the picture copies: Theo's page said "Send Theo your
// first message" over two asks and a hand-back. The page drew the shared
// history (pair-timeline.ts) only inside a chat, and there was no chat until a
// message was sent. Now, with no chat yet, the page draws that history over the
// first message's box, in the chat's own rows, and the empty picture only when
// there is none.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlongHistory } from '../renderer/src/team/rooms/RoomChat.tsx';
globalThis.React = React;

const row = (key: string, at: number, by: string, text: string) => ({ key, at, by, text, where: { label: 'Add an idempotency key', onOpen: () => {} } });

describe('the history before a first message', () => {
  it('draws each step in the chat\'s own rows, oldest first, with whose it is', () => {
    const html = renderToStaticMarkup(React.createElement(AlongHistory, {
      rows: [row('b', 2_000, 'theo', 'Theo handed it back'), row('a', 1_000, 'sam', 'You asked Theo to help')],
      who: (id: string) => (id === 'sam' ? { name: 'Sam Ortiz', avatarUrl: null } : { name: 'Theo Okafor', avatarUrl: null }),
    }));
    expect(html).toContain('rm-cm rm-along');
    expect(html.indexOf('You asked Theo to help')).toBeLessThan(html.indexOf('Theo handed it back'));
    expect(html).toContain('Add an idempotency key');
  });
  it('is what the page draws while there is history and no chat', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/<ChatStart empty=\{history\.rows\.length \? <AlongHistory rows=\{history\.rows\}/);
  });
});

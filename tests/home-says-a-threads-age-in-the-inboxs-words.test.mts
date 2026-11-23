// HOME SAYS A THREAD'S AGE IN THE INBOX'S WORDS (2026-11-20).
//
// A synthetic team tester read Home's Needs you at 00:35 and saw "Cut the demo
// film for the launch 4 hr" and "Add a POST /payments route 2 d"; the Inbox
// said the same threads were from "Yesterday" and "Nov 17". Both measure from
// the same moment (`sentAt`), but Home wrote it with its own short clock
// (`agoShort`) and the Inbox with `updatedWords`, so a thread sent at 20:51 the
// night before read "4 hr" on one and "Yesterday" on the other. Measured by
// drawing Home with those rows and comparing each age with the Inbox's words.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomePage, type NeedsRow, type ProgressRow } from '../renderer/src/home/HomePage.tsx';
import { updatedWords } from '../renderer/src/threads/page-rules.ts';

const MIN = 60_000;
// 00:35 on a Friday, local time, as the tester's clock read.
const NOW = new Date(2026, 10, 20, 0, 35).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

const need = (key: string, title: string, when: number): NeedsRow => ({ key, letter: 'C', title, from: null, priority: null, project: 'Payments API', at: when, unread: false });
const draw = (needs: NeedsRow[], progress: ProgressRow[] = []) => renderToStaticMarkup(React.createElement(HomePage, {
  hello: 'Good evening', now: NOW, needs, needsCount: needs.length, progressCount: progress.length, team: null, progress,
  slot: () => {}, onDoor: () => {}, onOpen: () => {}, onMember: () => {}, onTeam: () => {},
}));
const times = (html: string) => [...html.matchAll(/<time>([^<]*)<\/time>/g)].map((m) => m[1]);

describe('the age on a Home row', () => {
  it('reads Yesterday for a thread sent at 20:51 the night before, as the Inbox does', () => {
    const sent = at(19, 20, 51);
    expect(times(draw([need('a', 'Demo film cut length', sent)]))).toEqual([updatedWords(sent, NOW)]);
    expect(updatedWords(sent, NOW)).toBe('Yesterday');
  });

  it('reads the date for a thread from days ago, never a count of days', () => {
    const sent = at(17, 4, 39);
    const html = draw([need('b', 'Add POST /payments route for appointments', sent)]);
    expect(times(html)).toEqual([updatedWords(sent, NOW)]);
    expect(html).not.toMatch(/<time>\d+ d<\/time>/);
  });

  it('matches the Inbox either side of midnight and inside the hour', () => {
    const rows = [
      need('c', 'Just sent', NOW - 20_000),
      need('d', 'Earlier tonight', NOW - 30 * MIN),
      need('e', 'Just before midnight', at(19, 23, 50)),
      need('f', 'Last week', at(13, 9)),
    ];
    expect(times(draw(rows))).toEqual(rows.map((r) => updatedWords(r.at!, NOW)));
  });

  it('says hours on the same day, where both agree on a count', () => {
    const later = new Date(2026, 10, 20, 14, 0).getTime();
    const sent = new Date(2026, 10, 20, 10, 0).getTime();
    const html = renderToStaticMarkup(React.createElement(HomePage, {
      hello: 'Good afternoon', now: later, needs: [need('g', 'This morning', sent)], needsCount: 1, progressCount: 0, team: null, progress: [],
      slot: () => {}, onDoor: () => {}, onOpen: () => {}, onMember: () => {}, onTeam: () => {},
    }));
    expect(times(html)).toEqual(['4 hours ago']);
  });

  it('uses the same words on the In progress card', () => {
    const sent = at(19, 20, 51);
    const html = draw([], [{ key: 'p', letter: 'X', title: 'Health endpoint', line: 'Codex · Payments API', at: sent }]);
    expect(times(html)).toEqual(['Yesterday']);
  });

  it('draws no time for an invitation, which has none', () => {
    const html = draw([{ ...need('h', 'Maya invited you', 0), at: null }]);
    expect(times(html)).toEqual([]);
  });
});

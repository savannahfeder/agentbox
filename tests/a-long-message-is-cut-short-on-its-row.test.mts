// A LONG MESSAGE IS CUT SHORT ON ITS ROW (w-9b31468b04).
//
// Reported 2026-11-21 with a picture of Needs you on a wide screen: the two
// group messages at the top ran 192 characters to the Status column before the
// ellipsis, beside thread names of 29 to 39, and the sender's name after them
// never showed. MentionRows drew `firstRealLine(m.body)` whole and only the
// cell's ellipsis cut it, so the wider the window, the longer the row. Now a
// message drawn as a row's title stops at a word by 48 characters, about as
// long as the thread names beside it, in the inbox's list, on the board's card
// and on Home. 48 was picked on 2026-11-23 over 64, from pictures of both.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MentionCards, MentionRows } from '../renderer/src/team/rooms/MentionRows.tsx';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { homeNeedsRows } from '../renderer/src/home/home-needs.ts';
import { SharedFileCards, SharedFileRows } from '../renderer/src/threads/SharedFileRows.tsx';
globalThis.React = React;

const CUT = 48;
const NOW = Date.UTC(2026, 10, 21, 18, 0);
const LONG = 'The tester loop needs a hard stop when its plan runs out for the week, with no other plan put in its place, and a rule to pick up its own loop thread again. The review lead already keeps to the stop.';
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// What the row prints between its face and the sender's grey name.
const titleOf = (html: string) => decode(html.match(/<\/span><\/span>([^<]*)<span class="th-who-name">/)?.[1] ?? '');

const mention = (body: string) => ({ id: 'room-mention:r-1', messageId: 'm1', roomId: 'r-1', roomName: 'Kestrel', by: 'u-maya', byName: 'Maya C.', body, at: NOW - 60_000 });
const row = (body: string) => renderToStaticMarkup(React.createElement(MentionRows, { mentions: [mention(body)], faces: new Map(), now: NOW, onOpen: () => {} }));

// Cut where a word ends, the ellipsis after it, and nothing but the message's own words before it.
function expectCutAtAWord(shown: string, whole: string) {
  expect(shown.endsWith('…')).toBe(true);
  const kept = shown.slice(0, -1);
  expect(kept.length).toBeLessThanOrEqual(CUT);
  expect(whole.startsWith(kept)).toBe(true);
  expect(whole[kept.length]).toBe(' ');
}

describe('a group message in Needs you', () => {
  it('stops at a word by 48 characters, the reported row', () => {
    const shown = titleOf(row(LONG));
    expectCutAtAWord(shown, LONG);
    expect(shown).toBe('The tester loop needs a hard stop when its plan…');
  });

  it('still names who sent it after the words', () => {
    expect(row(LONG)).toMatch(/…<span class="th-who-name">Maya C\.<\/span>/);
  });

  it('draws a message of exactly 48 characters whole', () => {
    const exact = 'Can you check the pricing page before our calls?';
    expect(exact).toHaveLength(CUT);
    expect(titleOf(row(exact))).toBe(exact);
  });

  it('cuts one of 49', () => {
    const over = 'Can you look at the pricing page before the call?';
    expect(over).toHaveLength(CUT + 1);
    expectCutAtAWord(titleOf(row(over)), over);
  });

  it('ends at a full stop when a sentence ends in time, with nothing added', () => {
    const two = 'I moved the launch film to Friday at noon, Sam. The music is the second track.';
    expect(titleOf(row(two))).toBe('I moved the launch film to Friday at noon, Sam.');
  });

  // THE CASE THAT MUST NOT MATCH: a short message is the message.
  it('leaves a short message as it was written', () => {
    expect(titleOf(row('Can you look at the deck?'))).toBe('Can you look at the deck?');
  });

  it('is cut the same way on the board’s card', () => {
    const card = decode(renderToStaticMarkup(React.createElement(MentionCards, { mentions: [mention(LONG)], onOpen: () => {} })));
    expect(card).toContain('The tester loop needs a hard stop when its plan…</div>');
  });

  it('is cut the same way on Home', () => {
    const [home] = homeNeedsRows([{ kind: 'lead', key: 'room-mention:r-1', lead: { key: 'room-mention:r-1', mention: mention(LONG) } }] as Parameters<typeof homeNeedsRows>[0], { item: () => { throw new Error('no threads here'); }, nameOf: () => '' });
    expect(home.title).toBe('The tester loop needs a hard stop when its plan…');
  });
});

describe('a note naming you on a teammate’s file', () => {
  const news = (text: string) => ({ owner: 'u-maya', threadId: 't-1', id: 'n1', file: 'deck.md', text, by: 'u-maya', ts: NOW - 60_000 });
  const cards = [{ personId: 'u-maya', threadId: 't-1', title: 'Pricing deck' }];
  const draw = (text: string) => renderToStaticMarkup(React.createElement(SharedFileRows, { news: [news(text)] as never, cards: cards as never, team: null, now: NOW, onOpen: () => {} }));

  it('is cut the same way in Needs you', () => {
    expectCutAtAWord(titleOf(draw(LONG)), LONG);
  });

  it('leaves a short note whole', () => {
    expect(titleOf(draw('Is this right?'))).toBe('Is this right?');
  });

  it('is cut the same way on the board’s card, the file’s name counted in', () => {
    const card = decode(renderToStaticMarkup(React.createElement(SharedFileCards, { news: [news(LONG)] as never, cards: cards as never, team: null, onOpen: () => {} })));
    const shown = card.match(/<\/b> ([^<]*)<\/div>/)?.[1] ?? '';
    expectCutAtAWord(shown, `named you on deck.md: ${LONG}`);
  });
});

describe('a conversation with a teammate in the list', () => {
  const ME = 'p-me', MAYA = 'p-maya';
  const DIRECT = { slug: 'direct-maya', name: 'Direct', team: { projectId: 'tp-1', direct: true, people: [MAYA], sharedBy: ME } };
  const team = { state: { signedIn: true }, me: ME, byId: new Map([[ME, { id: ME, name: 'Sam Lee' }], [MAYA, { id: MAYA, name: 'Maya Chen' }]]), products: new Map() };
  const convo = (body: string, by = MAYA, label?: string) => ({
    id: 'w-abcdef1234', product: DIRECT.slug, productName: 'Direct', status: 'open', kind: 'directive', title: body, body, label,
    people: [ME, MAYA], createdBy: by, wrote: { body: { ts: NOW - 60_000, by } }, createdAt: NOW - 60_000, updatedAt: NOW - 60_000, priority: 0,
  });
  const draw = (item: ReturnType<typeof convo>) => renderToStaticMarkup(
    React.createElement(TeamContext.Provider, { value: team as never }, React.createElement(ThreadCells, { item: item as never, product: DIRECT as never, now: NOW, tab: 'inbox' })),
  );

  it('cuts their long message the same way', () => {
    expectCutAtAWord(titleOf(draw(convo(LONG))), LONG);
  });

  it('counts the "You:" before your own message in the 48', () => {
    const shown = titleOf(draw(convo(LONG, ME)));
    expectCutAtAWord(shown, `You: ${LONG}`);
  });

  it('leaves a short one whole', () => {
    expect(titleOf(draw(convo('Lunch at one?')))).toBe('Lunch at one?');
  });

  // A named conversation leads with its name; the message after it is faint words the cell already cuts.
  it('leaves a conversation that has a name to its name', () => {
    expect(draw(convo(LONG, MAYA, 'Tester loop hard stop'))).toMatch(/<span class="th-title-text">Tester loop hard stop<\/span>/);
  });
});

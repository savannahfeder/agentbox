// THE PHONE LISTS WHAT SHIPPED THIS WEEK, AS THE DESKTOP'S TEAM LIST DOES.
//
// The desktop offers "What shipped this week" in ⌘K with a team on, and
// "Shipped this week" on the team's card in Everything else
// (renderer/src/team/TeamLists.tsx, App.tsx `teamLists` and `onShipped`). The
// phone had neither: its command list (mobile/src/lib/palette.ts) named no such
// thing and its card reading asked the cloud for no `shipped_at`. These cases
// run the desktop's own `shippedThisWeek` over the cards the phone reads, and
// check the command and the team card's button are there only with a team on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { shippedThisWeek } from '../renderer/src/team/shipped';
import { phoneShipped, shippedCardOf, shippedCardsQuery, shippedName } from '../mobile/src/lib/shipped';
import { phoneCommands } from '../mobile/src/lib/palette';
import { previewCloud } from '../mobile/src/lib/preview';

const NOW = Date.UTC(2026, 10, 8, 12);
const DAY = 86_400_000;
const ME = 'me';
const card = (personId, threadId, extra = {}) => ({
  personId, threadId, visible: true, title: `Thread ${threadId}`, project: 'Alpha', state: 'done', priority: 5, problem: null, progress: null, solution: null,
  blockedBy: [], blocks: [], people: null, updatedAt: NOW - DAY, ...extra,
});
const keys = (rows) => rows.map((r) => r.key);

describe('what is on the list', () => {
  it('a teammate\'s thread that shipped this week, by the desktop\'s rule', () => {
    const cards = [card('sam', 'w-1', { shippedAt: NOW - 2 * DAY })];
    expect(keys(phoneShipped({ cards, me: ME, now: NOW }))).toEqual(['card/sam/w-1']);
    expect(phoneShipped({ cards, me: ME, now: NOW })).toEqual(shippedThisWeek({ items: [], cards, products: [], me: ME, since: null, now: NOW }));
  });

  it('not one that shipped eight days ago, nor one only finished, nor one its owner keeps private', () => {
    const cards = [
      card('sam', 'w-old', { shippedAt: NOW - 8 * DAY }),
      card('sam', 'w-done'),
      card('sam', 'w-private', { visible: false, title: null, shippedAt: NOW - DAY }),
    ];
    expect(phoneShipped({ cards, me: ME, now: NOW })).toEqual([]);
  });

  it('your own thread the team can read, under You', () => {
    const rows = phoneShipped({ cards: [card(ME, 'w-mine', { shippedAt: NOW - DAY })], me: ME, now: NOW });
    expect(rows.map((r) => [r.title, shippedName(r.ownerId, ME, [])])).toEqual([['Thread w-mine', 'You']]);
  });

  it('not your own thread shown only to chosen people, as the desktop leaves those out', () => {
    expect(phoneShipped({ cards: [card(ME, 'w-few', { shippedAt: NOW - DAY, people: ['sam'] })], me: ME, now: NOW })).toEqual([]);
  });

  it('newest first, each under its owner\'s first name', () => {
    const rows = phoneShipped({ cards: [card('sam', 'w-1', { shippedAt: NOW - 3 * DAY }), card('kai', 'w-2', { shippedAt: NOW - DAY })], me: ME, now: NOW });
    expect(keys(rows)).toEqual(['card/kai/w-2', 'card/sam/w-1']);
    expect(shippedName('kai', ME, [{ id: 'kai', name: 'Kai Ito', email: 'kai@example.com' }])).toBe('Kai');
  });
});

describe('reading it from the cloud', () => {
  it('asks only for the week\'s shipped cards, with who each reaches', () => {
    const q = new URLSearchParams(shippedCardsQuery(NOW));
    expect(q.get('select').split(',')).toEqual(expect.arrayContaining(['shipped_at', 'people', 'person_id', 'thread_id', 'visible', 'title']));
    expect(q.get('shipped_at')).toBe(`gte.${new Date(NOW - 7 * DAY).toISOString()}`);
  });

  it('reads a row as the card the desktop\'s rule takes', () => {
    const at = new Date(NOW - DAY).toISOString();
    expect(shippedCardOf({ person_id: 'sam', thread_id: 'w-1', visible: true, title: 'T', project: 'Alpha', people: ['me'], shipped_at: at, updated_at: at }))
      .toMatchObject({ personId: 'sam', threadId: 'w-1', people: ['me'], shippedAt: NOW - DAY });
    expect(shippedCardOf({ person_id: 'sam', thread_id: 'w-1', shipped_at: null, updated_at: at }).shippedAt).toBeUndefined();
  });

  it('has something on it in the browser preview', async () => {
    const cloud = previewCloud(() => NOW);
    const rows = (await cloud.select('thread_cards', shippedCardsQuery(NOW))).map(shippedCardOf);
    expect(phoneShipped({ cards: rows, me: 'preview', now: NOW }).length).toBeGreaterThan(1);
  });
});

describe('where it is reached', () => {
  it('from the command list in the desktop\'s words, with a team on', () => {
    expect(phoneCommands({ team: true }).find((c) => c.id === 'team-list-shipped')).toMatchObject({ label: 'What shipped this week', act: { push: '/shipped' } });
  });

  it('not with no team', () => {
    expect(phoneCommands({ team: false }).map((c) => c.id)).not.toContain('team-list-shipped');
  });

  it('from the team\'s card in Everything else, and no other card', () => {
    const ev = fs.readFileSync('mobile/src/ui/Everything.tsx', 'utf8');
    expect(ev).toMatch(/onShipped=\{member\.team \? \(\) => router\.push\('\/shipped'\) : undefined\}/);
    expect(ev).toMatch(/>Shipped this week</);
  });
});

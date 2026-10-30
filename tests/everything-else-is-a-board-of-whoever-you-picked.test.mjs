// EVERYTHING ELSE IS A BOARD OF WHOEVER YOU PICKED (w-2b3e1a85e5).
//
// Of five layouts drawn on 2026-10-28, the one picked was the team's cards on
// top with a board under them: In progress, Later, Done today. On the drawing
// the board was always your threads whichever card was lit, and "the board
// lacks clarity about what it is. I would think that if I have myself
// selected, it would only show my own content, whereas if I have the team
// selected, it would show everybody's work." Measured on the drawing: with You
// lit, an AI teammate's run sat in your In progress, and the Team card opened
// a chat instead of anyone's work. Now the lit card says whose the board is.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { boardColumns, DEFAULT_DISPLAY, DEFAULT_COLUMN_ORDER } from '../renderer/src/threads/page-rules.ts';
import { boardItems, evColumns, flipEvView, readEvView, whoseBoard, writeEvView } from '../renderer/src/team/everything/whose-board.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const now = Date.parse('2026-10-28T14:30:00-07:00');
const products = [{ slug: 'app', dir: '/x', name: 'App', oneLiner: '', repoPath: null }];
const item = (id, title, extra = {}) => ({ id, product: 'app', productName: 'App', status: 'open', kind: 'task', title, labels: [], priority: 2, epoch: 1, claim: null, createdAt: now - 3_600_000, updatedAt: now - 60_000, ...extra });
const mine = item('w-1', 'My running thread');
const later = item('w-2', 'My later thread', { runAt: now + 86_400_000 });
const mateRun = item('w-3', 'QA run', { labels: ['teammate:m-qa'] });
const items = [mine, later, mateRun];
const state = new Map([['w-1', 'running'], ['w-2', 'scheduled'], ['w-3', 'running']]);
const card = { personId: 'p-maya', threadId: 't-9', visible: true, title: 'Maya brand colours', project: 'App', state: 'running', priority: 2, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: now - 120_000 };
const mateOf = (i) => (i.labels.find((l) => l.startsWith('teammate:')) ?? '').slice('teammate:'.length) || null;
const who = { me: 'p-me', people: ['p-me', 'p-maya', 'p-jun'], team: 'room:r-team', shares: (id) => id === 'p-maya' };

function titles(key, tab = 'agents') {
  const board = whoseBoard(key, tab, who);
  const cols = boardColumns({
    items: boardItems(items, board, mateOf), products, display: DEFAULT_DISPLAY.inbox, now, stateOf: (i) => state.get(i.id) ?? null,
    cards: [card], picked: board.picked, me: 'p-me', order: evColumns(DEFAULT_COLUMN_ORDER),
  });
  return { labels: cols.map((c) => c.label), all: cols.flatMap((c) => c.rows.map((r) => r.title)) };
}

describe('the board under the cards', () => {
  it('is In progress, Later and Done today, since what waits on you is Needs you', () => {
    expect(titles('me').labels).toEqual(['In progress', 'Later', 'Done today']);
    expect(evColumns(['done', 'waiting', 'running', 'scheduled'])).toEqual(['done', 'running', 'scheduled']);
  });

  it('holds only your own threads with You picked, not your AI teammates\' runs or anyone else\'s', () => {
    expect(titles('me').all.sort()).toEqual(['My later thread', 'My running thread']);
    expect(titles(null).all.sort()).toEqual(['My later thread', 'My running thread']);
  });

  it('holds everybody\'s work with the Team picked', () => {
    expect(titles('room:r-team').all.sort()).toEqual(['Maya brand colours', 'My later thread', 'My running thread', 'QA run']);
  });

  it('holds only that person\'s shared threads with a person picked', () => {
    expect(titles('person:p-maya').all).toEqual(['Maya brand colours']);
  });

  // "a good portion of people won't have that publicly available"
  it('is no board for a person who shares no threads, and a line that says so', () => {
    expect(whoseBoard('person:p-jun', 'agents', who)).toBeNull();
    expect(read('renderer/src/App.tsx')).toContain('shares no threads with the team.</p>');
  });

  it('holds only that teammate\'s runs with an AI teammate picked', () => {
    expect(titles('mate:m-qa').all).toEqual(['QA run']);
  });

  it('is no board at all on a chat, a card\'s Messages, or without a signed-in you', () => {
    expect(whoseBoard('room:r-launch', 'agents', who)).toBeNull();
    expect(whoseBoard('direct:w-77', 'agents', who)).toBeNull();
    expect(whoseBoard('person:p-maya', 'messages', who)).toBeNull();
    expect(whoseBoard('room:r-team', 'messages', who)).toBeNull();
    expect(whoseBoard('new', 'agents', who)).toBeNull();
    expect(whoseBoard('me', 'agents', { ...who, me: null })).toBeNull();
  });
});

describe('board or list', () => {
  const memory = () => {
    const box = new Map();
    return { box, store: { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, String(v)) } };
  };

  it('is the board until you switch, and remembered when you do', () => {
    const { store } = memory();
    expect(readEvView(store)).toBe('board');
    writeEvView(flipEvView(readEvView(store)), store);
    expect(readEvView(store)).toBe('list');
    writeEvView(flipEvView(readEvView(store)), store);
    expect(readEvView(store)).toBe('board');
  });

  it('is the board when what was kept makes no sense', () => {
    const { box, store } = memory();
    box.set('agentbox.everything.view', 'tall');
    expect(readEvView(store)).toBe('board');
  });
});

describe('in the app', () => {
  const app = read('renderer/src/App.tsx');

  it('draws the board under the cards, from the same columns J and K walk', () => {
    expect(app).toContain('columnOrder={evColumns(columnOrder)}');
    expect(app).toMatch(/whoseBoard\(evPick, evTab, /);
  });

  // "the things we said previously about there being the needs you and everything else still hold"
  it('with a team on, B and the View menu switch Everything else, never the two tabs away', () => {
    expect(app).toMatch(/!teamMode && search === null && inboxDisplay\.view === 'board' && !roomShown \? \(/);
    expect(app).toMatch(/case 'b': case 'B':\s*if \(teamMode\) \{/);
  });

  // Their chat is on the Chats page (tests/messages-open-on-the-chats-page-and-nowhere-else).
  it('opens a person, an AI teammate or the Team on their work, with no tabs over it', () => {
    expect(app).not.toMatch(/label: 'Agents'|label: 'Threads'/);
  });

  it('keeps View and filters over every board, not only yours', () => {
    expect(app).toContain("filters={!roomShown && (!evOn || evKey === 'me' || !!evBoardEl)}");
  });
});

// DONE TODAY IS FINISHED WORK, AND THE TEAM'S BOARD AGREES WITH THE TEAM'S CARDS.
//
// At 03:05: "Done today 33", most of it messages. Replying to
// a person closes the conversation, so Dev's "Maya: You: thanks, since you set
// up Harbor Dental's reminders..." sat under Done while he waited on her answer.
// Maya: "The team board under the group's options says In progress 0,
// while the team cards say 20." The cards count a teammate's waiting thread as
// in progress and the group's board drew those under a Waiting column instead.
import { describe, it, expect } from 'vitest';
import { boardColumns, DEFAULT_COLUMN_ORDER, DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules.ts';
import { stackRows } from '../renderer/src/threads/stack-rules.ts';
import { GIVEN_TASK } from '../shared/team-rules.mts';
import { readFileSync } from 'node:fs';

const now = new Date(2026, 9, 30, 15).getTime();
const me = 'dev';
const products = [
  { slug: 'lumen', name: 'Lumen app', team: { projectId: 'p1' } },
  { slug: 'dm-maya', name: 'Direct', team: { direct: true, projectId: 'd1', people: ['maya'], sharedBy: me } },
];
const row = (id, product, o = {}) => ({
  id, product, title: id, status: 'done', priority: 0, labels: ['founder'], createdBy: me, createdAt: now - 1000, updatedAt: now - 1000, ...o,
});
const inDone = () => 'done';
const columns = (items, extra = {}) => boardColumns({
  items, products, display: DEFAULT_DISPLAY.inbox, now, stateOf: extra.stateOf ?? inDone, me, cards: extra.cards ?? [], picked: extra.picked ?? [me],
  order: extra.order, waitingIsInProgress: extra.waitingIsInProgress,
});
const col = (cols, state) => cols.find((c) => c.state === state)?.rows ?? [];

describe('Done today on the board', () => {
  it('a thread finished today is there', () => {
    expect(col(columns([row('fix', 'lumen')]), 'done').map((e) => e.item.id)).toEqual(['fix']);
  });
  it('a conversation I replied to is not, because nothing was finished', () => {
    const talk = row('hi', 'dm-maya', { talk: { chat: [{ by: me, text: 'Thanks', at: now }], threads: [] } });
    expect(col(columns([talk]), 'done')).toEqual([]);
  });
  it('a task given in a conversation and finished today is, because that is work', () => {
    const task = row('task', 'dm-maya', { labels: [GIVEN_TASK], assignee: me, people: ['maya', me] });
    expect(col(columns([task]), 'done').map((e) => e.item.id)).toEqual(['task']);
  });
  it('a conversation with something waiting on me still shows where its tab puts it', () => {
    const talk = row('hi', 'dm-maya', { status: 'open', talk: { chat: [{ by: 'maya', text: 'Can you?', at: now }], threads: [] } });
    expect(col(columns([talk], { stateOf: () => 'waiting' }), 'waiting').map((e) => e.item.id)).toEqual(['hi']);
  });
});

describe('Done today in the list of your threads', () => {
  const base = { progress: [], later: [], dayStart: new Date(now).setHours(0, 0, 0, 0), folded: new Set() };
  it('leaves out a conversation and keeps a finished thread', () => {
    const fix = row('fix', 'lumen', { wrote: { status: { ts: now - 10 } } });
    const talk = row('hi', 'dm-maya', { wrote: { status: { ts: now - 10 } } });
    const stack = stackRows({ ...base, done: [fix, talk], isChat: (i) => i.product === 'dm-maya' });
    expect(stack.rows.map((i) => i.id)).toEqual(['fix']);
    expect(stack.sections.find((s) => s.key === 'done').count).toBe(1);
  });
  it('App hands it the rule', () => {
    expect(readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8')).toMatch(/stackRows\(\{[^}]*isChat/);
  });
});

describe('the team board under the group’s options', () => {
  const cards = [{ personId: 'maya', threadId: 't1', visible: true, title: 'Deck', project: 'Lumen app', state: 'waiting', updatedAt: now }];
  const order = DEFAULT_COLUMN_ORDER.filter((s) => s !== 'waiting');
  it('counts a teammate’s waiting thread under In progress, as their card does', () => {
    const cols = columns([], { cards, picked: [me, 'maya'], order, waitingIsInProgress: true });
    expect(col(cols, 'running').map((e) => e.card.threadId)).toEqual(['t1']);
  });
  it('counts my own waiting thread there too, because the board is the team’s', () => {
    const cols = columns([row('mine', 'lumen', { status: 'blocked' })], { stateOf: () => 'waiting', order, waitingIsInProgress: true });
    expect(col(cols, 'running').map((e) => e.item.id)).toEqual(['mine']);
  });
  it('my own board under Everything else leaves my waiting thread to Needs you', () => {
    const cols = columns([row('mine', 'lumen', { status: 'blocked' })], { stateOf: () => 'waiting', order });
    expect(col(cols, 'running')).toEqual([]);
  });
  it('a finished thread stays Done', () => {
    const cols = columns([row('fix', 'lumen')], { order, waitingIsInProgress: true });
    expect(col(cols, 'done').map((e) => e.item.id)).toEqual(['fix']);
    expect(col(cols, 'running')).toEqual([]);
  });
  // Seen on screen: the Team card's board said In progress 0 with You at 1 in progress.
  it('the Team card’s board under Everything else asks for it, and your own does not', () => {
    const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/waitingIsInProgress: !!evBoard && !evBoard\.mate && !evBoard\.mineOnly/);
    expect(app).toContain('waitingIsInProgress={boardArgs.waitingIsInProgress}');
  });
  it('RoomBoard asks for it', () => {
    const src = readFileSync(new URL('../renderer/src/team/rooms/RoomBoard.tsx', import.meta.url), 'utf8');
    expect(src).toContain('waitingIsInProgress: true');
    expect(src).toMatch(/filter\(\(s\) => s !== 'waiting'/);
  });
});

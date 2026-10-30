// "I'll send a message and then it'll start doing work. Mind you it won't tell
// me that it's doing work. I'll just be like, 'Oh I know that it's setting
// stuff up.'" Reproduced on a throwaway copy of the app with a stand-in agent:
// for the first seconds after a message the header and the teammate's card
// said Not running while its run waited for an agent; once working, the line
// under the message repeated the message ("Tell me what moved signups last
// week  just started") with nothing saying who was working; a new teammate
// whose start failed and was waiting on you still said Setting up; and a
// teammate paused mid-run said Paused while its agent kept going. A second
// message folds into the run already open, so the line under "Find the three
// pages people leave from" named the thread's first question instead.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildMembers } from '../renderer/src/team/everything/members.ts';
import { liveLine, pendingAsk } from '../renderer/src/teammates/chat-lines.ts';
import { nowLine } from '../renderer/src/teammates/TeammatesRail.tsx';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const NOW = 1_800_000_000_000;

describe('the line under your message while it works', () => {
  const t = (over = {}) => ({ id: 't-aaaaaaaaaa', name: 'Growth lead', running: { id: 'w-1', product: 'p' }, now: 'Tell me what moved signups', ...over });
  const session = (over = {}) => ({ itemId: 'w-1', product: 'p', startedAt: NOW - 5_000, tail: [], ...over });

  it('names the teammate and says it is on the run, not only the run', () => {
    expect(liveLine(t(), session(), NOW)).toEqual({ state: 'working', lead: 'Growth lead is on', text: 'Tell me what moved signups', aside: 'just started' });
  });

  it('says the step it is on as a sentence about it', () => {
    const at = session({ startedAt: NOW - 90_000, activity: [{ id: 'a', label: 'Reading marketing/signups.md', detail: '', startedAt: NOW }] });
    expect(liveLine(t(), at, NOW)).toEqual({ state: 'working', lead: 'Growth lead is', text: 'reading marketing/signups.md', aside: '1 minute in' });
  });

  it('says it is waiting for an agent before one has it', () => {
    expect(liveLine(t(), null, NOW)).toEqual({ state: 'waiting', lead: 'Growth lead is waiting for a free agent', text: '', aside: '' });
  });

  it('says nothing when nothing is running', () => {
    expect(liveLine(t({ running: null }), null, NOW)).toBeNull();
  });

  it('names the message you sent it since its run began, not the thread it went into', () => {
    expect(liveLine(t(), session(), NOW, 'Find the three pages people leave from')).toMatchObject({ lead: 'Growth lead is on', text: 'Find the three pages people leave from' });
  });

  it('still says the step it is on over what you asked', () => {
    const at = session({ activity: [{ id: 'a', label: 'Reading marketing/signups.md', detail: '', startedAt: NOW }] });
    expect(liveLine(t(), at, NOW, 'Find the three pages people leave from')).toMatchObject({ lead: 'Growth lead is', text: 'reading marketing/signups.md' });
  });

  it('is the line the chat draws', () => {
    expect(read('renderer/src/teammates/TeammatesPage.tsx')).toMatch(/const line = liveLine\(t, session, now, asked\);/);
    // Every line about it, not only the ones its chat draws, which hide queued and finished.
    expect(read('renderer/src/teammates/TeammatesPage.tsx')).toMatch(/asked=\{pendingAsk\(chatEntries\(view, t\.id\), t\.id\)\}/);
  });
});

describe('what you asked that it has not answered', () => {
  const ID = 't-aaaaaaaaaa';
  const you = (text, ts, to = [ID]) => ({ id: `m-${ts}`, kind: 'msg', from: 'you', to, text, ts });
  const it_ = (text, ts) => ({ id: `m-${ts}`, kind: 'msg', from: ID, text, ts });
  const run = (verb, ts, over = {}) => ({ id: `w-1:${verb}`, kind: 'run', teammate: ID, item: 'w-1', product: 'p', title: 'Tell me what moved signups', verb, ts, ...over });

  it('is your newest message to it when it has said nothing since', () => {
    expect(pendingAsk([you('Tell me what moved signups', 1), run('picked', 2), it_('Signups rose 12%.', 3), you('Find the three pages people leave from', 4)], ID)).toBe('Find the three pages people leave from');
  });

  it('reads past the run being picked up and its own start line', () => {
    expect(pendingAsk([you('Find the three pages people leave from', 1), run('picked', 2), { id: 'a', kind: 'act', from: ID, verb: 'started', ts: 3 }], ID)).toBe('Find the three pages people leave from');
  });

  it('is your answer on its thread', () => {
    expect(pendingAsk([run('sent', 1), run('answered', 2, { text: 'Use last month too' })], ID)).toBe('Use last month too');
  });

  it('is nothing once it has answered', () => {
    expect(pendingAsk([you('Find the three pages people leave from', 1), it_('Pricing, docs and the signup form.', 2)], ID)).toBeNull();
    expect(pendingAsk([you('Find the three pages people leave from', 1), run('sent', 2)], ID)).toBeNull();
  });

  it('is nothing after the run finished, so a run on its own schedule names its own thread', () => {
    expect(pendingAsk([you('Find the three pages people leave from', 1), run('finished', 2)], ID)).toBeNull();
    expect(pendingAsk([you('Find the three pages people leave from', 1), run('stopped', 2)], ID)).toBeNull();
  });

  it('is still what you asked after it writes to another teammate', () => {
    expect(pendingAsk([you('Find the three pages people leave from', 1), { id: 'm-2', kind: 'msg', from: ID, to: ['t-bbbbbbbbbb'], text: 'Can you pull last month?', ts: 2 }], ID)).toBe('Find the three pages people leave from');
  });

  it('is nothing when your message was queued behind a run it started on its own', () => {
    expect(pendingAsk([run('picked', 1), you('Find the three pages people leave from', 2), run('queued', 3, { id: 'w-2:queued', item: 'w-2' })], ID)).toBeNull();
  });

  it('is not a message you sent somebody else', () => {
    expect(pendingAsk([you('Ship the launch checklist', 1, ['t-bbbbbbbbbb'])], ID)).toBeNull();
    expect(pendingAsk([], ID)).toBeNull();
  });
});

describe('the card and the bar over the chat', () => {
  const mate = (over = {}) => ({ id: 't-aaaaaaaaaa', name: 'Growth lead', letter: 'G', role: null, now: null, status: 'active', paused: false, running: null, waiting: [], ...over });
  const card = (m, agents = new Map()) => buildMembers({ me: null, teammates: [m], mateAgents: agents }).find((x) => x.kind === 'mate');
  const up = { id: 'w-1', product: 'p' };

  it('say Starting while its run waits for an agent', () => {
    expect(card(mate({ running: up, now: 'Tell me what moved signups' }))).toMatchObject({ agents: 0, starting: true });
  });

  it('count the agent once it has one, and are not Starting any more', () => {
    expect(card(mate({ running: up, now: 'Tell me what moved signups' }), new Map([['t-aaaaaaaaaa', 1]]))).toMatchObject({ agents: 1, starting: false });
  });

  it('are not Starting with nothing to run', () => {
    expect(card(mate())).toMatchObject({ agents: 0, starting: false });
  });

  it('draw Starting, moving, where Not running was', () => {
    const strip = read('renderer/src/team/everything/TeamStrip.tsx');
    expect(strip).toMatch(/<LiveMark still=\{!m\.agents && !m\.starting\} \/>\{m\.agents \? agentsShort\(m\.agents\)\.toUpperCase\(\) : m\.starting \? 'STARTING' : 'NOT RUNNING'\}/);
    expect(strip).toMatch(/export function AgentsLine\(\{ n, still, starting = false \}/);
    expect(read('renderer/src/App.tsx')).toMatch(/<AgentsLine n=\{evMember\.agents\} starting=\{evMember\.starting\} \/>/);
  });

  it('say what it is on when it was paused mid-run, and Paused once it is idle', () => {
    expect(card(mate({ paused: true, running: up, now: 'Tell me what moved signups' })).now).toBe('Tell me what moved signups');
    expect(card(mate({ paused: true })).now).toBe('Paused');
  });

  it('say Waiting on you for a new teammate whose run stopped and waits on you, and Setting up otherwise', () => {
    const stuck = { id: 'w-1', product: 'p', title: 'Set up its job' };
    expect(card(mate({ status: 'draft', waiting: [stuck], now: 'Waiting on you' })).now).toBe('Waiting on you');
    expect(card(mate({ status: 'draft', running: up, now: 'Set up its job' })).now).toBe('Setting up');
    expect(card(mate({ status: 'draft' })).now).toBe('Setting up');
  });
});

describe('Now, beside the chat', () => {
  const t = (over = {}) => ({ status: 'active', paused: false, running: null, waiting: [], now: null, works: null, ...over });
  it('says Waiting on you for a new teammate whose run waits on you', () => {
    expect(nowLine(t({ status: 'draft', waiting: [{ id: 'w-1' }], now: 'Waiting on you' }))).toBe('Waiting on you');
  });
  it('still says Setting up while it sets up, and when it has asked nothing yet', () => {
    expect(nowLine(t({ status: 'draft', running: { id: 'w-1' }, now: 'Set up its job' }))).toBe('Setting up');
    expect(nowLine(t({ status: 'draft' }))).toBe('Setting up');
  });
});

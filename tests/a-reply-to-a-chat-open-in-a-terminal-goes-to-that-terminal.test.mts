// A REPLY TO A CHAT STILL OPEN IN A TERMINAL GOES TO THAT TERMINAL.
//
// It used to start a copy of the chat here. The first power tester to live in
// both (2026-11-22) replied here to seven chats they also had open: each became
// two conversations, "two agents have written the same date change in two
// folders", and what the terminal went on to ask was never in Needs you. On a
// Mac short of memory the copy also waited up to 16 minutes to start, where the
// terminal was sitting ready.
//
// Claude Code listens on a socket for this (main/agents.mts `reply`, as for a
// live session's own row). Measured on 2.1.330: taken at once when idle, after
// the turn when at work, and after its question when one is open.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { carriedOnFromTheApp, fromTheApp } from '../main/agents.mts';
import { followClaudeChats } from '../main/chat-follow.mts';
import { slugFor } from '../main/transcript-search.mts';
import { CLOSED_THERE, HELD_IN, heldThere, stoppedThere } from '../shared/carried-on-outside.mts';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules.ts';
import { threadEvents } from '../renderer/src/thread-history.ts';

const SID = '6b1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
let root;
let home;
let s;
let sup;
let slug;
let file;
let T0;
let sent;

const at = (ms) => new Date(ms).toISOString();
const row_ = (type, ms, message, over = {}) => ({ type, timestamp: at(ms), message, ...over });
const typed = (ms, text) => row_('user', ms, { role: 'user', content: text }, { origin: { kind: 'human' } });
const peer = (ms, text) => row_('user', ms, { role: 'user', content: `Another Claude session sent a message:\n${text}` }, { origin: { kind: 'peer' } });
const says = (ms, text) => row_('assistant', ms, { role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' });
const write = (...rows) => fs.appendFileSync(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
const session = (status, waitingFor) => {
  const dir = path.join(home, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${process.pid}.json`);
  if (status === null) fs.rmSync(f, { force: true });
  else fs.writeFileSync(f, JSON.stringify({ pid: process.pid, sessionId: SID, cwd: path.join(root, 'kestrel'), status, ...(waitingFor ? { waitingFor } : {}) }));
};
const row = () => s.listItems().find((i) => i.product === slug && (i.labels ?? []).includes(`thread:${SID}`));
const inbox = () => belongsInInbox(row(), { now: Date.now() });
const progress = () => belongsInProgress(row(), { now: Date.now() });
const reply = (answer) => s.answerItem(slug, row().id, { answer });
const settle = async () => { for (let i = 0; i < 100 && sup._toTerminal?.going.size; i++) await new Promise((r) => setTimeout(r, 20)); };
const follow = (now = Date.now()) => followClaudeChats({ store: s, dirs: [home], now, ours: (id) => !!sup._rowSessions?.[id]?.sessionId });

beforeEach(async () => {
  T0 = Date.now() - 30 * 60_000;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-to-terminal-'));
  home = path.join(root, '.claude');
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  s = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  ({ slug } = s.createProduct({ name: 'Kestrel', repoPath: path.join(root, 'kestrel') }));
  const projects = path.join(home, 'projects', slugFor(path.join(root, 'kestrel')));
  fs.mkdirSync(projects, { recursive: true });
  file = path.join(projects, `${SID}.jsonl`);
  write(typed(T0, 'Fix it.'), says(T0 + 60_000, 'Mock or retry?'));
  s.importThreadRows(slug, [{
    id: SID, source: 'terminal', folder: path.join(root, 'kestrel'), title: 'Fix the flaky test', when: T0 + 60_000, startedAt: T0, path: file,
    firstSaid: 'Fix it.', lastSaid: 'Mock or retry?', waiting: true,
  }], { now: T0 + 120_000 });
  sup = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, s, root);
  sup._saveState = () => {};
  sup.wake = () => {};
  sent = [];
  sup._sayInTerminal = async (pid, text) => { sent.push([pid, text]); return { ok: true }; };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('a reply to a chat open in a terminal', () => {
  beforeEach(() => session('idle'));

  it('is said there, once, and the row is In progress as one its terminal works on', async () => {
    reply('Mock the clock.');
    expect(sup._goesToItsTerminal(row())).toBe(true);
    expect(sup._goesToItsTerminal(row())).toBe(true);
    await settle();
    expect(sent).toEqual([[process.pid, 'Mock the clock.']]);
    expect(row().claim.holder).toBe(HELD_IN.claude);
    expect(progress()).toBe(true);
    expect(inbox()).toBe(false);
    // Nothing starts here for it.
    expect(sup._answerDelivered(row())).toBe(true);
    expect(sup._goesToItsTerminal(row())).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('comes back to Needs you with the answer the terminal gave, under your reply', async () => {
    reply('Mock the clock.');
    sup._goesToItsTerminal(row());
    await settle();
    const t = Date.now() + 1_000;
    write(peer(t, carriedOnFromTheApp('Mock the clock.')), says(t + 1_000, 'Mocked. Ship it?'));
    session('idle');
    await follow(t + 2_000);
    expect(row().status).toBe('open');
    expect(row().result).toBe('Mocked. Ship it?');
    expect(belongsInInbox(row(), { now: t + 2_000 })).toBe(true);
    const events = threadEvents(s.readHistory(slug, row().id));
    expect(events.filter((e) => e.message).slice(-2).map((e) => [e.who, e.words])).toEqual([['you', 'Mock the clock.'], ['agent', 'Mocked. Ship it?']]);
    // Your reply once, and not again as one typed there.
    expect(events.filter((e) => e.said.startsWith('You replied in'))).toEqual([]);
  });

  it('and the next one goes there too, so it stays one conversation', async () => {
    reply('Mock the clock.');
    sup._goesToItsTerminal(row());
    await settle();
    const t = Date.now() + 1_000;
    write(peer(t, 'x'), says(t + 1_000, 'Mocked. Ship it?'));
    await follow(t + 2_000);
    reply('Ship it.');
    expect(sup._goesToItsTerminal(row())).toBe(true);
    await settle();
    expect(sent.map(([, text]) => text)).toEqual(['Mock the clock.', 'Ship it.']);
  });

  it('that is at its own question waits behind it, and Needs you still says where', async () => {
    session('waiting', 'input needed');
    write(typed(T0 + 200_000, 'Which clock?'));
    await follow();
    reply('The test clock.');
    sup._goesToItsTerminal(row());
    await settle();
    await follow();
    expect(row().result).toBe('**Claude Code stopped to ask you a question. Answer it in the terminal open in kestrel, and it gets your reply next.**');
    expect(row().result).toBe(stoppedThere('input needed', 'kestrel', { replyWaits: true }));
    expect(row().wrote.result.ts).toBeGreaterThanOrEqual(row().wrote.answer.ts);
    expect(inbox()).toBe(true);
    const lines = s.readHistory(slug, row().id).length;
    await follow();
    expect(s.readHistory(slug, row().id).length).toBe(lines);
    // Answered, and it reads the reply: a question after that is an ordinary one.
    const t = Date.now() + 1_000;
    write(says(t, 'On it.'), peer(t + 100, 'The test clock.'));
    await follow(t + 1_000);
    expect(row().result).toContain(stoppedThere('input needed', 'kestrel'));
  });

  it('that Claude Code holds for you to allow says so, and is not run here as well', async () => {
    sup._sayInTerminal = async () => ({ ok: false, held: true, reason: 'held' });
    reply('Mock the clock.');
    sup._goesToItsTerminal(row());
    await settle();
    expect(row().result).toBe(heldThere('kestrel'));
    expect(inbox()).toBe(true);
    expect(sup._answerDelivered(row())).toBe(true);
  });

  it('whose window closes before it answers is in Needs you, saying so', async () => {
    reply('Mock the clock.');
    sup._goesToItsTerminal(row());
    await settle();
    write(peer(Date.now(), 'x'));
    session(null);
    const old = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(file, old, old);
    await follow();
    expect(row().result).toBe(CLOSED_THERE);
    expect(inbox()).toBe(true);
    expect(progress()).toBe(false);
  });
});

describe('a reply that starts a run here as before', () => {
  beforeEach(() => session('idle'));

  it('is one the terminal would not take', async () => {
    sup._sayInTerminal = async () => ({ ok: false, reason: 'That agent is no longer running.' });
    reply('Mock the clock.');
    expect(sup._goesToItsTerminal(row())).toBe(true);
    await settle();
    expect(sup._answerDelivered(row())).toBe(false);
    expect(sup._goesToItsTerminal(row())).toBe(false);
    expect(row().claim).toBeNull();
  });

  it('is one that threw on the way', async () => {
    sup._sayInTerminal = async () => { throw new Error('socket'); };
    reply('Mock the clock.');
    sup._goesToItsTerminal(row());
    await settle();
    expect(sup._goesToItsTerminal(row())).toBe(false);
  });

  it('is one to a chat no terminal has open', () => {
    session(null);
    reply('Mock the clock.');
    expect(sup._goesToItsTerminal(row())).toBe(false);
  });

  it('is one to a chat a run here has taken up', () => {
    reply('Mock the clock.');
    sup._rowSessions[row().id] = { sessionId: 'ours' };
    expect(sup._goesToItsTerminal(row())).toBe(false);
  });

  it('is a slash command, one with a file, and one to another agent', () => {
    reply('/compact');
    expect(sup._goesToItsTerminal(row())).toBe(false);
    reply('See this\n\n![a.png](attachments/a.png)');
    expect(sup._goesToItsTerminal(row())).toBe(false);
    reply('Mock the clock.');
    sup._engineFor = () => 'codex';
    expect(sup._goesToItsTerminal(row())).toBe(false);
  });

  it('is one on a thread shared with a team', () => {
    const dir = s.productDir(slug);
    const project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ ...project, team: { projectId: 'p-1', sharedBy: 'someone' } }));
    s.forgetProducts?.();
    reply('Mock the clock.');
    expect(sup._goesToItsTerminal(row())).toBe(false);
  });

  it('is one on any other thread', () => {
    reply('Mock the clock.');
    expect(sup._goesToItsTerminal({ ...row(), labels: ['founder'] })).toBe(false);
  });
});

describe('how it reads in the terminal', () => {
  // Claude Code tells its agent such a message was not typed by its user and is
  // never their approval. An early wording here told the agent otherwise.
  it('says where it was written, keeps the mark the cards strip, and argues with no guard of Claude Code\'s', () => {
    const words = carriedOnFromTheApp('Mock the clock.');
    expect(words.split('\n').at(-1)).toBe('Mock the clock.');
    expect(words.split(',')[0]).toBe(fromTheApp('x').split(',')[0]);
    expect(words).not.toMatch(/not an agent|not from an agent|as if|approv/i);
  });
});

describe('where it is asked', () => {
  it('is ahead of the room a run needs, and again where a run would start', () => {
    const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'main', 'supervisor.mts'), 'utf8');
    const loop = source.indexOf('for (const { item, continuation, command } of asleep ? [] : queue) {');
    const before = source.lastIndexOf('this._goesToItsTerminal(item)', loop);
    const inside = source.indexOf('if (continuation && !command && this._goesToItsTerminal(item)) continue;', loop);
    expect(before).toBeGreaterThan(0);
    expect(inside - loop).toBeLessThan(200);
  });
});

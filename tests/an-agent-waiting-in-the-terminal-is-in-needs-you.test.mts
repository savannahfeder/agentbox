// AN AGENT WAITING ON YOU IN THE TERMINAL IS IN NEEDS YOU.
//
// The other half of "if somebody sends a response to an agent in the terminal,
// you don't want it still in your inbox" (2026-11-21): an agent there that
// stops on you is in the inbox. Three ways it was not, measured before a tester
// saw the follow:
//
// - A picker. Claude Code 2.1.330 writes nothing to its transcript while a
//   question or a permission prompt is open, not even the words before it; the
//   transcript of a chat sitting on one held only what was typed to it. Its
//   session file says `waiting`, with `waitingFor`. So a chat on a picker for
//   ten minutes came in as finished, to Done, and a followed one came back with
//   nothing to say why.
// - Done. A chat that had gone to Done was never read again, so a question its
//   agent asked after you carried it on in the terminal stayed there.
// - Length. A Codex rollout was read for its first 8 MB, so a longer chat was
//   frozen at that point. One Mac had seven a person had started, the longest
//   806 MB.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { DONE_FOLLOWED_MOST, DONE_FOLLOWED_MS, followClaudeChats, followCodexChats, noteCodexWords, whereTheChatIs } from '../main/chat-follow.mts';
import { claudeSessionState, claudeSessionStatus } from '../main/claude-session-open.mts';
import { readChatTurn } from '../main/agent-sessions.mts';
import { readRollout } from '../main/codex-threads.mts';
import { scanNewChats, QUIET_MS } from '../main/new-chats-watch.mts';
import { slugFor, transcriptSearch } from '../main/transcript-search.mts';
import { saysItStopped, stoppedThere } from '../shared/carried-on-outside.mts';
import { CATCH_UP_LABEL, catchUpDue } from '../shared/agent-import.mts';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules.ts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { asksForYourWords, sentAt } from '../renderer/src/threads/page-rules.ts';

const SID = '7b1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const ASKED = '**Claude Code stopped to ask you a question. Answer it there.**';
const LEAVE = '**Claude Code stopped to ask for your OK. Answer it there.**';

let root;
let home;
let s;
let slug;
let file;
let T0;

const at = (ms: number) => new Date(ms).toISOString();
const typed = (ms: number, text: string) => ({ type: 'user', timestamp: at(ms), origin: { kind: 'human' }, message: { role: 'user', content: text } });
const says = (ms: number, text: string, stop = 'end_turn') => ({ type: 'assistant', timestamp: at(ms), message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: stop } });
// The two rows Claude Code 2.1.330 writes once a picker is answered.
const asked = (ms: number, question: string) => ({ type: 'assistant', timestamp: at(ms), message: { role: 'assistant', content: [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question, options: [] }] } }], stop_reason: 'tool_use' } });
const picked = (ms: number, answers: Record<string, string>) => ({ type: 'user', timestamp: at(ms), toolUseResult: { questions: [], answers, annotations: {} }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'q1', content: 'Your questions have been answered' }] } });
const write = (...rows: unknown[]) => fs.appendFileSync(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
const session = (status: string | null, waitingFor?: string) => {
  const dir = path.join(home, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${process.pid}.json`);
  if (status === null) fs.rmSync(f, { force: true });
  else fs.writeFileSync(f, JSON.stringify({ pid: process.pid, sessionId: SID, status, ...(waitingFor ? { waitingFor } : {}) }));
};
const row = () => s.listItems().find((i) => i.product === slug && (i.labels ?? []).includes(`thread:${SID}`));
const follow = async (now = Date.now()) => followClaudeChats({ store: s, dirs: [home], now });
const inbox = () => belongsInInbox(row(), { now: Date.now() });
const progress = () => belongsInProgress(row(), { now: Date.now() });
const events = () => threadEvents(s.readHistory(slug, row().id));
const said = () => events().filter((e) => e.message).map((e) => [e.who, e.words]);

const bringIn = (over: Record<string, unknown> = {}, land = 'inbox') => s.importThreadRows(slug, [{
  id: SID, source: 'terminal', folder: path.join(root, 'kestrel'), folderName: 'kestrel', short: '~/kestrel', path: file,
  title: 'Fix the flaky checkout test', when: T0 + 60_000, startedAt: T0,
  firstSaid: 'The checkout test fails one run in five. Fix it.', lastSaid: 'It races the clock. Which one?', waiting: true, ...over,
}], { now: T0 + 120_000, land });

beforeEach(async () => {
  T0 = Date.now() - 30 * 60_000;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-waiting-'));
  home = path.join(root, 'claude-home');
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  s = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  ({ slug } = s.createProduct({ name: 'Kestrel', repoPath: path.join(root, 'kestrel') }));
  const projects = path.join(home, 'projects', slugFor(path.join(root, 'kestrel')));
  fs.mkdirSync(projects, { recursive: true });
  file = path.join(projects, `${SID}.jsonl`);
  write(typed(T0, 'The checkout test fails one run in five. Fix it.'), says(T0 + 60_000, 'It races the clock. Which one?'));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('a followed chat whose agent stops on you in the terminal', () => {
  beforeEach(() => bringIn());

  it('comes back to Needs you saying its agent asked you a question, under what you typed', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'));
    session('busy');
    await follow();
    expect(progress()).toBe(true);
    session('waiting', 'input needed');
    await follow();
    expect(row().status).toBe('open');
    expect(inbox()).toBe(true);
    expect(row().result).toBe(ASKED);
    expect(said().slice(-2)).toEqual([['you', 'Mock the clock.'], ['agent', ASKED]]);
  });

  it('was sent when you typed it there, so the list does not date it by when the chat began', async () => {
    const before = sentAt(row());
    write(typed(Date.now() - 20_000, 'Mock the clock.'));
    session('busy');
    await follow();
    expect(sentAt(row())).toBeGreaterThan(before + 60_000);
    const words = sentAt(row());
    session('waiting', 'input needed');
    await follow(Date.now() + 5_000);
    // Its agent's side moves nothing.
    expect(sentAt(row())).toBe(words);
  });

  it('says so once, however often it is read', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'));
    session('waiting', 'input needed');
    await follow();
    const lines = s.readHistory(slug, row().id).length;
    await follow();
    await follow();
    expect(s.readHistory(slug, row().id).length).toBe(lines);
  });

  it('names a permission prompt as your OK', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'));
    session('waiting', 'permission prompt');
    await follow();
    expect(row().result).toBe(LEAVE);
  });

  it('keeps what its agent had written, on a version that writes it down first', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), says(Date.now() - 10_000, 'Two ways to do it.', 'tool_use'));
    session('waiting', 'input needed');
    await follow();
    expect(row().result).toBe(`${ASKED}\n\nTwo ways to do it.`);
  });

  it('is not owed a write-up of a question nobody but the terminal has', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'));
    session('waiting', 'input needed');
    await follow();
    expect(catchUpDue(row())).toBe(false);
    expect((row().labels ?? []).includes(CATCH_UP_LABEL)).toBe(false);
  });

  it('draws what you picked there as yours, and is owed its write-up again once its agent answers', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'));
    session('waiting', 'input needed');
    await follow();
    const t = Date.now() + 1_000;
    write(asked(t, 'Which clock?'), picked(t + 10, { 'Which clock?': 'The test clock (Recommended)' }));
    session('busy');
    await follow(t + 1_000);
    expect(row().status).toBe('claimed');
    write(says(t + 2_000, 'Mocked the test clock. It passes now.'));
    session('idle');
    await follow(t + 3_000);
    expect(row().status).toBe('open');
    expect(said().slice(-4)).toEqual([
      ['you', 'Mock the clock.'],
      ['agent', ASKED],
      ['you', 'The test clock'],
      ['agent', 'Mocked the test clock. It passes now.'],
    ]);
    expect(catchUpDue(row())).toBe(true);
  });

  it('says so again when its agent asks a second time after your pick', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'));
    session('waiting', 'input needed');
    await follow();
    const t = Date.now() + 1_000;
    write(asked(t, 'Which clock?'), picked(t + 10, { 'Which clock?': 'The test clock' }));
    session('waiting', 'input needed');
    await follow(t + 1_000);
    expect(said().slice(-3)).toEqual([['agent', ASKED], ['you', 'The test clock'], ['agent', ASKED]]);
  });

  // The cases that must not match.
  it('says nothing of the kind when its agent was interrupted and is idle', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), typed(Date.now() - 10_000, '[Request interrupted by user]'));
    session('idle');
    await follow();
    expect(row().result).toBe('It races the clock. Which one?');
    expect(inbox()).toBe(true);
  });

  it('takes an answer that has ended as the answer, whatever the session says next', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), says(Date.now() - 5_000, 'Mocked. Ship it?'));
    session('waiting', 'input needed');
    await follow();
    expect(row().result).toBe('Mocked. Ship it?');
  });
});

describe('a chat in Done, carried on in the terminal', () => {
  const doneAt = () => row().wrote.status.ts;
  beforeEach(() => { bringIn({ lastSaid: 'Fixed. Tests pass.', waiting: false }, 'sorted'); });

  it('was in Done', () => {
    expect(row().status).toBe('done');
    expect(inbox()).toBe(false);
  });

  it('comes back when its agent ends on a question, with your words and its answer', async () => {
    write(typed(Date.now() - 20_000, 'Now the flaky login test.'), says(Date.now() - 5_000, 'It waits on a real email. Stub the mailer?'));
    session('idle');
    await follow();
    expect(row().status).toBe('open');
    expect(inbox()).toBe(true);
    expect(row().result).toBe('It waits on a real email. Stub the mailer?');
    const last = events().slice(-2);
    expect(last.map((e) => [e.said, e.words])).toEqual([
      ['You replied in Claude Code', 'Now the flaky login test.'],
      [last[1].said, 'It waits on a real email. Stub the mailer?'],
    ]);
    // Not drawn as a thread you sent back.
    expect(events().map((e) => e.said)).not.toContain('You sent it back');
    // Its write-up was owed and not due while it was in Done.
    expect(catchUpDue(row())).toBe(true);
  });

  it('comes back when its agent stops on a picker there', async () => {
    write(typed(Date.now() - 20_000, 'Now the flaky login test.'));
    session('waiting', 'input needed');
    await follow();
    expect(row().status).toBe('open');
    expect(row().result).toBe(ASKED);
  });

  it('follows on from there like any other chat', async () => {
    write(typed(Date.now() - 40_000, 'Now the flaky login test.'), says(Date.now() - 30_000, 'Stub the mailer?'));
    session('idle');
    await follow();
    write(typed(Date.now() + 500, 'Yes.'));
    session('busy');
    await follow(Date.now() + 1_000);
    expect(row().status).toBe('claimed');
    expect(progress()).toBe(true);
  });

  it('stays in Done while its agent works, and when it ends on a statement', async () => {
    write(typed(Date.now() - 20_000, 'Now the flaky login test.'));
    session('busy');
    const lines = s.readHistory(slug, row().id).length;
    await follow();
    expect(row().status).toBe('done');
    write(says(Date.now() - 5_000, 'Stubbed the mailer. Tests pass.'));
    session('idle');
    await follow();
    expect(row().status).toBe('done');
    expect(s.readHistory(slug, row().id).length).toBe(lines);
  });

  it('stays in Done on a question asked about what you typed before it went there', async () => {
    s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), row().id, { status: 'open' }, { source: 'founder' });
    write(typed(Date.now() - 20_000, 'Now the flaky login test.'));
    s.answerItem(slug, row().id, { status: 'done' });
    expect(doneAt()).toBeGreaterThan(Date.now() - 10_000);
    write(says(Date.now() + 500, 'Stub the mailer?'));
    session('idle');
    await follow(Date.now() + 1_000);
    expect(row().status).toBe('done');
  });

  it('stays in Done once you have replied to it here', async () => {
    s.answerItem(slug, row().id, { answer: 'Try it.' });
    s.answerItem(slug, row().id, { status: 'done' });
    const t = Date.now() + 1_000;
    write(typed(t, 'Now the flaky login test.'), says(t + 100, 'Stub the mailer?'));
    session('idle');
    await follow(t + 1_000);
    expect(row().status).toBe('done');
  });

  it('stays in Done in a project shared with a team', async () => {
    const dir = s.productDir(slug);
    const project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ ...project, team: { projectId: 'p-1', sharedBy: 'someone' } }));
    s.forgetProducts?.();
    write(typed(Date.now() - 20_000, 'Now the flaky login test.'), says(Date.now() - 5_000, 'Stub the mailer?'));
    session('idle');
    await follow();
    expect(row().status).toBe('done');
  });

  it('is read for two weeks, and the newest few hundred only', () => {
    const then = doneAt();
    expect(s.chatsToFollow(then + DONE_FOLLOWED_MS - 1).map((c: { id: string }) => c.id)).toEqual([row().id]);
    expect(s.chatsToFollow(then + DONE_FOLLOWED_MS + 1)).toEqual([]);
    s.importThreadRows(slug, Array.from({ length: DONE_FOLLOWED_MOST + 5 }, (_, i) => ({
      id: `chat-${i}`, source: 'terminal', folder: path.join(root, 'kestrel'), title: `Chat ${i}`, when: T0 + 61_000 + i, startedAt: T0, lastSaid: 'Done.', waiting: false,
    })), { land: 'sorted' });
    const read = s.chatsToFollow();
    expect(read.length).toBe(DONE_FOLLOWED_MOST);
    // The newest, so the first one brought in is the one left out.
    expect(read.some((c: { chat: string }) => c.chat === `chat-${DONE_FOLLOWED_MOST + 4}`)).toBe(true);
    expect(read.some((c: { chat: string }) => c.chat === SID)).toBe(false);
  });
});

describe('a Codex chat in Done, carried on in Codex', () => {
  const CID = '019a7c1e-0000-7000-8000-00000000d0ce';
  const codexRow = () => s.listItems().find((i) => i.product === slug && (i.labels ?? []).includes(`codex:${CID}`));
  const thread = (over: Record<string, unknown>) => ({ id: CID, prompt: 'Rename the plans', title: 'Rename the plans', lastActive: Date.now(), when: Date.now(), turnOpen: false, live: true, ...over });
  const pass = async (t: ReturnType<typeof thread>) => {
    noteCodexWords({ store: s, threads: [t] });
    s.refreshCodexMirrors([t]);
    await followCodexChats({ store: s, threads: [t] });
  };
  beforeEach(() => {
    s.importCodexThreads(slug, [{
      id: CID, source: 'codex', folder: path.join(root, 'kestrel'), title: 'Rename the plans', when: T0, startedAt: T0 - 60_000,
      prompt: 'Rename the plans', last: 'Renamed all three.', waiting: false,
    }], { now: T0 + 1_000, land: 'sorted' });
  });

  it('comes back when Codex ends on a question, with your words and its answer', async () => {
    expect(codexRow().status).toBe('done');
    await pass(thread({ herLast: 'And the docs?', herLastAt: Date.now() - 5_000, last: 'Two pages name them. Rename both?', waiting: true }));
    expect(codexRow().status).toBe('open');
    expect(codexRow().result).toBe('Two pages name them. Rename both?');
    const last = threadEvents(s.readHistory(slug, codexRow().id)).filter((e) => e.message).slice(-2);
    expect(last.map((e) => [e.who, e.words])).toEqual([['you', 'And the docs?'], ['agent', 'Two pages name them. Rename both?']]);
  });

  it('stays in Done on a statement, mid-turn, or on words from before it went there', async () => {
    const asks = { herLast: 'And the docs?', herLastAt: Date.now() - 5_000, last: 'Rename both?', waiting: true };
    await pass(thread({ ...asks, last: 'Renamed those too.', waiting: false }));
    expect(codexRow().status).toBe('done');
    await pass(thread({ ...asks, turnOpen: true }));
    expect(codexRow().status).toBe('done');
    await pass(thread({ ...asks, turnOpen: null }));
    expect(codexRow().status).toBe('done');
    await pass(thread({ ...asks, herLastAt: codexRow().wrote.status.ts }));
    expect(codexRow().status).toBe('done');
    await pass(thread({ ...asks, herLastAt: codexRow().wrote.status.ts + 1 }));
    expect(codexRow().status).toBe('open');
  });
});

describe('a new chat, brought in while its agent waits in the terminal', () => {
  const NOW = Date.now();
  const chat = (over: Record<string, unknown> = {}) => ({
    id: SID, source: 'terminal', folder: path.join(root, 'kestrel'), folderName: 'kestrel', path: file, title: 'Fix the flaky checkout test',
    startedAt: NOW - 3600e3, when: NOW - QUIET_MS - 60e3, firstSaid: 'Fix it.', lastSaid: '', waiting: false, ask: '', ...over,
  });
  const scan = (t: ReturnType<typeof chat>, state: { status: string; waitingFor: string } | null) => scanNewChats({
    store: s, config: { importNew: true, importNewSince: NOW - 2 * 3600e3 }, now: NOW,
    readThreads: async () => [t], isOpen: () => !!state, stateOf: () => state,
  } as never);

  it('lands in Needs you saying so, on a question or a permission prompt', async () => {
    await scan(chat(), { status: 'waiting', waitingFor: 'input needed' });
    expect(row().status).toBe('open');
    expect(row().result).toBe(ASKED);
    expect(catchUpDue(row())).toBe(false);
    // And the follow has nothing to add to it.
    write(typed(NOW - QUIET_MS - 60e3, 'Fix it.'));
    session('waiting', 'input needed');
    const lines = s.readHistory(slug, row().id).length;
    await follow();
    expect(s.readHistory(slug, row().id).length).toBe(lines);
  });

  it('keeps the last thing its agent said under the permission prompt', async () => {
    await scan(chat({ lastSaid: 'The migration is written.' }), { status: 'waiting', waitingFor: 'permission prompt' });
    expect(row().status).toBe('open');
    expect(row().result).toBe(`${LEAVE}\n\nThe migration is written.`);
  });

  it('waits while its agent is at work, however long that writes nothing', async () => {
    for (const status of ['busy', 'shell']) {
      expect((await scan(chat(), { status, waitingFor: '' })).brought).toBe(0);
    }
    expect(row()).toBeUndefined();
  });

  it('is still filed by how it ended when its session is idle, closed or says nothing', async () => {
    await scan(chat({ lastSaid: 'Fixed. Tests pass.' }), { status: 'idle', waitingFor: '' });
    expect(row().status).toBe('done');
    expect(row().result).toBe('Fixed. Tests pass.');
    expect((row().labels ?? []).includes(CATCH_UP_LABEL)).toBe(true);
  });
});

describe('what the session file says', () => {
  it('names the status and what it waits for, and null once nothing holds it', () => {
    session('waiting', 'permission prompt');
    expect(claudeSessionState(SID, [home])).toEqual({ status: 'waiting', waitingFor: 'permission prompt' });
    session('busy');
    expect(claudeSessionState(SID, [home])).toEqual({ status: 'busy', waitingFor: '' });
    expect(claudeSessionStatus(SID, [home])).toBe('busy');
    session(null);
    expect(claudeSessionState(SID, [home])).toBeNull();
    expect(claudeSessionStatus(SID, [home])).toBeNull();
  });

  it('words each wait, and an unnamed one as a question', () => {
    expect(stoppedThere('input needed')).toBe(ASKED);
    expect(stoppedThere('permission prompt')).toBe(LEAVE);
    expect(stoppedThere('')).toBe(ASKED);
  });

  // On a real picker the list said Answered beside it.
  it('reads as waiting on you in the list, and an ordinary answer does not', () => {
    expect(asksForYourWords({ result: ASKED, wrote: { result: { ts: 1 } } })).toBe(true);
    expect(asksForYourWords({ result: `${LEAVE}\n\nThe migration is written.`, wrote: { result: { ts: 1 } } })).toBe(true);
    expect(saysItStopped('Claude Code stopped to ask. I answered it.')).toBe(false);
    expect(asksForYourWords({ result: 'Claude Code stopped early. Fixed.', wrote: { result: { ts: 1 } } })).toBe(false);
    expect(saysItStopped(undefined)).toBe(false);
  });

  it('decides a wait only on a turn that has not ended', () => {
    const turn = { heard: 'x', heardAt: 10, said: '', saidAt: 0, ended: false };
    expect(whereTheChatIs(turn, { running: false, waitingFor: 'input needed', knownAt: 0 })).toEqual({ move: 'stopped', stop: ASKED, news: '' });
    expect(whereTheChatIs(turn, { running: false, waitingFor: null, knownAt: 0 })).toEqual({ move: 'stays' });
    expect(whereTheChatIs({ ...turn, said: 'Older.', saidAt: 5 }, { running: false, waitingFor: '', knownAt: 5 })).toEqual({ move: 'stopped', stop: ASKED, news: '' });
    expect(whereTheChatIs({ ...turn, said: 'Newer.', saidAt: 6 }, { running: false, waitingFor: '', knownAt: 5 })).toEqual({ move: 'stopped', stop: ASKED, news: 'Newer.' });
  });

  it('reads several picks with their questions, and none from any other tool', () => {
    write(asked(T0 + 200_000, 'Which clock?'), picked(T0 + 201_000, { 'Which clock?': 'The test clock', 'How often?': 'Every run (Recommended)' }));
    expect(readChatTurn(file)).toMatchObject({ heard: 'Which clock?\nThe test clock\n\nHow often?\nEvery run', heardAt: T0 + 201_000, ended: false });
    write({ type: 'user', timestamp: at(T0 + 300_000), toolUseResult: { stdout: 'ok', answers: 'no' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }] } });
    expect(readChatTurn(file)!.heardAt).toBe(T0 + 201_000);
  });
});

describe('where a followed chat is looked for', () => {
  it('is its project folder first, without a search of every folder', async () => {
    bringIn();
    write(typed(Date.now() - 20_000, 'Mock the clock.'));
    session('busy');
    const other = path.join(root, 'other-home');
    fs.mkdirSync(path.join(other, 'projects', 'elsewhere'), { recursive: true });
    const reads: string[] = [];
    const readdir = fs.promises.readdir;
    fs.promises.readdir = (dir: string, ...rest: unknown[]) => { reads.push(String(dir)); return readdir(dir, ...rest); };
    try {
      await followClaudeChats({ store: s, dirs: [other, home] });
      await transcriptSearch();
    } finally { fs.promises.readdir = readdir; }
    expect(row().status).toBe('claimed');
    expect(reads).toEqual([]);
  });
});

describe('a Codex rollout longer than one read', () => {
  const MB = 1024 * 1024;
  const line = (ms: number, type: string, payload: unknown) => `${JSON.stringify({ timestamp: at(ms), type, payload })}\n`;
  const says2 = (ms: number, role: string, text: string) => line(ms, 'response_item', { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] });
  // Codex's own record lines between two turns.
  const records = (mb: number) => line(T0 + 10_000, 'event_msg', { type: 'record', blob: 'é'.repeat(16 * 1024) }).repeat(Math.ceil((mb * MB) / (32 * 1024 + 100)));
  const rollout = (mb: number) => {
    const f = path.join(root, `rollout-${mb}.jsonl`);
    fs.writeFileSync(f, [
      line(T0, 'session_meta', { id: 'c-9', session_id: 'c-9', cwd: path.join(root, 'kestrel'), source: 'cli', thread_source: 'user', originator: 'codex_cli_rs', timestamp: at(T0) }),
      line(T0 + 1, 'event_msg', { type: 'task_started', turn_id: 't1' }),
      says2(T0 + 2, 'user', 'Rename the plans'),
      says2(T0 + 3, 'assistant', 'Which names?'),
      line(T0 + 4, 'event_msg', { type: 'task_complete', turn_id: 't1' }),
      records(mb),
      line(T0 + 60_000, 'event_msg', { type: 'task_started', turn_id: 't2' }),
      says2(T0 + 60_001, 'user', 'Starter, Team and Scale.'),
      says2(T0 + 65_000, 'assistant', 'Rename the docs too?'),
      line(T0 + 65_001, 'event_msg', { type: 'task_complete', turn_id: 't2' }),
    ].join(''));
    return f;
  };
  const whole = { prompt: 'Rename the plans', last: 'Rename the docs too?', herLast: 'Starter, Team and Scale.', herLastAt: 0, turnOpen: false, herTurnLast: false };

  it('reads both its first message and how it stands now, at 1, 12 and 40 MB', () => {
    for (const mb of [1, 12, 40]) {
      expect(readRollout(rollout(mb))).toMatchObject({ ...whole, herLastAt: T0 + 60_001 });
    }
  });

  it('never takes an older turn for the last one across the part it skips', () => {
    const f = path.join(root, 'rollout-cut.jsonl');
    fs.writeFileSync(f, [
      line(T0, 'session_meta', { id: 'c-8', session_id: 'c-8', cwd: path.join(root, 'kestrel'), source: 'cli', thread_source: 'user', originator: 'codex_cli_rs', timestamp: at(T0) }),
      line(T0 + 1, 'event_msg', { type: 'task_started', turn_id: 't1' }),
      says2(T0 + 2, 'user', 'Rename the plans'),
      records(40),
    ].join(''));
    // Its turn was opened before the skipped part, and what happened in there is not known.
    expect(readRollout(f)).toMatchObject({ prompt: 'Rename the plans', turnOpen: null });
  });
});

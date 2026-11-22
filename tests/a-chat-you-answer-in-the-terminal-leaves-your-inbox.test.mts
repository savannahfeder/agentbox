// A CHAT YOU ANSWER IN THE TERMINAL LEAVES YOUR INBOX, AND COMES BACK WHEN ITS
// AGENT ANSWERS THERE.
//
// The founder, after the first onboarding call (2026-11-21): "If somebody sends
// a response to an agent in the terminal, you don't want it still in your
// inbox." Measured before this change: a Claude Code chat brought in was
// written once, at import, and nothing read it again. Typing to it in the
// terminal changed nothing here, and neither did the agent's answer: the row
// sat in Needs you with the question it was brought in on. A Codex chat took
// Codex's answers but not the reply that came before them.
//
// Claimed is how it leaves: the claim puts it in In progress, reading as an
// agent working outside this window, and its lease brings it back if this app
// stops watching. A thread brought in is a question, which Needs you keeps
// whatever else is true of it, so the list rules let this one claim through.
// What you typed there goes on the thread as yours, before the answer it got;
// the first version said only "Replied in Claude Code", and the agent's "as you
// said" then pointed at nothing on the screen.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { CODEX_QUIET_MS, codexWorking, followClaudeChats, followCodexChats, newWords, noteCodexWords, whereTheChatIs } from '../main/chat-follow.mts';
import { readChatTurn } from '../main/agent-sessions.mts';
import { readRollout } from '../main/codex-threads.mts';
import { transcriptSearch } from '../main/transcript-search.mts';
import { HELD_IN, carriedOnIn, heldOutside } from '../shared/carried-on-outside.mts';
import { belongsInInbox, belongsInProgress, stillAsksYou } from '../renderer/src/list-rules.ts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { offerIsLive } from '../renderer/src/format.ts';
import { liveLine } from '../renderer/src/live-line.ts';
import { threadSnapshot } from '../shared/phone-snapshot.mts';

const SID = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';

let root;
let home;
let s;
let slug;
let file;
let T0;

const at = (ms) => new Date(ms).toISOString();
const typed = (ms, text) => ({ type: 'user', timestamp: at(ms), message: { role: 'user', content: text } });
const says = (ms, text, stop = 'end_turn') => ({ type: 'assistant', timestamp: at(ms), message: { role: 'assistant', content: [{ type: 'text', text }], stop_reason: stop } });
const runs = (ms) => ({ type: 'assistant', timestamp: at(ms), message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }], stop_reason: 'tool_use' } });
const ran = (ms) => ({ type: 'user', timestamp: at(ms), toolUseResult: { stdout: 'ok' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } });
const write = (...rows) => fs.appendFileSync(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
const session = (status) => {
  const dir = path.join(home, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${process.pid}.json`);
  if (status === null) fs.rmSync(f, { force: true });
  else fs.writeFileSync(f, JSON.stringify({ pid: process.pid, sessionId: SID, status, statusUpdatedAt: Date.now() }));
};
const row = () => s.listItems().find((i) => i.product === slug && (i.labels ?? []).includes(`thread:${SID}`));
const follow = async () => {
  await followClaudeChats({ store: s, dirs: [home] });
  await transcriptSearch();
  return followClaudeChats({ store: s, dirs: [home] });
};
const inbox = (i) => belongsInInbox(i, { now: Date.now() });
const progress = (i) => belongsInProgress(i, { now: Date.now() });

beforeEach(async () => {
  T0 = Date.now() - 30 * 60_000;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-follow-'));
  home = path.join(root, 'claude-home');
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  s = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  ({ slug } = s.createProduct({ name: 'Kestrel', repoPath: path.join(root, 'kestrel') }));
  const projects = path.join(home, 'projects', '-tmp-kestrel');
  fs.mkdirSync(projects, { recursive: true });
  file = path.join(projects, `${SID}.jsonl`);
  write(typed(T0, 'The checkout test fails one run in five. Fix it.'), says(T0 + 60_000, 'It races the clock. Mock the clock, or retry once. Which one?'));
  s.importThreadRows(slug, [{
    id: SID, source: 'terminal', folder: path.join(root, 'kestrel'), folderName: 'kestrel', short: '~/kestrel', path: file,
    title: 'Fix the flaky checkout test', when: T0 + 60_000, startedAt: T0,
    firstSaid: 'The checkout test fails one run in five. Fix it.',
    lastSaid: 'It races the clock. Mock the clock, or retry once. Which one?', waiting: true,
  }], { now: T0 + 120_000 });
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('a Claude Code chat brought in, answered in the terminal', () => {
  it('was in Needs you before, and stays there while nobody has typed to it', async () => {
    expect(inbox(row())).toBe(true);
    session('idle');
    await follow();
    expect(row().status).toBe('open');
    expect(inbox(row())).toBe(true);
  });

  it('leaves Needs you for In progress while its agent works on what you typed there', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000), ran(Date.now() - 10_000));
    session('busy');
    await follow();
    const r = row();
    expect(r.status).toBe('claimed');
    expect(r.claim.holder).toBe(HELD_IN.claude);
    expect(heldOutside(r)).toBe(true);
    expect(stillAsksYou(r)).toBe(false);
    expect(inbox(r)).toBe(false);
    expect(progress(r)).toBe(true);
    expect(liveLine(r, { inProgress: true, now: Date.now() }).state).toBe('elsewhere');
    const events = threadEvents(s.readHistory(slug, r.id));
    const yours = events.filter((e) => e.said === 'You replied in Claude Code');
    expect(yours).toHaveLength(1);
    expect(yours[0]).toMatchObject({ who: 'you', words: 'Mock the clock.', message: true });
    expect(events.map((e) => e.said)).not.toContain('An agent picked it up');
  });

  it('draws what you typed there before the answer it got, and each only once', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), says(Date.now() - 5_000, 'Mocked. It passes now.'));
    session('idle');
    await follow();
    await follow();
    const events = threadEvents(s.readHistory(slug, row().id)).filter((e) => e.message);
    expect(events.map((e) => e.words)).toEqual([
      'The checkout test fails one run in five. Fix it.',
      'It races the clock. Mock the clock, or retry once. Which one?',
      'Mock the clock.',
      'Mocked. It passes now.',
    ]);
    expect(events[2].who).toBe('you');
  });

  // Measured 2026-11-21 on a real chat: answered in the terminal, its thread
  // still offered the three options you had answered, and a press would have
  // sent a second reply to an agent already at work on the first.
  it('stops offering the options you answered there, until the next answer offers its own', () => {
    const offered = { result: '**Which one?**\n\n## Options\n1. Mock the clock\n2. Retry once', wrote: { result: { ts: 100 } } };
    expect(offerIsLive(offered)).toBe(true);
    expect(offerIsLive({ ...offered, wrote: { result: { ts: 100 }, saidOutside: { ts: 150 } } })).toBe(false);
    expect(offerIsLive({ ...offered, wrote: { result: { ts: 200 }, saidOutside: { ts: 150 } } })).toBe(true);
  });

  it('does not take words an agent wrote on the row for yours', () => {
    s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), row().id, { saidOutside: 'Ship it.' }, { source: 'agent' });
    const events = threadEvents(s.readHistory(slug, row().id));
    expect(events.some((e) => e.words === 'Ship it.')).toBe(false);
  });

  it('comes back to Needs you with the answer its agent gave there', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000), ran(Date.now() - 10_000));
    session('busy');
    await follow();
    write(says(Date.now() - 1_000, 'Done: the clock is mocked and the test passed 200 runs in a row. Ship it?'));
    session('idle');
    await follow();
    const r = row();
    expect(r.status).toBe('open');
    expect(r.claim).toBeNull();
    expect(r.result).toBe('Done: the clock is mocked and the test passed 200 runs in a row. Ship it?');
    expect(inbox(r)).toBe(true);
    expect(progress(r)).toBe(false);
    // The same answer is not written twice.
    const lines = s.readHistory(slug, r.id).length;
    await follow();
    expect(s.readHistory(slug, r.id).length).toBe(lines);
  });

  it('takes an answer that came between two looks, without ever leaving Needs you', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), says(Date.now() - 5_000, 'Mocked. It passes now.'));
    session('idle');
    await follow();
    expect(row().status).toBe('open');
    expect(row().result).toBe('Mocked. It passes now.');
  });

  it('comes back when the terminal is closed before its agent answered', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000));
    session('busy');
    await follow();
    expect(row().status).toBe('claimed');
    session(null);
    const old = new Date(Date.now() - 10 * 60_000);
    fs.utimesSync(file, old, old);
    await follow();
    expect(row().status).toBe('open');
    expect(inbox(row())).toBe(true);
  });

  it('comes back when its agent stops on something in the terminal', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000));
    session('busy');
    await follow();
    session('waiting');
    await follow();
    expect(row().status).toBe('open');
    expect(inbox(row())).toBe(true);
  });

  it('leaves a hold to its lease while the transcript cannot be found, and the lease brings it back', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000));
    session('busy');
    await follow();
    expect(row().status).toBe('claimed');
    fs.renameSync(file, `${file}.moved`);
    await followClaudeChats({ store: s, dirs: [home] });
    expect(row().status).toBe('claimed');
    const later = Date.now() + 6 * 60_000;
    const lapsed = s.listItems(later).find((i) => i.product === slug && (i.labels ?? []).includes(`thread:${SID}`));
    expect(lapsed.status).toBe('open');
    expect(belongsInInbox(lapsed, { now: later })).toBe(true);
  });

  it('counts a chat still being written to as running when no session file says otherwise', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000));
    session(null);
    await follow();
    expect(row().status).toBe('claimed');
  });

  it('is let go of the moment you reply here, so the run your reply starts can take it', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000));
    session('busy');
    await follow();
    expect(row().status).toBe('claimed');
    s.answerItem(slug, row().id, { answer: 'Retry once instead.' });
    expect(row().claim).toBeNull();
    expect(row().status).toBe('open');
    // And not taken back while the reply waits for its run.
    await follow();
    expect(row().claim).toBeNull();
  });

  it('is let go of when you close it here, and stays closed', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000));
    session('busy');
    await follow();
    s.answerItem(slug, row().id, { status: 'done' });
    expect(row().status).toBe('done');
    write(says(Date.now() - 1_000, 'Done. Ship it?'));
    session('idle');
    await follow();
    expect(row().status).toBe('done');
    expect(row().result).not.toBe('Done. Ship it?');
  });

  it('leaves Needs you on the phone too, whose copy carries no claim', async () => {
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000));
    session('busy');
    await follow();
    const snap = threadSnapshot(row(), s.readHistory(slug, row().id));
    const phone = snap.item;
    expect(snap.history.some((l) => l.patch?.saidOutside === 'Mock the clock.')).toBe(true);
    expect(phone.claim).toBeUndefined();
    expect(phone.carriedOn).toBe('Claude Code');
    expect(belongsInInbox(phone, { now: Date.now() })).toBe(false);
    expect(liveLine(phone, { inProgress: true, now: Date.now() }).state).toBe('elsewhere');
    session('idle');
    write(says(Date.now() - 1_000, 'Mocked.'));
    await follow();
    const after = threadSnapshot(row(), s.readHistory(slug, row().id)).item;
    expect(after.carriedOn).toBeUndefined();
    expect(belongsInInbox(after, { now: Date.now() })).toBe(true);
  });

  it('is never followed in a project shared with a team', async () => {
    const dir = s.productDir(slug);
    const project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ ...project, team: { projectId: 'p-1', sharedBy: 'someone' } }));
    s.forgetProducts?.();
    write(typed(Date.now() - 20_000, 'Mock the clock.'), runs(Date.now() - 15_000));
    session('busy');
    await follow();
    expect(row().status).toBe('open');
    expect(s.chatsToFollow().length).toBe(0);
  });
});

// Measured 2026-11-21 on a real chat: its answer came at 7:20:46, the write-up
// of it landed at 7:21:07, and what was typed in the terminal at 7:20:58 never
// reached the thread, because it was older than the row's last write. The row
// now remembers how far the chat has been read (`chatAt`).
describe('what happens in the terminal while the last answer is written up', () => {
  const writeUp = (now) => s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), row().id, { problem: 'A flaky test.', result: '**Ship it?**\n\nMocked.\n\n## Options\n1. Ship it\n2. Wait' }, { source: 'agent', now });
  const answered = async () => {
    write(typed(T0 + 200_000, 'Mock the clock.'), says(T0 + 230_000, 'Mocked. Ship it?'));
    session('idle');
    await follow();
    expect(row().result).toBe('Mocked. Ship it?');
  };

  it('is on the thread, though it was typed before the write-up landed', async () => {
    await answered();
    write(typed(T0 + 240_000, 'Run it 200 times first.'), runs(T0 + 241_000));
    writeUp(Date.now() + 1_000);
    session('busy');
    await followClaudeChats({ store: s, dirs: [home], now: Date.now() + 2_000 });
    expect(row().status).toBe('claimed');
    expect(threadEvents(s.readHistory(slug, row().id)).filter((e) => e.saidOutside).map((e) => e.words)).toEqual(['Mock the clock.', 'Run it 200 times first.']);
    // So the options it answered are no longer offered.
    expect(offerIsLive(row())).toBe(false);
  });

  it('answers the row too, when the agent finished before the write-up landed', async () => {
    await answered();
    write(typed(T0 + 240_000, 'Run it 200 times first.'), says(T0 + 250_000, 'All 200 passed.'));
    writeUp(Date.now() + 1_000);
    await followClaudeChats({ store: s, dirs: [home], now: Date.now() + 2_000 });
    expect(row().result).toBe('All 200 passed.');
  });

  it('is not read twice when nothing is newer than what was read', async () => {
    await answered();
    writeUp(Date.now() + 1_000);
    const lines = s.readHistory(slug, row().id).length;
    await followClaudeChats({ store: s, dirs: [home], now: Date.now() + 2_000 });
    expect(s.readHistory(slug, row().id).length).toBe(lines);
    expect(row().result).toMatch(/^\*\*Ship it\?/);
  });

  it('a row brought in before the app kept this is read from its last write, as it was', () => {
    const { knownAt, heardThrough } = s.chatsToFollow()[0];
    expect([knownAt, heardThrough]).toEqual([T0 + 60_000, T0 + 60_000]);
    s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), row().id, { chatAt: 0 }, { source: 'system' });
    expect(s.chatsToFollow()[0].knownAt).toBe(row().wrote.result.ts);
  });
});

describe('a Codex chat brought in, answered in Codex', () => {
  const CID = '019a7c1e-0000-7000-8000-00000000c0de';
  const codexRow = () => s.listItems().find((i) => i.product === slug && (i.labels ?? []).includes(`codex:${CID}`));
  beforeEach(() => {
    s.importCodexThreads(slug, [{
      id: CID, source: 'codex', folder: path.join(root, 'kestrel'), title: 'Rename the plans', when: T0, startedAt: T0 - 60_000,
      prompt: 'Rename the plans', last: 'Which names?', waiting: true,
    }], { now: T0 + 1_000 });
  });

  // What the Codex watch hands over: one read, words first, then its answers, then the moves.
  const pass = async (t) => {
    noteCodexWords({ store: s, threads: [t] });
    s.refreshCodexMirrors([t]);
    await followCodexChats({ store: s, threads: [t] });
  };
  const thread = (over) => ({ id: CID, prompt: 'Rename the plans', title: 'Rename the plans', last: 'Which names?', lastActive: Date.now(), when: Date.now(), ...over });

  it('leaves Needs you while Codex works on your reply, and comes back with its answer', async () => {
    expect(codexRow().status).toBe('open');
    await pass(thread({ herTurnLast: true, herLast: 'Starter, Team and Scale.', herLastAt: Date.now() - 5_000, turnOpen: true, live: true }));
    expect(codexRow().status).toBe('claimed');
    expect(codexRow().claim.holder).toBe(HELD_IN.codex);
    expect(belongsInInbox(codexRow(), { now: Date.now() })).toBe(false);
    await pass(thread({ herTurnLast: false, herLast: 'Starter, Team and Scale.', herLastAt: Date.now() - 5_000, turnOpen: false, last: 'Renamed all three.', live: true }));
    expect(codexRow().status).toBe('open');
    expect(codexRow().result).toBe('Renamed all three.');
    const messages = threadEvents(s.readHistory(slug, codexRow().id)).filter((e) => e.message);
    expect(messages.slice(-2).map((e) => [e.said, e.words])).toEqual([
      ['You replied in Codex', 'Starter, Team and Scale.'],
      ['It came back to you', 'Renamed all three.'],
    ]);
  });

  it('takes an answer Codex gave while its last one was being written up, and keeps the write-up until then', async () => {
    const t = Date.now() - 60_000;
    await pass(thread({ herLast: 'Starter, Team and Scale.', herLastAt: t, turnOpen: false, last: 'Renamed all three.', saidAt: t + 5_000 }));
    s.modules.workItemsDisk.updateWorkItem(s.productDir(slug), codexRow().id, { problem: 'Plan names.', result: '**Ship it?**' }, { source: 'agent' });
    // Read again with nothing new: the write-up stands, whatever else touched the file.
    await pass(thread({ herLast: 'Starter, Team and Scale.', herLastAt: t, turnOpen: false, last: 'Renamed all three.', saidAt: t + 5_000, when: Date.now() + 60_000 }));
    expect(codexRow().result).toBe('**Ship it?**');
    await pass(thread({ herLast: 'Docs too.', herLastAt: t + 10_000, turnOpen: false, last: 'Docs renamed.', saidAt: t + 20_000, when: t + 20_000 }));
    expect(codexRow().result).toBe('Docs renamed.');
    expect(threadEvents(s.readHistory(slug, codexRow().id)).filter((e) => e.saidOutside).map((e) => e.words)).toEqual(['Starter, Team and Scale.', 'Docs too.']);
  });

  it('stays In progress through Codex\'s own messages mid-turn, which is what its turn marks are for', async () => {
    await pass(thread({ herTurnLast: false, herLast: 'Starter, Team and Scale.', herLastAt: Date.now() - 5_000, turnOpen: true, last: 'Looking at the plans page.' }));
    expect(codexRow().status).toBe('claimed');
  });

  it('is let go of when Codex goes quiet mid-turn for long enough to have died', async () => {
    await pass(thread({ herTurnLast: true, turnOpen: true }));
    expect(codexRow().status).toBe('claimed');
    await pass(thread({ herTurnLast: true, turnOpen: true, lastActive: Date.now() - CODEX_QUIET_MS - 1 }));
    expect(codexRow().status).toBe('open');
  });

  it('falls back to who wrote last on a conversation that marks no turns', () => {
    expect(codexWorking({ herTurnLast: true, live: true, turnOpen: null })).toBe(true);
    expect(codexWorking({ herTurnLast: true, live: false, turnOpen: null })).toBe(false);
    expect(codexWorking({ herTurnLast: false, live: true })).toBe(false);
  });
});

describe('reading where a chat stands', () => {
  it('reads your last message, the answer since, and whether that turn is over', () => {
    write(typed(T0 + 200_000, 'Mock the clock.'), runs(T0 + 210_000), ran(T0 + 220_000), says(T0 + 230_000, 'Mocked.'));
    expect(readChatTurn(file)).toMatchObject({ heard: 'Mock the clock.', heardAt: T0 + 200_000, said: 'Mocked.', saidAt: T0 + 230_000, ended: true });
  });

  it('does not take a tool result, an interruption or a reminder for something you typed', () => {
    write(
      typed(T0 + 200_000, 'Mock the clock.'),
      runs(T0 + 210_000),
      ran(T0 + 220_000),
      typed(T0 + 225_000, '[Request interrupted by user for tool use]'),
      typed(T0 + 226_000, '<system-reminder>note</system-reminder>'),
    );
    const turn = readChatTurn(file);
    expect(turn.heardAt).toBe(T0 + 200_000);
    expect(turn.ended).toBe(false);
  });

  // Measured 2026-11-21 on a real Claude Code 2.1.330 chat: one question and
  // its answer were 421 KB, the question 420 KB from the end, past the 256 KB
  // read, because each request also writes its attachments and request records.
  // What was typed in the terminal never reached the thread.
  const records = (ms, kb) => Array.from({ length: kb / 32 }, () => ({ type: 'api-request-blob', timestamp: at(ms), blob: 'x'.repeat(32 * 1024) }));

  it('finds what you typed behind a turn of request records longer than the tail', () => {
    write(says(T0 + 100_000, 'Earlier.'), typed(T0 + 200_000, 'Mock the clock.'), ...records(T0 + 201_000, 320), runs(T0 + 210_000), ran(T0 + 220_000), ...records(T0 + 221_000, 96), says(T0 + 230_000, 'Mocked.'));
    expect(fs.statSync(file).size).toBeGreaterThan(400 * 1024);
    expect(readChatTurn(file)).toMatchObject({ heard: 'Mock the clock.', heardAt: T0 + 200_000, said: 'Mocked.', saidAt: T0 + 230_000, ended: true });
  });

  it('reads no further back than it must when the tail already holds what you typed', () => {
    write(typed(T0 + 100_000, 'Older words.'), ...records(T0 + 101_000, 320), typed(T0 + 200_000, 'Mock the clock.'), says(T0 + 230_000, 'Mocked.'));
    expect(readChatTurn(file).heard).toBe('Mock the clock.');
  });

  it('gives up past a few megabytes with nothing typed, and still reads the answer', () => {
    write(typed(T0 + 100_000, 'Long ago.'), ...records(T0 + 101_000, 8 * 1024 + 64), says(T0 + 230_000, 'Mocked.'));
    const turn = readChatTurn(file);
    expect(turn).toMatchObject({ heard: '', heardAt: 0, said: 'Mocked.', ended: true });
  });

  // Measured 2026-11-21 on a real Claude Code 2.1.330 chat: a background
  // command finished, Claude Code wrote its own <task-notification> as a user
  // row, and the thread showed that XML under You as if typed in the terminal.
  it("does not take Claude Code's own notice of a finished background command for something you typed", () => {
    const notice = { type: 'user', timestamp: at(T0 + 240_000), origin: { kind: 'task-notification', producer: 'session-task' }, promptSource: 'system', message: { role: 'user', content: '<task-notification>\n<task-id>b4</task-id>\n<status>completed</status>\n</task-notification>' } };
    const bare = { ...notice, origin: undefined, promptSource: undefined, timestamp: at(T0 + 250_000) };
    write({ ...typed(T0 + 200_000, 'Mock the clock.'), origin: { kind: 'human' }, promptSource: 'typed' }, says(T0 + 230_000, 'Started it in the background.'), notice, bare, says(T0 + 260_000, 'Mocked.'));
    expect(readChatTurn(file)).toMatchObject({ heard: 'Mock the clock.', heardAt: T0 + 200_000, said: 'Started it in the background.\n\nMocked.' });
  });

  it('decides each case, and only an answer the row has not had is news', () => {
    const turn = { ended: true };
    expect(whereTheChatIs(null, { running: true, news: true })).toEqual({ move: 'stays' });
    expect(whereTheChatIs({ ended: false }, { running: true, news: true })).toEqual({ move: 'working' });
    expect(whereTheChatIs({ ended: false }, { running: false, news: true })).toEqual({ move: 'stays' });
    expect(whereTheChatIs(turn, { running: false, news: true })).toEqual({ move: 'answered' });
    expect(whereTheChatIs(turn, { running: false, news: false })).toEqual({ move: 'stays' });
    expect(whereTheChatIs(turn, { running: false, news: true, cut: true })).toEqual({ move: 'cut' });
  });

  it('reads a Codex turn the way Codex 0.171 writes one: open until task_complete, your words kept', () => {
    // The shape of a real rollout on Codex 0.171.0: no user_message events, the
    // turns as response_item messages, and the turn marked by task_started and task_complete.
    const rollout = path.join(root, 'rollout-2026-11-21T21-19-27-codex.jsonl');
    const line = (ms, type, payload) => JSON.stringify({ timestamp: at(ms), type, payload });
    const head = [
      line(T0, 'session_meta', { id: 'c-1', session_id: 'c-1', cwd: path.join(root, 'kestrel'), source: 'cli', thread_source: 'user', originator: 'codex_cli_rs', history_mode: 'paginated', timestamp: at(T0) }),
      line(T0 + 1_000, 'event_msg', { type: 'task_started', turn_id: 't1' }),
      line(T0 + 1_100, 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Rename the plans' }] }),
      line(T0 + 9_000, 'response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Which names?' }] }),
      line(T0 + 9_100, 'event_msg', { type: 'task_complete', turn_id: 't1', last_agent_message: 'Which names?' }),
      line(T0 + 60_000, 'event_msg', { type: 'task_started', turn_id: 't2' }),
      line(T0 + 60_100, 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Starter, Team and Scale.' }] }),
      line(T0 + 65_000, 'response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Looking at the plans page.' }] }),
    ];
    fs.writeFileSync(rollout, `${head.join('\n')}\n`);
    expect(readRollout(rollout)).toMatchObject({ herLast: 'Starter, Team and Scale.', herLastAt: T0 + 60_100, saidAt: T0 + 65_000, turnOpen: true, herTurnLast: false });
    fs.appendFileSync(rollout, `${line(T0 + 70_000, 'event_msg', { type: 'task_complete', turn_id: 't2' })}\n`);
    expect(readRollout(rollout).turnOpen).toBe(false);
  });

  it('takes only words typed after the row last heard from the chat', () => {
    expect(newWords({ heard: 'Mock it.', heardAt: 20 }, 19)).toBe('Mock it.');
    expect(newWords({ heard: 'Mock it.', heardAt: 20 }, 20)).toBe('');
    expect(newWords({ heard: '', heardAt: 30 }, 0)).toBe('');
    expect(newWords(null, 0)).toBe('');
  });

  it('names only the follow\'s own claims as carried on outside', () => {
    expect(carriedOnIn(HELD_IN.claude)).toBe('Claude Code');
    expect(carriedOnIn(HELD_IN.codex)).toBe('Codex');
    expect(carriedOnIn('mcp-1234')).toBeNull();
    expect(heldOutside({ claim: { holder: 'mcp-1234' } })).toBe(false);
    expect(heldOutside({ claim: { holder: HELD_IN.claude }, claimExpired: true })).toBe(false);
  });
});

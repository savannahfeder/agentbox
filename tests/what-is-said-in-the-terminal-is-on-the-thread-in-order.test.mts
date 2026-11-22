// WHAT IS SAID IN THE TERMINAL IS ON THE THREAD, IN ORDER, EACH ONCE.
//
// The first power tester to live in both (2026-11-22, an hour on real Claude
// Code 2.1.330) lost count of which of their words the thread had:
//
// - A message typed while the agent worked was not on the thread. Claude Code
//   keeps it as a `queued_command` attachment, never as a message. Of three
//   messages typed between two looks only the last was.
// - A picker's questions were drawn under You, as if typed, over a line still
//   saying "Answer it there". The question is in the transcript only once it is
//   answered, so it is the agent's from then on.
// - The same lines were on it twice, once under the stop and again at the top
//   of the answer, and everything wore the time it was read, up to 100 s late.
// - After Esc on a picker the thread went on saying it was open.
// - A chat that came in finished said "You marked it done".
// - A reply typed here and waiting for its run (16 minutes on a Mac short of
//   memory) ended the follow at once: what the terminal then said was nowhere,
//   and a chat closed with such a reply never came back.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { followClaudeChats, notYetRead, startChatFollow } from '../main/chat-follow.mts';
import { readChatTurn } from '../main/agent-sessions.mts';
import { slugFor } from '../main/transcript-search.mts';
import { CLOSED_THERE, CUT_THERE, saidBeforeTheStop } from '../shared/carried-on-outside.mts';
import { catchUpDue, gettingReady, writesTheAnswer } from '../shared/agent-import.mts';
import { itemOptions, offerIsLive } from '../renderer/src/format.ts';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules.ts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { asksForYourWords } from '../renderer/src/threads/page-rules.ts';

const SID = '5a1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const ASKED = '**Claude Code stopped to ask you a question. Answer it in the terminal open in kestrel.**';

let root;
let home;
let s;
let slug;
let file;
let T0;

const at = (ms) => new Date(ms).toISOString();
const row_ = (type, ms, message, over = {}) => ({ type, timestamp: at(ms), message, ...over });
const typed = (ms, text) => row_('user', ms, { role: 'user', content: text }, { origin: { kind: 'human' } });
const says = (ms, text, stop = 'end_turn') => row_('assistant', ms, { role: 'assistant', content: [{ type: 'text', text }], stop_reason: stop });
const calls = (ms, name, id = 't1') => row_('assistant', ms, { role: 'assistant', content: [{ type: 'tool_use', id, name, input: {} }], stop_reason: 'tool_use' });
const result = (ms, toolUseResult, id = 't1') => row_('user', ms, { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, { toolUseResult });
const queued = (ms, prompt, over = {}) => ({ type: 'attachment', timestamp: at(ms), attachment: { type: 'queued_command', prompt, commandMode: 'prompt', origin: { kind: 'human' }, ...over } });
const interrupted = (ms) => row_('user', ms, { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] });
const question = (q, ...labels) => ({ question: q, options: labels.map((label) => ({ label })) });
const write = (...rows) => fs.appendFileSync(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(''));
const session = (status, waitingFor) => {
  const dir = path.join(home, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: SID, cwd: path.join(root, 'kestrel'), status, ...(waitingFor ? { waitingFor } : {}) }));
};
const row = () => s.listItems().find((i) => i.product === slug && (i.labels ?? []).includes(`thread:${SID}`));
const follow = (now = Date.now(), over = {}) => followClaudeChats({ store: s, dirs: [home], now, ...over });
const events = () => threadEvents(s.readHistory(slug, row().id));
const said = () => events().filter((e) => e.message).map((e) => [e.who, e.words]).slice(2);
const inbox = () => belongsInInbox(row(), { now: Date.now() });
const progress = () => belongsInProgress(row(), { now: Date.now() });
const bringIn = (over = {}, land = 'inbox') => s.importThreadRows(slug, [{
  id: SID, source: 'terminal', folder: path.join(root, 'kestrel'), title: 'Fix the flaky test', when: T0 + 60_000, startedAt: T0, path: file,
  firstSaid: 'Fix it.', lastSaid: 'Which one?', waiting: true, ...over,
}], { now: T0 + 120_000, land });

beforeEach(async () => {
  T0 = Date.now() - 30 * 60_000;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-said-'));
  home = path.join(root, 'claude-home');
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  s = await new Store({ storeRoot: root, accountId: 'test-account', accountRoot, products: [] }).init();
  ({ slug } = s.createProduct({ name: 'Kestrel', repoPath: path.join(root, 'kestrel') }));
  const projects = path.join(home, 'projects', slugFor(path.join(root, 'kestrel')));
  fs.mkdirSync(projects, { recursive: true });
  file = path.join(projects, `${SID}.jsonl`);
  write(typed(T0, 'Fix it.'), says(T0 + 60_000, 'Which one?'));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('your words', () => {
  beforeEach(() => bringIn());

  it('typed while its agent works are on the thread, between what it said before and after', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Use real dates.'), calls(t + 1_000, 'Bash'), result(t + 2_000, { stdout: '' }), says(t + 3_000, 'Baseline is 14 of 14.', 'tool_use'),
      calls(t + 9_000, 'Bash', 't2'), result(t + 10_000, { stdout: '' }, 't2'), queued(t + 5_000, 'also update the readme'), says(t + 12_000, 'Will do. Done.'));
    session('idle');
    await follow();
    expect(said()).toEqual([['you', 'Use real dates.'], ['agent', 'Baseline is 14 of 14.'], ['you', 'also update the readme'], ['agent', 'Will do. Done.']]);
  });

  it('typed several times between two looks are all there, with each answer', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Light default.'), says(t + 5_000, 'Built.'), typed(t + 10_000, 'Carry on.'), says(t + 15_000, 'Checked. Commit it?'));
    session('idle');
    await follow();
    expect(said()).toEqual([['you', 'Light default.'], ['agent', 'Built.'], ['you', 'Carry on.'], ['agent', 'Checked. Commit it?']]);
    expect(row().result).toBe('Checked. Commit it?');
    const lines = s.readHistory(slug, row().id).length;
    await follow();
    expect(s.readHistory(slug, row().id).length).toBe(lines);
  });

  it('wear the time they were typed, and its answers the time they were given', async () => {
    write(typed(T0 + 200_000, 'Mock it.'), says(T0 + 230_000, 'Mocked.'));
    session('idle');
    await follow();
    const last = events().filter((e) => e.message).slice(-2);
    expect(last.map((e) => e.at)).toEqual([T0 + 200_000, T0 + 230_000]);
  });

  // The cases that must not match.
  it('are never a command queued by software, a slash command or another session', () => {
    const t = T0 + 200_000;
    write(queued(t, 'do it', { commandMode: 'task-notification' }), queued(t + 1, '<command-name>/clear</command-name>'), queued(t + 2, 'from a peer', { origin: { kind: 'peer' } }),
      row_('user', t + 3, { role: 'user', content: 'Another Claude session sent a message: hi' }, { origin: { kind: 'peer' } }), { type: 'attachment', timestamp: at(t + 4), attachment: { type: 'plan_mode_exit' } });
    expect(readChatTurn(file).entries.map((e) => e.text)).toEqual(['Fix it.', 'Which one?']);
  });
});

describe('a question its agent put up there', () => {
  beforeEach(() => bringIn());

  it('is the agent\'s with its choices once you answer it, and your pick is yours', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Add a key.'));
    session('waiting', 'input needed');
    await follow();
    expect(row().result).toBe(ASKED);
    write(says(t + 1_000, 'I will look first.', 'tool_use'), calls(t + 2_000, 'AskUserQuestion', 'q'), result(t + 90_000, {
      questions: [question('Where should keys live?', 'SQLite file (Recommended)', 'Memory'), question('Which route?', 'POST /payments', 'POST /appointments')],
      answers: { 'Where should keys live?': 'SQLite file (Recommended)', 'Which route?': 'POST /appointments' },
    }, 'q'));
    session('busy');
    await follow();
    expect(said()).toEqual([
      ['you', 'Add a key.'],
      ['agent', 'I will look first.\n\n**Where should keys live?**\n1. SQLite file\n2. Memory\n\n**Which route?**\n1. POST /payments\n2. POST /appointments'],
      ['you', 'SQLite file\nPOST /appointments'],
    ]);
    expect(progress()).toBe(true);
  });

  // Round three (2026-11-22): the reasons were what the choice was made on, a
  // command in the question drew raw asterisks, and a refused plan was nowhere.
  it('keeps each choice\'s reason, and bold to its first line', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Ask me.'), calls(t + 1_000, 'AskUserQuestion', 'q'), result(t + 60_000, {
      questions: [{ question: 'May I run this?\n\ntouch a && git commit', options: [{ label: 'Yes', description: 'Run it as written.' }, { label: 'No' }] }],
      answers: { 'May I run this?\n\ntouch a && git commit': 'No' },
    }, 'q'));
    session('busy');
    await follow();
    expect(said().at(-2)).toEqual(['agent', '**May I run this?**\n\ntouch a && git commit\n\n1. Yes: Run it as written.\n2. No']);
  });

  it('that you cancelled can still be answered from here', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Ask me.'), row_('assistant', t + 1_000, { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'q', name: 'AskUserQuestion', input: { questions: [question('30 or 90 days?', '30 days', '90 days')] } }] }),
      result(t + 60_000, 'User rejected tool use', 'q'), interrupted(t + 60_000));
    session('idle');
    await follow();
    expect(itemOptions(row()).map((o) => o.text)).toEqual(['30 days', '90 days']);
    expect(offerIsLive(row())).toBe(true);
  });

  it('that was a plan you refused is on the thread too', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Plan it.'), row_('assistant', t + 1_000, { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'p', name: 'ExitPlanMode', input: { plan: '# Log deletes' } }] }),
      result(t + 60_000, 'User rejected tool use', 'p'), interrupted(t + 60_000));
    session('idle');
    await follow();
    expect(row().result).toBe(`${CUT_THERE}\n\n# Log deletes`);
  });

  it('is where it was put up, ahead of a reply typed here while it was open', async () => {
    const t = Date.now() - 600_000;
    write(typed(t, 'Ask me.'));
    session('waiting', 'input needed');
    await follow();
    s.answerItem(slug, row().id, { answer: 'No, do not run that.' });
    s.settleAnswer(slug, row().id, row().wrote.answer.ts);
    write(calls(t + 1_000, 'AskUserQuestion', 'q'), result(Date.now() + 1_000, { questions: [question('Run it?', 'Yes', 'No')], answers: { 'Run it?': 'No' } }, 'q'));
    session('busy');
    await follow(Date.now() + 2_000);
    expect(said().map(([, words]) => words)).toEqual(['Ask me.', '**Run it?**\n1. Yes\n2. No', 'No, do not run that.', 'No']);
  });

  it('that was a plan is on the thread once you approve it', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Plan it.'), calls(t + 1_000, 'ExitPlanMode', 'p'), result(t + 60_000, { plan: '# Use real dates\n\nCompare instants.' }, 'p'));
    session('busy');
    await follow();
    expect(said()).toEqual([['you', 'Plan it.'], ['agent', '# Use real dates\n\nCompare instants.'], ['you', 'Approved the plan']]);
  });

  it('keeps what its agent had said before it, once, when the line saying so goes', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Plan it.'), says(t + 1_000, 'The folder has changed.', 'tool_use'));
    session('waiting', 'permission prompt');
    await follow();
    expect(row().result).toMatch(/open in kestrel\.\*\*\n\nThe folder has changed\.$/);
    write(says(t + 60_000, 'Planned. Build it?'));
    session('idle');
    await follow();
    expect(said()).toEqual([['you', 'Plan it.'], ['agent', 'The folder has changed.'], ['agent', 'Planned. Build it?']]);
    expect(saidBeforeTheStop(ASKED)).toBe('');
  });

  it('is still the last thing on the thread while it is open', async () => {
    write(typed(T0 + 200_000, 'Add a key.'));
    session('waiting', 'input needed');
    await follow();
    expect(said().at(-1)).toEqual(['agent', ASKED]);
  });

  // The second round (2026-11-22): a picker cancelled in the terminal left no trace.
  it('that you cancelled is on the thread too, as the agent\'s', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Fix the overlap.'), row_('assistant', t + 1_000, { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'q', name: 'AskUserQuestion', input: { questions: [question('It only compares starts. Which way?', 'Text', 'Real times (Recommended)')] } }] }),
      result(t + 60_000, 'User rejected tool use', 'q'), interrupted(t + 60_000));
    session('idle');
    await follow();
    expect(said()).toEqual([['you', 'Fix the overlap.'], ['agent', `${CUT_THERE}\n\n**It only compares starts. Which way?**\n1. Text\n2. Real times`]]);
  });

  it('says you stopped it there after Esc, once, and the chat goes on from there', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Add a toggle.'));
    session('waiting', 'input needed');
    await follow();
    write(calls(t + 1_000, 'AskUserQuestion', 'q'), result(t + 60_000, 'User rejected tool use', 'q'), interrupted(t + 60_000));
    session('idle');
    await follow();
    expect(row().result).toBe(CUT_THERE);
    expect(row().status).toBe('open');
    expect(inbox()).toBe(true);
    const lines = s.readHistory(slug, row().id).length;
    await follow();
    expect(s.readHistory(slug, row().id).length).toBe(lines);
    expect(said()).toEqual([['you', 'Add a toggle.'], ['agent', CUT_THERE]]);
    write(typed(t + 90_000, 'Light default.'), says(t + 95_000, 'Built.'));
    await follow();
    expect(row().result).toBe('Built.');
  });

  it('says so when you stop it in the middle of its work too', async () => {
    const t = T0 + 200_000;
    write(typed(t, 'Add a toggle.'), says(t + 1_000, 'Starting.', 'tool_use'), calls(t + 2_000, 'Bash'));
    session('busy');
    await follow();
    expect(progress()).toBe(true);
    write(interrupted(t + 20_000));
    session('idle');
    await follow();
    expect(row().claim).toBeNull();
    expect(row().result).toBe(`${CUT_THERE}\n\nStarting.`);
  });
});

describe('an answer given there', () => {
  beforeEach(() => bringIn());

  // Its write-up asked "Should I fix the time filter next, or commit first?" over
  // an answer that asked nothing, with three options no agent wrote; one picked
  // committed half the change (2026-11-22).
  it('is written up only when it asks something, and reads as its agent wrote it otherwise', async () => {
    s.catchUpItem(slug, row().id, { label: 'Flaky test', problem: 'A flaky test.', result: '**Which one?**' });
    s.routeItem(slug, row().id, { labels: row().labels.filter((l) => l !== 'catch-up') });
    write(typed(Date.now() + 1_000, 'Mock it.'), says(Date.now() + 2_000, 'Mocked. If you want every commit to pass, squash the two.'));
    session('idle');
    await follow(Date.now() + 3_000);
    expect(row().result).toBe('Mocked. If you want every commit to pass, squash the two.');
    expect(catchUpDue(row())).toBe(false);
    write(typed(Date.now() + 5_000, 'And login?'), says(Date.now() + 6_000, 'It waits on email. Stub the mailer?'));
    await follow(Date.now() + 7_000);
    expect(catchUpDue(row())).toBe(true);
    write(typed(Date.now() + 8_000, 'Yes.'), says(Date.now() + 9_000, 'Stubbed.'));
    await follow(Date.now() + 10_000);
    expect(catchUpDue(row())).toBe(false);
  });
});

describe('a chat closed here while its agent works on there', () => {
  beforeEach(() => bringIn());
  const closed = async () => {
    write(typed(Date.now() - 60_000, 'Plan it.'));
    session('busy');
    await follow();
    s.answerItem(slug, row().id, { status: 'done' });
    return row().wrote.status.ts;
  };
  const waits = (since, on = 'permission prompt') => ({ stateOf: () => ({ status: 'waiting', waitingFor: on, folder: 'kestrel', since }) });

  it('is back when its agent stops on you in its window after that, and stays gone when it had stopped before', async () => {
    const doneAt = await closed();
    await follow(doneAt + 1_000, waits(doneAt - 1));
    expect(row().status).toBe('done');
    await follow(doneAt + 5_000, waits(doneAt + 2_000));
    expect(row().status).toBe('open');
    expect(row().result).toBe('**Claude Code stopped to ask for your OK. Answer it in the terminal open in kestrel.**');
    expect(belongsInInbox(row(), { now: doneAt + 6_000 })).toBe(true);
    // Not drawn as one you sent back, nor as words of yours.
    expect(events().map((e) => e.said)).not.toContain('You sent it back');
    expect(said().filter(([who]) => who === 'you')).toEqual([['you', 'Plan it.']]);
  });

  it('has the plan you then approve there, though it was put up before you closed it', async () => {
    const doneAt = await closed();
    write(calls(doneAt - 5_000, 'ExitPlanMode', 'p'), result(doneAt + 5_000, { plan: '# The plan' }, 'p'), says(doneAt + 9_000, 'Built. Commit it?'));
    session('idle');
    await follow(doneAt + 10_000);
    expect(row().status).toBe('open');
    expect(said().slice(-3)).toEqual([['agent', '# The plan'], ['you', 'Approved the plan'], ['agent', 'Built. Commit it?']]);
  });
});

describe('who said what', () => {
  it('leaves out what Claude Code writes over an interrupted turn, which no model said', () => {
    write(typed(T0 + 200_000, 'Go on.'), { ...says(T0 + 201_000, 'No response requested.'), message: { role: 'assistant', model: '<synthetic>', stop_reason: 'stop_sequence', content: [{ type: 'text', text: 'No response requested.' }] } });
    expect(readChatTurn(file).entries.at(-1)).toMatchObject({ who: 'you', text: 'Go on.' });
  });


  it('draws no reply of yours from a claim alone, as when you approve a command there', async () => {
    bringIn();
    write(typed(T0 + 200_000, 'Push it.'));
    session('waiting', 'permission prompt');
    await follow();
    write(calls(T0 + 210_000, 'Bash'), result(T0 + 260_000, { stdout: '' }));
    session('busy');
    await follow();
    expect(row().status).toBe('claimed');
    expect(events().filter((e) => e.said === 'You replied in Claude Code').map((e) => e.words)).toEqual(['Push it.']);
  });

  it('never draws the name Claude Code gave the chat as something you typed', () => {
    bringIn({ title: 'Write to /tmp/note.txt', firstSaid: 'Put one line in the note.' });
    s.nameItem(slug, row().id, 'A note');
    const yours = events().filter((e) => e.who === 'you' && e.message).map((e) => e.words);
    expect(yours).toEqual(['Put one line in the note.']);
  });
});

describe('a new chat brought in mid-conversation', () => {
  const entries = () => [
    { who: 'you', at: T0, text: 'Fix it.' }, { who: 'agent', at: T0 + 10_000, text: 'It races the clock.' },
    { who: 'you', at: T0 + 20_000, text: 'Show me where.' }, { who: 'agent', at: T0 + 30_000, text: 'Line 40.' }, { who: 'agent', at: T0 + 31_000, text: 'Mock or retry?' },
  ];

  it('has every turn of it, at the times they were said', () => {
    bringIn({ lastSaid: 'Line 40.\n\nMock or retry?', entries: entries() });
    const messages = events().filter((e) => e.message);
    expect(messages.map((e) => [e.who, e.words])).toEqual([
      ['you', 'Fix it.'], ['agent', 'It races the clock.'], ['you', 'Show me where.'], ['agent', 'Line 40.\n\nMock or retry?'],
    ]);
    expect(messages.map((e) => e.at).slice(1, 3)).toEqual([T0 + 10_000, T0 + 20_000]);
    expect(row().result).toBe('Line 40.\n\nMock or retry?');
    expect(row().status).toBe('open');
  });

  it('that is stopped on a question has them too, and the line last', () => {
    bringIn({ lastSaid: 'Line 40.', stoppedOn: 'input needed', openIn: 'kestrel', entries: entries().slice(0, 4).concat({ who: 'you', at: T0 + 40_000, text: 'Ask me.' }) });
    expect(events().filter((e) => e.message).map((e) => e.words)).toEqual(['Fix it.', 'It races the clock.', 'Show me where.', 'Line 40.', 'Ask me.', ASKED]);
    // Nothing the follow reads next is said twice.
    expect(s.chatsToFollow()[0].heardThrough).toBeGreaterThanOrEqual(T0 + 40_000);
  });

  it('with only a first message and an answer reads as it always has', () => {
    bringIn({ lastSaid: 'Which one?', entries: entries().slice(0, 1).concat({ who: 'agent', at: T0 + 60_000, text: 'Which one?' }) });
    expect(events().filter((e) => e.message).map((e) => e.words)).toEqual(['Fix it.', 'Which one?']);
  });
});

describe('a window left before its agent finished', () => {
  beforeEach(() => bringIn());
  const left = async () => {
    write(typed(Date.now() - 30_000, 'Add a toggle.'), calls(Date.now() - 20_000, 'Bash'));
    session('busy');
    await follow();
    expect(progress()).toBe(true);
  };

  it('is out of In progress at the next look once closed, not two minutes on, and says so', async () => {
    await left();
    fs.rmSync(path.join(home, 'sessions', `${process.pid}.json`));
    await follow();
    expect(row().claim).toBeNull();
    expect(row().result).toBe(CLOSED_THERE);
    expect(inbox()).toBe(true);
  });

  // After a restart nothing remembers that a session file was ever published.
  it('is not held again as working when the app restarts just after, nor said twice', async () => {
    await left();
    fs.rmSync(path.join(home, 'sessions', `${process.pid}.json`));
    await follow();
    const lines = s.readHistory(slug, row().id).length;
    const moved = `${file}.copy`;
    fs.copyFileSync(file, moved);
    // The same chat, as a path this run of the app has never seen published.
    const other = path.join(root, 'other-home', 'projects', slugFor(path.join(root, 'kestrel')));
    fs.mkdirSync(other, { recursive: true });
    fs.copyFileSync(moved, path.join(other, `${SID}.jsonl`));
    fs.rmSync(file);
    fs.rmSync(moved);
    await followClaudeChats({ store: s, dirs: [path.join(root, 'other-home')] });
    expect(row().claim).toBeNull();
    expect(s.readHistory(slug, row().id).length).toBe(lines);
    fs.appendFileSync(path.join(other, `${SID}.jsonl`), `${JSON.stringify(typed(Date.now(), 'Carry on.'))}\n`);
    await followClaudeChats({ store: s, dirs: [path.join(root, 'other-home')] });
    expect(row().claim).not.toBeNull();
  });

  it('opened again at its prompt says the same, once it has been there long enough to have written an answer', async () => {
    await left();
    const at0 = Date.now();
    await follow(at0, { stateOf: () => ({ status: 'idle', waitingFor: '', since: at0 - 1_000 }) });
    expect(row().result).not.toBe(CLOSED_THERE);
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(file, old, old);
    await follow(at0 + 8_000, { stateOf: () => ({ status: 'idle', waitingFor: '', since: at0 - 1_000 }) });
    expect(row().result).toBe(CLOSED_THERE);
  });
});

describe('a chat brought in by itself', () => {
  const brought = (title) => bringIn({ title, firstSaid: 'Fix the overlap check please', entries: [{ who: 'you', at: T0, text: 'Fix the overlap check please' }] });

  // Seen on a real chat: "Refunds gap in src" became "Refunds in src" a minute later,
  // and the name its window showed was no longer on the list.
  it('keeps the name Claude Code gave it, which its window shows', () => {
    brought('Overlap check');
    expect(row().label).toBe('Overlap check');
  });

  it('is named by the app when all it has is the start of what was typed', () => {
    brought('Fix the overlap check…');
    expect(row().label ?? '').toBe('');
  });

  it('that you stopped reads as waiting on you, choices and all', () => {
    const stopped = { result: `${CUT_THERE}\n\n**30 or 90?**\n1. 30\n2. 90`, wrote: { result: { ts: 1 } } };
    expect(asksForYourWords(stopped)).toBe(true);
    expect(asksForYourWords({ result: '**30 or 90?**\n1. 30\n2. 90', wrote: { result: { ts: 1 } } })).toBe(false);
  });

  it('stays in its agent\'s own words, and one picked at setup is written up as ever', () => {
    bringIn({ lastSaid: 'Which repository?', entries: [{ who: 'you', at: T0, text: 'Fix it.' }, { who: 'agent', at: T0 + 1_000, text: 'Which repository?' }] });
    expect(catchUpDue(row())).toBe(true);
    expect(writesTheAnswer(row())).toBe(false);
    expect(gettingReady(row())).toBe(false);
    expect(writesTheAnswer({ ...row(), labels: ['thread-import', 'catch-up'] })).toBe(true);
    expect(gettingReady({ ...row(), labels: ['thread-import', 'catch-up'] })).toBe(true);
  });
});

describe('a chat that came in finished', () => {
  it('says it finished there, and only your own close says you marked it done', () => {
    bringIn({ lastSaid: 'Fixed.', waiting: false }, 'sorted');
    expect(events().map((e) => e.said)).toContain('It finished in Claude Code');
    expect(events().map((e) => e.said)).not.toContain('You marked it done');
    s.answerItem(slug, row().id, { status: 'open' });
    s.answerItem(slug, row().id, { status: 'done' });
    expect(events().map((e) => e.said)).toContain('You marked it done');
  });
});

describe('a reply typed here that waits for its run', () => {
  beforeEach(() => bringIn());

  it('leaves what the terminal goes on to say on the thread, without holding the row or writing it up', async () => {
    s.answerItem(slug, row().id, { answer: 'Also do the tests.' });
    const t = Date.now() + 1_000;
    write(typed(t, 'Add the toggle now.'), says(t + 1_000, 'Built. Commit it?'));
    session('idle');
    await follow(t + 2_000);
    expect(said().slice(-2)).toEqual([['you', 'Add the toggle now.'], ['agent', 'Built. Commit it?']]);
    expect(row().answer).toBe('Also do the tests.');
    expect(row().claim).toBeNull();
    write(typed(t + 3_000, 'Yes.'), calls(t + 4_000, 'Bash'));
    session('busy');
    await follow(t + 5_000);
    expect(row().claim).toBeNull();
    expect(said().at(-1)).toEqual(['you', 'Yes.']);
  });

  it('ends the follow once a run here has the chat', async () => {
    const lines = s.readHistory(slug, row().id).length;
    write(typed(Date.now() - 5_000, 'Add the toggle now.'), says(Date.now() - 1_000, 'Built.'));
    session('idle');
    await follow(Date.now(), { ours: () => true });
    expect(s.readHistory(slug, row().id).length).toBe(lines);
  });
});

describe('what the row has not had', () => {
  it('is each of your messages, and the agent\'s between them as one', () => {
    const entries = [['you', 1], ['agent', 2], ['agent', 3], ['you', 4], ['you', 5], ['agent', 6]].map(([who, t]) => ({ who, at: t, text: `${who}${t}` }));
    expect(notYetRead({ entries }, { heardThrough: 0, knownAt: 0 }).map((e) => e.text)).toEqual(['you1', 'agent2\n\nagent3', 'you4', 'you5', 'agent6']);
    expect(notYetRead({ entries }, { heardThrough: 4, knownAt: 4 }).map((e) => e.text)).toEqual(['you5', 'agent6']);
    expect(notYetRead({ entries }, { heardThrough: 6, knownAt: 6 })).toEqual([]);
    expect(notYetRead(null, { heardThrough: 0, knownAt: 0 })).toEqual([]);
    // Read, not changed.
    expect(entries[1].text).toBe('agent2');
  });
});

describe('a followed chat\'s session file', () => {
  it('is acted on as it changes, and one of a chat nobody follows is not', async () => {
    bringIn();
    session('idle');
    const passes = [];
    const counting = new Proxy(s, { get: (t, k) => (k === 'chatsToFollow' ? (...a) => { passes.push(Date.now()); return t.chatsToFollow(...a); } : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
    const f = startChatFollow({ store: counting, dirs: () => [home], everyMs: 3600_000, firstDelayMs: 3600_000 });
    try {
      await f.followNow();
      const before = passes.length;
      // FSEvents needs a moment to be watching.
      await new Promise((r) => setTimeout(r, 400));
      write(typed(Date.now(), 'Mock it.'), calls(Date.now() + 1, 'Bash'));
      session('busy');
      for (let i = 0; i < 60 && row().status !== 'claimed'; i++) await new Promise((r) => setTimeout(r, 100));
      expect(row().status).toBe('claimed');
      expect(passes.length).toBeGreaterThan(before);
      const now = passes.length;
      await new Promise((r) => setTimeout(r, 1_200));
      const settled = passes.length;
      fs.writeFileSync(path.join(home, 'sessions', '1.json'), JSON.stringify({ pid: 1, sessionId: 'somebody-else', status: 'busy' }));
      await new Promise((r) => setTimeout(r, 1_500));
      expect(passes.length).toBe(settled);
      expect(now).toBeLessThanOrEqual(settled);
    } finally { f.stop(); }
  }, 20_000);
});

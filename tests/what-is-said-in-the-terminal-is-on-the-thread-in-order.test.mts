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
import { CUT_THERE, saidBeforeTheStop } from '../shared/carried-on-outside.mts';
import { catchUpDue } from '../shared/agent-import.mts';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules.ts';
import { threadEvents } from '../renderer/src/thread-history.ts';

const SID = '5a1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const ASKED = '**Claude Code stopped to ask you a question. Answer it in its kestrel window.**';

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
      ['agent', 'I will look first.\n\n**Where should keys live?**\n- SQLite file\n- Memory\n\n**Which route?**\n- POST /payments\n- POST /appointments'],
      ['you', 'SQLite file\nPOST /appointments'],
    ]);
    expect(progress()).toBe(true);
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
    expect(row().result).toMatch(/kestrel window\.\*\*\n\nThe folder has changed\.$/);
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
    expect(catchUpDue(row())).toBe(true);
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

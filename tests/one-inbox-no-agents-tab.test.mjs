// ONE INBOX. NO "YOUR AGENTS" TAB. And a card that says what the work is.
//
// Three problems showed up the day after the feature shipped. All three are
// about the same thing: Claude Code sessions arrived in Agentbox wearing a
// costume, as a separate section with a separate word and a card that said
// almost nothing.
//
//   3. The phantom sidebar, which is pinned in the-panel-is-hers-to-open.
//
// The rules themselves live in shared/agents.mjs and are pinned in
// her-agents-in-her-inbox. What is pinned HERE is the two things that have no
// symptom anywhere else: that the tab is really gone from the app rather than
// merely hidden, and that the reader really does pull a session's own title off
// a transcript in the shape Claude Code actually writes.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __readTail } from '../main/agents.mjs';
import { Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');

describe('the tab is gone, not hidden', () => {
  it('has no Your agents button left in the tab row', () => {
    expect(app).not.toMatch(/<span>Your agents<\/span>/);
    expect(app).not.toMatch(/setView\('agents'\)/);
  });

  it('leaves no agents view for anything to route to', () => {
    // The fifth view is 'all' since 2026-10-01, and it is not this tab coming
    // back. approved 2026-10-01 (w-e731ca9376): 'all' is the Inbox page's All
    // tab, every thread of hers in one list, drawn by StateTabs beside Needs
    // you, Running, Scheduled and Done.
    const types = read('renderer/src/types.ts');
    expect(types).toMatch(/export type View = 'inbox' \| 'snoozed' \| 'progress' \| 'done' \| 'all';/);
    expect(types).not.toMatch(/export type View = [^;]*'agents'/);
    expect(read('renderer/src/threads/Pages.tsx')).toContain("{ view: 'all', label: 'All' }");
    expect(app).not.toMatch(/view === 'agents'/);
  });

  it('does not cycle through it on Tab', () => {
    const start = app.indexOf("if (e.key === 'Tab'");
    const order = app.slice(start, start + 600);
    expect(order).not.toContain("'agents'");
  });

  // The list of her sessions is still built: Scheduled holds the ones she put
  // off, and the inbox holds the rest. Losing it would take an agent she
  // deferred out of every list in the app.
  it('still builds the rows, because Scheduled and the inbox are drawn from them', () => {
    expect(app).toMatch(/const agentRows = useMemo/);
    expect(app).toMatch(/\.\.\.agentList\.filter\(\(r\) => \(r\.runAt \?\? 0\) > now\)/);
  });

  it('asks the setting how many of them the inbox takes', () => {
    // The fallback matches the app's own default (main/settings.mjs) so the
    // inbox cannot flash a row it is about to drop.
    expect(app).toMatch(/const agentMode = snap\?\.config\?\.outsideAgents \?\? 'off';/);
    expect(app).toMatch(/reachesInbox\(r\.agent, now, agentMode\)/);
  });

  // A quiet agent must sort UNDER everything that is genuinely asking, or the
  // sweep buries the one row that matters. `reachesInbox` cannot
  // be the test any more: under the default every listed agent passes it.
  it('scores a quiet agent at the bottom and an asking one at the top', () => {
    expect(app).toMatch(/priority: asksSomething\(a\) \? 9 : 1,/);
  });
});

// A QUIET AGENT TAKES A REPLY. The dock used to hide the box on every agent
// that was not waiting on `input needed` and tell her there was nothing there
// to answer, which was false: an idle session sits at its prompt listening, and
// a message written to it lands and is worked on (measured 2026-08-17).The one
// real reason is a permission box, and that is the only case left.
describe('the dock hides the reply box only where a message is swallowed', () => {
  const focus = read('renderer/src/components/Focus.tsx');

  it('gates on the permission box, not on whether the agent is asking', () => {
    expect(focus).toMatch(/const replyBlocked = agent \? replyIsSwallowed\(agent\) : false;/);
    // The permission box is still the only thing that takes the box away from
    // an AGENT. The row that says her tasks are not running has no reply box
    // either, and that is not a gate on the agent: there is no session behind
    // that row at all. Nor does a made update row, if one is ever opened; the
    // new version is announced in the sidebar now (w-7a39dace23), so its
    // button left this slot.
    expect(focus).toMatch(/\{update \|\| trouble \? null : replyBlocked \? \(/);
  });

  it('keeps the box sentence for the one that has a box', () => {
    expect(focus).toMatch(/would wait behind the box it is stuck on/);
  });

  it('no longer tells a quiet agent there is nothing to answer', () => {
    expect(focus).not.toMatch(/there is nothing here to answer/);
  });
});

/* ------------------------- the reader, against real jsonl ---------------- */
// Claude Code writes three facts into the transcript that answer "what was this
// task", and the shapes below are copied from a real transcript. Reading them
// costs nothing extra: this is
// the same 96KB tail main/agents.mjs already reads for `lastActiveAt`.
//
// The test drives the real reader through the real file layout, because the
// half of this that can silently break is the SHAPE — a renamed field means a
// card that goes back to saying nothing, and no test of a pure function would
// notice.
describe('what a session says about itself, read off a real transcript', () => {
  let n = 0;
  const sessionId = 'bafe26b9-884c-47d2-b780-f8b80321f100';

  const write = (home, lines) => {
    n += 1;
    const cwd = '/tmp/agentbox-fixture-repo';
    const dir = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${sessionId}-${n}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
    return cwd;
  };

  // The reader asks os.homedir each time it looks, which is what lets this run
  // over a temporary home instead of hers. Every case uses a fresh session id
  // as well, because the reader caches by it.
  const readTailOf = (lines) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-agents-'));
    const cwd = write(home, lines);
    const realHome = os.homedir;
    os.homedir = () => home;
    try {
      return __readTail(`${sessionId}-${n}`, cwd);
    } finally {
      os.homedir = realHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  };

  const LINES = [
    { type: 'ai-title', aiTitle: 'An older title it has since replaced', sessionId },
    { type: 'last-prompt', lastPrompt: 'the first thing she asked', leafUuid: 'a', sessionId },
    {
      type: 'assistant',
      timestamp: '2026-08-12T17:02:00.000Z',
      message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/sync-service.mjs' } }] },
    },
    {
      type: 'assistant',
      timestamp: '2026-08-12T17:02:30.000Z',
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/x/store.mjs' } }] },
    },
    { type: 'ai-title', aiTitle: `${Name} product not displaying in Harbour`, sessionId },
    { type: 'last-prompt', lastPrompt: 'sounds good. just make sure the login is remembered.', leafUuid: 'b', sessionId },
    {
      type: 'assistant',
      timestamp: '2026-08-12T17:03:00.000Z',
      message: { content: [{ type: 'text', text: 'The sync is running steadily but the queue count is not going down.' }] },
    },
  ];

  it('takes the newest title, the newest prompt, and the files it touched', async () => {
    const tail = await readTailOf(LINES);
    expect(tail.about).toBe(`${Name} product not displaying in Harbour`);
    expect(tail.lastAsked).toBe('sounds good. just make sure the login is remembered.');
    expect(tail.touched).toEqual(['sync-service.mjs', 'store.mjs']);
    expect(tail.lastSaid).toContain('The sync is running steadily');
    expect(tail.lastActiveAt).toBe(Date.parse('2026-08-12T17:03:00.000Z'));
  });

  // THE WHOLE OF THE LAST REPLY, NOT ITS LAST LINE. Claude Code writes one
  // answer as a new line every time it stops for a tool, so keeping whichever
  // block came last routinely kept a "Done." under the four paragraphs that
  // said what was done.
  it('joins the blocks of one reply, and starts over when something arrives', async () => {
    const tail = await readTailOf([
      { type: 'assistant', timestamp: '2026-08-12T17:01:00.000Z', message: { content: [{ type: 'text', text: 'First I will look.' }] } },
      { type: 'user', timestamp: '2026-08-12T17:01:10.000Z', toolUseResult: { stdout: 'ok' }, message: { content: [{ type: 'text', text: 'read it' }] } },
      { type: 'assistant', timestamp: '2026-08-12T17:01:20.000Z', message: { content: [{ type: 'text', text: 'Done.' }] } },
    ]);
    expect(tail.lastSaid).toBe('First I will look.\n\nDone.');
    // Stamped when the reply BEGAN, so the card's time and the words under it
    // come from the same moment.
    expect(tail.saidAt).toBe(Date.parse('2026-08-12T17:01:00.000Z'));
  });

  it('drops the reply before when a new message arrives in between', async () => {
    const tail = await readTailOf([
      { type: 'assistant', timestamp: '2026-08-12T17:01:00.000Z', message: { content: [{ type: 'text', text: 'The old answer.' }] } },
      { type: 'user', isMeta: true, timestamp: '2026-08-14T09:00:00.000Z', message: { content: [{ type: 'text', text: 'Another Claude session sent a message: status?' }] } },
      { type: 'assistant', timestamp: '2026-08-14T09:00:30.000Z', message: { content: [{ type: 'text', text: 'The new answer.' }] } },
    ]);
    expect(tail.lastSaid).toBe('The new answer.');
    expect(tail.saidAt).toBe(Date.parse('2026-08-14T09:00:30.000Z'));
  });

  it('moves a file touched twice to where it was touched last, and never duplicates it', async () => {
    const again = [...LINES, {
      type: 'assistant',
      timestamp: '2026-08-12T17:04:00.000Z',
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/x/sync-service.mjs' } }] },
    }];
    expect((await readTailOf(again)).touched).toEqual(['store.mjs', 'sync-service.mjs']);
  });

  // A YOUNG SESSION'S FIRST LINE IS NOT HALF A LINE. The tail read skips its
  // opening line, because a read that starts mid-file lands mid-record — but a
  // transcript smaller than the 96KB window was read whole, and skipping there
  // threw away the first thing anyone said in it. On a session a minute old
  // that is the title and the prompt that started it, which is exactly the
  // context this whole change exists to show her.
  it('reads the opening line of a transcript small enough to have been read whole', async () => {
    const tail = await readTailOf([
      { type: 'ai-title', aiTitle: 'The only line in the file', sessionId },
    ]);
    expect(tail.about).toBe('The only line in the file');
  });

  // A session that has said nothing yields empty strings, never `undefined`
  // dressed up as a sentence. The card drops those lines entirely.
  it('is honest about a session with no history at all', async () => {
    const tail = await readTailOf([{ type: 'system', timestamp: '2026-08-12T17:00:00.000Z' }]);
    expect(tail.about).toBe('');
    expect(tail.lastAsked).toBe('');
    expect(tail.touched).toEqual([]);
  });

  /* ------------------------- EVERY MESSAGE THE USER TYPED ---------------- */
  // The title and the last message are not enough to recall a five-day-old
  // session. What was missing was the FIRST thing the user typed, and a
  // transcript calls a great many things a `user` message that no human wrote.
  // Every exclusion below is one that really appears in real transcripts.
  const HER_SIDE = [
    { type: 'user', timestamp: '2026-08-12T22:58:52.000Z', message: { role: 'user', content: 'I added a new project and it does not appear in the list [Image #1].' } },
    // A tool result comes back as a `user` message. It is the machine talking.
    { type: 'user', timestamp: '2026-08-12T22:59:00.000Z', toolUseResult: { stdout: 'ok' }, message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } },
    // So does a system reminder, and it opens with a tag.
    { type: 'user', timestamp: '2026-08-12T22:59:10.000Z', message: { role: 'user', content: '<system-reminder>do not do that</system-reminder>' } },
    // And a meta line, and a compaction summary.
    { type: 'user', timestamp: '2026-08-12T22:59:20.000Z', isMeta: true, message: { role: 'user', content: 'Caveat: the messages below were generated by the user while running local commands.' } },
    { type: 'user', timestamp: '2026-08-12T22:59:30.000Z', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued from a previous conversation.' } },
    { type: 'user', timestamp: '2026-08-12T23:52:25.000Z', message: { role: 'user', content: [{ type: 'text', text: 'sounds good. just make sure the login is remembered.' }] } },
  ];

  it('keeps only what a human actually typed, oldest first', async () => {
    const tail = await readTailOf(HER_SIDE);
    expect(tail.asked.map((t) => t.text)).toEqual([
      'I added a new project and it does not appear in the list [Image #1].',
      'sounds good. just make sure the login is remembered.',
    ]);
    expect(tail.asked[0].at).toBe(Date.parse('2026-08-12T22:58:52.000Z'));
  });

  // THE OPENING IS THE ASK AND IT IS AT THE HEAD OF THE FILE, which is why the
  // whole file is read rather than the tail. Measured on real transcripts: the
  // first human turn lands between 11KB and 614KB in, because pasted images are
  // single transcript lines of hundreds of KB, so 96KB off the END reaches none
  // of it.
  it('finds the opening ask past a megabyte of the agent talking to itself', async () => {
    const filler = Array.from({ length: 60 }, (_, i) => ({
      type: 'assistant',
      timestamp: '2026-08-12T23:00:00.000Z',
      message: { content: [{ type: 'text', text: 'x'.repeat(20000) + i }] },
    }));
    const tail = await readTailOf([HER_SIDE[0], ...filler, HER_SIDE[5]]);
    expect(tail.asked).toHaveLength(2);
    expect(tail.asked[0].text).toContain('I added a new project');
  });

  // AND IT IS ONLY READ WHOLE ONCE. Reading 117MB of transcript on every
  // refresh would freeze the window; reading only the bytes that arrived since
  // last time is what makes reading all of it affordable at all. Measured on a
  // real machine: 361ms for the first pass over 16 sessions, 0.2ms for every
  // pass after it.
  it('picks up an appended message without re-reading what it already read', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-agents-'));
    const cwd = write(home, HER_SIDE);
    const id = `${sessionId}-${n}`;
    const file = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`);
    const realHome = os.homedir;
    os.homedir = () => home;
    try {
      const before = __readTail(id, cwd);
      expect(before.asked).toHaveLength(2);
      const grew = before.offset;
      fs.appendFileSync(file, `${JSON.stringify({
        type: 'user', timestamp: '2026-08-13T09:00:00.000Z', message: { role: 'user', content: 'and one more thing' },
      })}\n`);
      const after = __readTail(id, cwd);
      expect(after.asked.map((t) => t.text).at(-1)).toBe('and one more thing');
      expect(after.asked).toHaveLength(3);
      // It resumed rather than starting over, and it did not double-count.
      expect(after.offset).toBeGreaterThan(grew);
    } finally {
      os.homedir = realHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  // A HALF-WRITTEN LAST LINE IS NOT DROPPED. A live session is appending while
  // this reads, so the read routinely ends mid-record. That line is left for
  // the next pass rather than parsed as garbage and lost.
  it('leaves a partly written last line for the next read', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-agents-'));
    const cwd = write(home, HER_SIDE);
    const id = `${sessionId}-${n}`;
    const file = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`);
    const whole = JSON.stringify({ type: 'user', timestamp: '2026-08-13T09:00:00.000Z', message: { role: 'user', content: 'the tail end of it' } });
    const realHome = os.homedir;
    os.homedir = () => home;
    try {
      fs.appendFileSync(file, whole.slice(0, 40));      // torn: no newline yet
      expect(__readTail(id, cwd).asked).toHaveLength(2);
      fs.appendFileSync(file, `${whole.slice(40)}\n`);  // the rest arrives
      expect(__readTail(id, cwd).asked.map((t) => t.text).at(-1)).toBe('the tail end of it');
    } finally {
      os.homedir = realHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  // A TRANSCRIPT THAT SHRANK IS A DIFFERENT CONVERSATION. The cursor would
  // point into the middle of it, so that case starts over rather than folding
  // two sessions into one card.
  it('starts over when the file was rewritten shorter', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-agents-'));
    const cwd = write(home, HER_SIDE);
    const id = `${sessionId}-${n}`;
    const file = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`);
    const realHome = os.homedir;
    os.homedir = () => home;
    try {
      expect(__readTail(id, cwd).asked).toHaveLength(2);
      fs.writeFileSync(file, `${JSON.stringify({
        type: 'user', timestamp: '2026-08-14T09:00:00.000Z', message: { role: 'user', content: 'a whole new conversation' },
      })}\n`);
      const after = __readTail(id, cwd);
      expect(after.asked.map((t) => t.text)).toEqual(['a whole new conversation']);
    } finally {
      os.homedir = realHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

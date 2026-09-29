// THE BUTTON THAT OPENS THE CONVERSATION.
//
// WHAT CAN SILENTLY BREAK HERE, which is what this file is for:
//
//   1. THE SHAPE. The turns are Claude Code's jsonl, not ours. A renamed field
//      upstream is a button that opens an empty box, and no test of a pure
//      function would notice, so the reader is driven over real transcript
//      lines through the real file layout.
//   2. THE MACHINE TALKING TO ITSELF. Every tool result comes back wearing a
//      `user` message's clothes. Reading those onto the screen would fill her
//      conversation with the parts no human wrote, which is worse than the
//      blank it replaces.
//   3. THE COUNT. A session with 900 messages must say so and show the ends. A
//      window that quietly drops the middle is the app rounding something off
//      without telling her, which is the failure this codebase cares about most.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conversation } from '../main/agents.mjs';
import { TRAIL_OPENING, TRAIL_TURNS, conversationGap, conversationWindow } from '../shared/agents.mjs';
import { Name } from '../shared/product-name.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* ------------------------------ the window ------------------------------- */
describe('what she is shown when the conversation is long', () => {
  const turns = (n) => Array.from({ length: n }, (_, i) => ({ at: i, who: i % 2 ? 'it' : 'you', text: `turn ${i}` }));

  it('shows a short conversation whole, and omits nothing', () => {
    const out = conversationWindow(turns(9));
    expect(out.turns).toHaveLength(9);
    expect(out.omitted).toBe(0);
  });

  it('keeps the opening, because the opening is the ask', () => {
    const out = conversationWindow(turns(400));
    expect(out.turns.slice(0, TRAIL_OPENING).map((t) => t.text)).toEqual(['turn 0', 'turn 1', 'turn 2']);
  });

  it('keeps the end, because the end is where it got to', () => {
    const out = conversationWindow(turns(400));
    expect(out.turns[out.turns.length - 1].text).toBe('turn 399');
    expect(out.turns).toHaveLength(TRAIL_TURNS);
  });

  // THE MIDDLE IS COUNTED, NOT DROPPED. 400 - 40 = 360, and she is told 360.
  it('says how many are in between rather than pretending there are none', () => {
    const out = conversationWindow(turns(400));
    expect(out.omitted).toBe(360);
    expect(conversationGap(out.omitted)).toBe('Show the 360 messages in between');
  });

  it('says one message in the singular, and says nothing when none are missing', () => {
    expect(conversationGap(1)).toBe('Show the 1 message in between');
    expect(conversationGap(0)).toBe('');
  });
});

/* ------------------------ the reader, against real jsonl ------------------ */
// The lines below are the shapes Claude Code actually writes, copied from a
// real transcript.
describe('the conversation, read off a real transcript', () => {
  let n = 0;
  const base = 'bafe26b9-884c-47d2-b780-f8b80321f1';

  const her = (text, ts) => ({ type: 'user', timestamp: ts, message: { role: 'user', content: [{ type: 'text', text }] } });
  const it_ = (text, ts) => ({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content: [{ type: 'text', text }] } });

  // The reader asks os.homedir every time it looks, which is what lets this
  // run over a temporary home rather than hers.
  const conversationOf = async (lines, over = {}) => {
    n += 1;
    const id = `${base}${String(n).padStart(2, '0')}`;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-conv-'));
    const cwd = '/tmp/agentbox-fixture-repo';
    const dir = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
    const realHome = os.homedir;
    os.homedir = () => home;
    try {
      return await conversation({ sessionId: id, cwd, ...over });
    } finally {
      os.homedir = realHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  };

  it('gives back both sides, oldest first, with the moment each was said', async () => {
    const out = await conversationOf([
      her('I added a new project in Harbour called Powerup but it is not in the list.', '2026-08-12T15:58:52.000Z'),
      it_('Found it. the inbox and Harbour read different stores.', '2026-08-12T16:26:09.000Z'),
      her('sounds good. just make sure the login is remembered between sessions.', '2026-08-12T16:52:25.000Z'),
    ]);
    expect(out.ok).toBe(true);
    expect(out.total).toBe(3);
    expect(out.turns.map((t) => t.who)).toEqual(['you', 'it', 'you']);
    expect(out.turns[0].text).toContain('called Powerup');
    expect(out.turns[0].at).toBe(Date.parse('2026-08-12T15:58:52.000Z'));
  });

  // THE PARAGRAPHS SURVIVE. The card flattens her message to one line because a
  // card quotes a sentence; the conversation shows what was typed.
  it('keeps the line breaks she typed', async () => {
    const out = await conversationOf([her('We’d need two places.\n\nIn the list, and in the detail view.', '2026-08-11T12:42:35.000Z')]);
    expect(out.turns[0].text).toBe('We’d need two places.\n\nIn the list, and in the detail view.');
  });

  // EVERY TOOL RESULT IS A `user` MESSAGE. So is every system reminder and
  // every hook envelope. None of them was written by a human.
  it('leaves out the machine talking to itself', async () => {
    const out = await conversationOf([
      her('the real thing she typed', '2026-08-12T15:58:52.000Z'),
      { type: 'user', timestamp: '2026-08-12T15:59:00.000Z', toolUseResult: { stdout: 'ok' }, message: { role: 'user', content: [{ type: 'text', text: 'the file has been updated' }] } },
      { type: 'user', isMeta: true, timestamp: '2026-08-12T15:59:10.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Caveat: this session is being continued' }] } },
      { type: 'user', timestamp: '2026-08-12T15:59:20.000Z', message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>do not mention this</system-reminder>' }] } },
      { type: 'user', isCompactSummary: true, timestamp: '2026-08-12T15:59:30.000Z', message: { role: 'user', content: [{ type: 'text', text: 'This session is being continued from a previous conversation' }] } },
    ]);
    expect(out.total).toBe(1);
    expect(out.turns[0].text).toBe('the real thing she typed');
  });

  // A TOOL CALL IS A WORK LINE, NOT AN EMPTY MESSAGE. It used to be dropped,
  // because an assistant line that is only a tool_use has no words and drawing
  // it as a bubble would put "" in the thread.
  it('gives an assistant line that is only a tool call its own work line', async () => {
    const out = await conversationOf([
      { type: 'assistant', timestamp: '2026-08-12T17:02:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/sync.mjs' } }] } },
      it_('The sync is running steadily but the queue count is not going down.', '2026-08-12T17:03:00.000Z'),
    ]);
    // One message: the work line is not one, and the header must not say it is.
    expect(out.total).toBe(1);
    expect(out.turns[0]).toMatchObject({ kind: 'work', verb: 'read', subject: '/x/sync.mjs' });
    expect(out.turns[1].who).toBe('it');
  });

  // ONE ANSWER, DRAWN IN THE ORDER IT HAPPENED, AND STILL COUNTED AS ONE.
  // Before shape B this folded into a single bubble with the tool call thrown
  // away. each thing it ran sits on its own line BETWEEN the messages. So the
  // two halves of the reply are two blocks with the work between them, which
  // is what it actually did, while `total` still says two messages, because
  // that is what a person counting would say.
  it('puts the work between the two halves of one answer, and still counts one message', async () => {
    const out = await conversationOf([
      her('do the thing', '2026-08-12T17:00:00.000Z'),
      it_('First I will look at the store.', '2026-08-12T17:01:00.000Z'),
      { type: 'assistant', timestamp: '2026-08-12T17:01:30.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/store.mjs' } }] } },
      it_('Found it, and here is what it says.', '2026-08-12T17:02:00.000Z'),
    ]);
    expect(out.total).toBe(2);
    expect(out.turns.map((t) => t.kind === 'work' ? `work:${t.verb}` : `${t.who}:${t.text}`)).toEqual([
      'you:do the thing',
      'it:First I will look at the store.',
      'work:read',
      'it:Found it, and here is what it says.',
    ]);
  });

  // BUT ONLY UNTIL SOMETHING ARRIVES. This is the bug that was filed: the fold
  // ran on the SIDE alone, and the things that end an answer (the user's
  // message delivered from Agentbox, a peer's, a delivery notice) are all
  // dropped from the reading, so none of them could end anything. Measured on
  // a real session: its whole conversation came out as three turns, and the
  // last was stamped today while opening with a sentence it had said two days
  // earlier, which read as the answer to the question just asked.
  it('does not fold two answers together when a message arrived in between', async () => {
    const out = await conversationOf([
      her('do the thing', '2026-08-12T17:00:00.000Z'),
      it_('Done, nothing in flight.', '2026-08-12T17:01:00.000Z'),
      // Her message from Agentbox. Claude Code stamps it `isMeta` and wraps it,
      // so it is not drawn, and it still ends the answer above it.
      { type: 'user', isMeta: true, timestamp: '2026-08-14T09:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Another Claude session sent a message: status?' }] } },
      it_('Still nothing in flight, two days on.', '2026-08-14T09:00:30.000Z'),
    ]);
    expect(out.total).toBe(3);
    expect(out.turns[1].text).toBe('Done, nothing in flight.');
    expect(out.turns[2].text).toBe('Still nothing in flight, two days on.');
  });

  // A TURN IS STAMPED WHEN IT BEGAN, which is the other half of the same bug:
  // the old fold moved the stamp forward on every line while the text she reads
  // is the head, so the time and the words came from different days.
  it('stamps a folded answer with the moment it began, not the moment it ended', async () => {
    const out = await conversationOf([
      her('do the thing', '2026-08-12T17:00:00.000Z'),
      it_('First I will look at the store.', '2026-08-12T17:01:00.000Z'),
      it_('Found it, and here is what it says.', '2026-08-12T17:09:00.000Z'),
    ]);
    expect(out.turns[1].at).toBe(Date.parse('2026-08-12T17:01:00.000Z'));
  });

  // EVERY REASON A LINE IS DROPPED FROM THE READING IS STILL A REASON THE ANSWER
  // ABOVE IT ENDED. A tagged line is dropped for its tag and a compaction for
  // being a machine's summary; both are things that ARRIVED, and neither used to
  // close the turn in front of it.
  it('lets a line it will never draw still end an answer', async () => {
    const out = await conversationOf([
      it_('Sending it now.', '2026-08-12T17:01:00.000Z'),
      { type: 'user', timestamp: '2026-08-12T17:02:00.000Z', message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>a rule arrived</system-reminder>' }] } },
      it_('Expired undelivered.', '2026-08-12T17:03:00.000Z'),
      { type: 'user', isCompactSummary: true, timestamp: '2026-08-12T17:04:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'This session is being continued' }] } },
      it_('Picking it back up.', '2026-08-12T17:05:00.000Z'),
    ]);
    expect(out.total).toBe(3);
    expect(out.turns.map((t) => t.text)).toEqual(['Sending it now.', 'Expired undelivered.', 'Picking it back up.']);
  });

  // A TOOL RESULT IS THE ONE INBOUND LINE THAT DOES NOT END ANYTHING: it is the
  // answer, still being written. Break this and every reply shatters into one
  // turn per tool call.
  it('does not let a tool result break one answer apart', async () => {
    const out = await conversationOf([
      it_('First I will look.', '2026-08-12T17:01:00.000Z'),
      { type: 'user', timestamp: '2026-08-12T17:01:10.000Z', toolUseResult: { stdout: 'ok' }, message: { role: 'user', content: [{ type: 'text', text: 'the file has been read' }] } },
      it_('Found it.', '2026-08-12T17:01:20.000Z'),
    ]);
    expect(out.total).toBe(1);
    expect(out.turns[0].text).toBe('First I will look.\n\nFound it.');
  });

  // A PASTED WALL IS NOT A TURN ANYONE READS. Real transcripts carry single lines
  // of hundreds of KB; the cap is far past anything anyone reads and far under
  // what would land in the window.
  it('caps one enormous turn instead of handing the screen a novel', async () => {
    const out = await conversationOf([her('x'.repeat(90_000), '2026-08-12T15:58:52.000Z')]);
    expect(out.turns[0].text).toHaveLength(4000);
  });

  // WHAT OVERFLOWS IS THE OLDEST, NEVER THE NEWEST. It used to cut from the
  // front, so the longer an answer ran the more surely its conclusion was the
  // part thrown away. Measured on session-46: a bubble sat at exactly 4000
  // characters with everything past the first 4000 gone.
  it('throws away the front of a long answer, never its end', async () => {
    const out = await conversationOf([
      it_(`${'x'.repeat(9000)} THE PART THAT ANSWERS HER`, '2026-08-12T17:01:00.000Z'),
    ]);
    expect(out.turns[0].text).toHaveLength(4000);
    expect(out.turns[0].text.endsWith('THE PART THAT ANSWERS HER')).toBe(true);
    expect(out.turns[0].text.startsWith('…')).toBe(true);
  });

  it('counts the middle out loud on a long session', async () => {
    const many = Array.from({ length: 120 }, (_, i) => (i % 2
      ? it_(`answer ${i}`, `2026-08-12T15:${String(i % 60).padStart(2, '0')}:00.000Z`)
      : her(`question ${i}`, `2026-08-12T15:${String(i % 60).padStart(2, '0')}:00.000Z`)));
    const out = await conversationOf(many);
    expect(out.total).toBe(120);
    expect(out.turns).toHaveLength(TRAIL_TURNS);
    expect(out.omitted).toBe(80);
    expect(out.turns[0].text).toBe('question 0');
    expect(out.turns[out.turns.length - 1].text).toBe('answer 119');
  });

  // A HALF-WRITTEN LINE IS NORMAL: the session is still writing into this file
  // while she reads it. What it gave us stands.
  it('survives a transcript whose last line is half written', async () => {
    n += 1;
    const id = `${base}9${n}`;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-conv-'));
    const cwd = '/tmp/agentbox-fixture-repo';
    const dir = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), `${JSON.stringify(her('a whole line', '2026-08-12T15:58:52.000Z'))}\n{"type":"assist`);
    const realHome = os.homedir;
    os.homedir = () => home;
    try {
      const out = await conversation({ sessionId: id, cwd });
      expect(out.ok).toBe(true);
      expect(out.total).toBe(1);
    } finally {
      os.homedir = realHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('says so plainly when there is no transcript to read', async () => {
    const out = await conversation({ sessionId: 'nothing-was-ever-written-here', cwd: '/tmp/nowhere' });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('This session has not written a transcript yet.');
  });

  // A SESSION ID BECOMES A FILENAME, so it is checked before it is one.
  it('refuses a session id that is really a path', async () => {
    const out = await conversation({ sessionId: '../../../../etc/passwd', cwd: '/tmp' });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(`${Name} cannot tell which conversation this is.`);
  });
});

/* ------------------------------- the thread ------------------------------- */
// So the item IS the conversation. The button that used to stand in front of it
// is gone, and with it the rule that nothing was read until she pressed
// something: on an agent row the conversation is the message, so reading it is
// drawing the row. What has NOT changed is that the read is streamed, which the
// suite below still holds, and that nothing is read for a row she never opens.
describe('the thread in the pane', () => {
  const focus = read('renderer/src/components/Focus.tsx');
  const thread = read('renderer/src/components/AgentThread.tsx');
  const shared = read('renderer/src/components/Thread.tsx');

  it('is the body of an agent row, and of a task, and it is one component', () => {
    expect(focus).toMatch(/\{agent && \(\s*<AgentThread/);
    // The row that says her tasks are not running is the one thing in the app
    // with no ledger behind it, so it is the one branch that is neither of
    // these two readers. Every other row is still the same two, and still the
    // same one component under them.
    expect(focus).toMatch(/!agent && \(?\s*<ItemThread/);
    // NOTHING SUMMARISES A CONVERSATION THAT IS ON THE SCREEN. The card the
    // pane used to draw instead of the thread is gone from both kinds of row:
    // `leadField` picked one field out of three and the other two did not
    // render at all, which is how a worker's checkpoint erased her own ask.
    expect(focus).not.toMatch(/leadField\(|resultLeads\(|leadWithResult/);
    expect(focus).not.toMatch(/\{md\(body\)\}|md\(body\)\}/);
    // Both readers hand their events to the same drawing.
    expect(read('renderer/src/components/ItemThread.tsx')).toMatch(/<Thread/);
    expect(thread).toMatch(/<Thread/);
  });

  it('reads the conversation itself rather than a button that offers it', () => {
    expect(thread).toContain('useEffect');
    expect(thread).not.toContain('conv-open');
    // `whole` rides along because the gap line is a door now: this transcript
    // lives on disk, so the middle has to be asked for again.
    expect(thread).toMatch(/api\.agentConversation\(\{ pid, sessionId, cwd, whole \}\)/);
  });

  it('opens at the bottom, and never animates getting there', () => {
    // Instantly: nothing animates is the first rule about what must not come
    // back.
    //
    // THE BOTTOM IS THE SCROLLING BOX'S, NOT THE THREAD'S OWN FOOT, which is:
    // bringing the foot into view left the row's files and buttons under the
    // fold, 120px on a typical live session and far more on one with document
    // previews embedded under its thread. The hold lives in
    // ../thread-bottom and is tested there.
    expect(shared).toContain('holdAtBottom');
    expect(shared).toMatch(/closest\('\.focus-scroll'\)/);
    expect(shared).not.toContain('scrollIntoView');
    // Instantly: the hold writes scrollTop and never asks for a behaviour.
    const bottom = read('renderer/src/thread-bottom.ts');
    expect(bottom).toMatch(/el\.scrollTop = want/);
    expect(bottom).not.toMatch(/behavior:\s*'smooth'/);
  });

  it('draws the page while it is being read, instead of a blank one', () => {
    // What was here was one faint sentence, which on a 793px page is blank.
    expect(thread).toContain('ThreadWaiting');
    expect(thread).toMatch(/Reading the conversation with \$\{name\}/);
    expect(shared).toContain('export function ThreadWaiting');
    // Still and quiet, like everything else: no spinner and nothing that moves.
    const css = read('renderer/src/styles.css');
    expect(css).toContain('.thread-waiting');
    expect(css.slice(css.indexOf('.thread-waiting'), css.indexOf('.thread-waiting') + 900))
      .not.toMatch(/animation|@keyframes|transition/);
  });

  it('does not put a second door on the row', () => {
    // THE TIME IS A FACT ON EVERY ROW NOW, and there is still exactly one way
    // to look back under a title (a count of ONE). The door opened a list
    // of one-line sentences saying what had happened here; the thread below
    // IS that list, with the words in it rather than their beginnings, and it
    // is open rather than folded away. A second surface holding the same
    // conversation is a duplicate, which has been rejected every time it has
    // appeared.
    expect(focus).not.toMatch(/historyOpen|<ThreadHistory/);
    // THE LINE MOVED TO ITS OWN COMPONENT when the turning mark was picked to
    // lead it. The fact this test is about did not move: the time is
    // printed as a plain reading and nothing opens from it.
    const byline = read('renderer/src/components/Byline.tsx');
    expect(byline).toMatch(/`last moved \$\{f\.age\} ago`/);
    expect(byline).not.toMatch(/<button|onClick=/);
  });

  it('re-reads when the session moves, and not on every poll', () => {
    // A card that never changed was the original bug. A thread that reloads on
    // every snapshot poll is the same failure the other way up, so the read is
    // keyed to the session's own clock.
    expect(thread).toMatch(/\}, \[pid, sessionId, cwd, movedAt, whole\]\);/);
    expect(focus).toMatch(/movedAt=\{agent\.lastActiveAt \?\? 0\}/);
  });
});

/* --------------------------- and it never blocks -------------------------- */
// A 160MB TRANSCRIPT costs 629ms to pull the readable text out of with
// readFileSync, measured on a real machine, during which zero heartbeats of a 10ms timer ran. That is the window frozen for two thirds
// of a second on a click. Streamed, the same read let 40 of them run and the
// worst was 1ms late. The reader must stay streamed.
describe('reading a huge transcript does not freeze the window', () => {
  it('streams the file rather than reading it whole', () => {
    const src = read('main/agents.mjs');
    const body = src.slice(src.indexOf('export async function conversation'));
    expect(body).toContain('readline.createInterface');
    expect(body).toContain('fs.createReadStream');
    expect(body).not.toContain('readFileSync');
  });

  it('lets other work run while it reads', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-conv-'));
    const cwd = '/tmp/agentbox-fixture-repo';
    const dir = path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    const id = 'a-big-one';
    const line = (i) => JSON.stringify({
      type: i % 2 ? 'assistant' : 'user',
      timestamp: '2026-08-12T15:58:52.000Z',
      message: { role: i % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: `turn ${i} ${'x'.repeat(2000)}` }] },
    });
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), `${Array.from({ length: 4000 }, (_, i) => line(i)).join('\n')}\n`);
    const realHome = os.homedir;
    os.homedir = () => home;
    let ticks = 0;
    const beat = setInterval(() => { ticks += 1; }, 5);
    try {
      const out = await conversation({ sessionId: id, cwd });
      expect(out.total).toBe(4000);
      expect(ticks).toBeGreaterThan(0);
    } finally {
      clearInterval(beat);
      os.homedir = realHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

// ONE CHAT SCREEN, AND HER OWN TASKS ARE ON IT.
//
// WHAT CAN SILENTLY BREAK HERE, which is what this file is for. A thread that
// drops half the row still draws perfectly: the messages that survive are
// correctly ordered, correctly attributed and correctly spaced, and nothing on
// the screen says the rest ever existed. That is the exact failure mode the
// old pane had — one field drawn, two fields not, no symptom — so the mapping
// is pinned event by event rather than sampled.
//
// The rest is asserted against the source, because this repo has no DOM test
// environment (the reasoning is in shortcuts-swallow-their-key.test.mjs).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemThread } from '../renderer/src/item-thread.ts';
import { traceLines } from '../renderer/src/terminal.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const T = Date.parse('2026-08-22T09:00:00');
const min = 60_000;

// A row of hers in the shape her store actually writes it: she composes the
// directive, a worker claims it, works, checks in, comes back with a result,
// she answers, it reopens. Every field here is one appended line in
// work-items.jsonl.
const ledger = [
  { id: 'w-1', ts: T, source: 'founder', patch: { title: 'The lists should share one layout', body: 'We should only keep one list layout in the app.' } },
  { id: 'w-1', ts: T + 2 * min, source: 'agent', claim: { holder: 'mcp-1', leaseUntil: T + 7 * min }, patch: { status: 'claimed' } },
  { id: 'w-1', ts: T + 9 * min, source: 'agent', patch: { note: 'Making your own tasks read like the Claude Code ones.' } },
  { id: 'w-1', ts: T + 20 * min, source: 'agent', epoch: 1, patch: {}, heartbeat: true },
  { id: 'w-1', ts: T + 31 * min, source: 'agent', patch: { status: 'done', result: 'It is built and 2541 tests pass.' } },
  { id: 'w-1', ts: T + 40 * min, source: 'founder', patch: { answer: 'merge it' } },
  { id: 'w-1', ts: T + 40 * min, source: 'founder', patch: { status: 'open' } },
];

// The trace that worker left on disk, in the supervisor's real shape.
//
// ITS CLOCK IS UTC AND CARRIES NO DATE, because that is what the supervisor
// writes (`new Date.toISOString.slice(11, 19)`, main/supervisor.mjs), and
// stamping it any other way is not a fixture of her store. This used to be
// hand-typed local wall-clock, which put every line of the run a day into the
// future once notes.ts rolled it forward past `startedAt` — invisible while
// runs were poured out at their pickup, and the reason the interleave below
// could not be seen going wrong.
const at = (ms) => new Date(T + ms).toISOString().slice(11, 19);
const trace = {
  startedAt: T + 1 * min,
  text: [
    '# the lists should share one layout',
    `${at(64_000)}  Reading what the Claude Code view does before touching anything.`,
    `${at(82_000)}  [Read] renderer/src/components/AgentThread.tsx`,
    `${at(91_000)}  [Grep] leadField`,
    `${at(122_000)}  [Bash] cd /tmp/wt-0f39 && npx vitest run`,
    `${at(280_000)}  Two thousand five hundred and forty one pass.`,
    `${at(300_000)}  == RESULT (ok) ==`,
    'It is built and 2541 tests pass.',
    `# exited (0) ${new Date(T + 5 * min).toISOString()}`,
  ].join('\n'),
};

/* ---------------------------- the whole row ------------------------------ */
describe('her own task, read as the conversation it already is', () => {
  const { events, total } = itemThread(ledger, [trace]);

  // THE ASK IS ON THE SCREEN AND SO IS THE RESULT. The pane used to draw ONE of
  // these: `leadField` returned 'result' and the body the user typed was
  // never rendered. That fault was reported again and again.
  it('keeps every message, in the order it was said', () => {
    const said = events.filter((e) => e.kind !== 'work');
    expect(said.map((e) => [e.who, e.text])).toEqual([
      ['you', 'We should only keep one list layout in the app.'],
      ['it', 'Reading what the Claude Code view does before touching anything.'],
      ['it', 'Two thousand five hundred and forty one pass.'],
      ['it', 'Making your own tasks read like the Claude Code ones.'],
      ['it', 'It is built and 2541 tests pass.'],
      ['you', 'merge it'],
    ]);
  });

  // The user's words read at full strength and an agent's are quiet. Attribution is
  // the one thing here that is invisible when it is wrong: a thread that puts
  // her name on an agent's sentence looks entirely normal.
  it('never puts her name on words an agent wrote', () => {
    const hers = events.filter((e) => e.kind !== 'work' && e.who === 'you');
    expect(hers.map((e) => e.text)).toEqual([
      'We should only keep one list layout in the app.',
      'merge it',
    ]);
  });

  // The count is messages, not lines. A run of three tool calls is one thing
  // that happened, and counting it as three would tell her the row is louder
  // than it is. A worker that stopped mid-reply to run something is still ONE
  // message, which is why five is the number against six blocks on the screen:
  // the second half of that reply wears no name and is not counted twice.
  it('counts the messages and not the work', () => {
    expect(total).toBe(5);
  });

  // WHAT IT RAN, QUIET, UNDER WHAT IT SAID, which is design shape B applied
  // here. The verb is a plain word and the subject is the command with its scaffolding
  // peeled off, both out of shared/work-lines.mjs, which is what makes these
  // read the same as the ones on a Claude Code row.
  it('puts the tool calls between the messages, in her words', () => {
    const tools = events
      .filter((e) => e.kind === 'work')
      .map((e) => `${e.verb} ${e.subject}`.trim())
      .filter((line) => /^(read|searched for|ran) /.test(line));
    expect(tools).toEqual([
      'read renderer/src/components/AgentThread.tsx',
      'searched for leadField',
      // `npx vitest run` says what it did now, not how it was typed.
      'ran the tests',
    ]);
  });

  // A worker still talking is one message, not four: the second and later
  // sentences of one run wear no name and no time.
  it('does not give one run four names', () => {
    const fromRun = events.filter((e) => e.kind !== 'work' && e.who === 'it').slice(0, 2);
    expect(fromRun[0].same).toBeUndefined();
    expect(fromRun[1].same).toBe(true);
  });

  // THE LEDGER'S OWN EVENTS ARE STILL ON THE PAGE. The door that used to hold
  // them is gone, so a close, a rename or a pause that dropped out here would
  // be gone from the app altogether.
  it('keeps what happened as well as what was said', () => {
    const quiet = events.filter((e) => e.kind === 'work').map((e) => e.verb);
    expect(quiet).toContain('You sent it back');
    // A close that carried a result speaks AS the result, which is
    // thread-history's ranking and not a second copy of it: the finished word
    // outranks the bookkeeping written on the same line.
    expect(events.some((e) => e.text === 'It is built and 2541 tests pass.')).toBe(true);
  });

  // Bookkeeping stays silent, which is thread-history's rule and not a second
  // copy of it: a worker that held the row for an hour did one thing.
  it('says nothing about the lease', () => {
    expect(events.map((e) => e.verb ?? e.text).join(' ')).not.toMatch(/heartbeat|lease|picked it up/i);
  });
});

/* ----------------- the ask, on whichever line it arrived ----------------- */
// HER STORE WRITES A NEW ROW AS TWO LINES. The system stamps title, kind and
// priority; the founder's own line lands a millisecond later with the title
// again and the body. The ledger used to treat the FIRST of those as the birth,
// so on every row she has ever written herself her ask came out as a rename
// ("was …") and the user's words were in no event at all.
//
// Invisible while this fed a fold nobody opened. Not invisible now that the
// thread is the page: the body sat on the second ledger line and the ask was
// nowhere on the screen.
describe('the row she wrote herself', () => {
  const asHerStoreWritesIt = [
    { id: 'w-2', ts: T, source: 'system', patch: { title: 'The export button', status: 'open', kind: 'directive', priority: 5 } },
    { id: 'w-2', ts: T + 29, source: 'founder', patch: { title: 'The export button', body: 'I just noticed that the export button does nothing.' } },
    { id: 'w-2', ts: T + 5 * min, source: 'agent', patch: { result: 'It is fixed.' } },
  ];

  it('opens on her ask even when the system stamped the title first', () => {
    const { events } = itemThread(asHerStoreWritesIt, []);
    const said = events.filter((e) => e.kind !== 'work');
    expect(said[0]).toMatchObject({
      who: 'you',
      text: 'I just noticed that the export button does nothing.',
    });
    // And never as a rename, which is what it used to come out as.
    expect(events.map((e) => e.verb ?? '').join(' ')).not.toMatch(/renamed/);
  });
});

/* ------------------------------- the window ------------------------------ */
// A long row gets exactly the window a long Claude Code session gets, from the
// same function. everything past the point of answering belongs somewhere she
// opens on purpose. Long rows ran past a hundred messages and a page tens of
// thousands of pixels tall before this.
describe('a row with six sessions on it', () => {
  const many = [
    { id: 'w-3', ts: T, source: 'founder', patch: { title: 'long', body: 'the ask' } },
    ...Array.from({ length: 60 }, (_, i) => ({
      id: 'w-3', ts: T + (i + 1) * min, source: 'agent', patch: { note: `checkpoint ${i}` },
    })),
    { id: 'w-3', ts: T + 100 * min, source: 'agent', patch: { result: 'the answer' } },
  ];
  const { events, total, omitted, outcome } = itemThread(many, []);

  // THE ANSWER AT THE FOOT COUNTS AS SHOWN, because it is on the page. It is
  // held out of the stream (see ItemOutcome) and drawn whole underneath, so the
  // 40 blocks the window kept plus that one are 41 of the row's 62 messages.
  it('counts every message and says how many are not shown', () => {
    expect(total).toBe(62);
    expect(omitted).toBe(21);
    expect(events.filter((e) => e.kind !== 'work').length).toBe(40);
    expect(omitted).toBe(total - events.filter((e) => e.kind !== 'work' && !e.same).length - 1);
  });

  // THE HEAD AND THE GAP COUNT THE SAME THING. The window counts blocks and the
  // head counts messages, and a reply that stopped twice for a tool is three
  // blocks and one message. Taking the window's own number put "82 messages in
  // between, not shown" under a head that said the row had 23 on it.
  it('never says more are missing than the row has', () => {
    const runs = [
      { id: 'w-4', ts: T, source: 'founder', patch: { title: 'x', body: 'the ask' } },
      ...Array.from({ length: 50 }, (_, i) => ({
        id: 'w-4', ts: T + (i * 3 + 1) * min, source: 'agent', claim: { holder: `m${i}`, leaseUntil: T }, patch: { status: 'claimed' },
      })),
    ];
    const traces = Array.from({ length: 50 }, (_, i) => ({
      startedAt: T + (i * 3) * min,
      text: Array.from({ length: 6 }, (_, j) => `09:0${j}:0${j}  sentence ${i}.${j}`).join('\n'),
    }));
    const out = itemThread(runs, traces);
    expect(out.omitted).toBeLessThan(out.total);
    expect(out.omitted).toBe(out.total - out.events.filter((e) => e.kind !== 'work' && !e.same).length);
  });

  // The opening is the ask and the end is where it got to. Losing either is
  // the failure the window exists to avoid.
  //
  // AND THE END IS NOT A BUBBLE IN THE STREAM ANY MORE.So the newest answer
  // leaves the stream and comes back as `outcome`, which the pane draws whole
  // underneath the thread.
  it('keeps her ask, and hands the newest answer to the foot', () => {
    const said = events.filter((e) => e.kind !== 'work');
    expect(said[0].text).toBe('the ask');
    expect(outcome).toEqual({ at: T + 100 * min, text: 'the answer', field: 'result' });
    // Never in both places. The same words drawn twice on one screen is the
    // duplicate picture, which has been rejected every time it has appeared.
    expect(said.map((e) => e.text)).not.toContain('the answer');
  });
});

/* ------------------------- the run that is live -------------------------- */
// EVERY RUN IS IN THE THREAD, INCLUDING THE ONE HAPPENING NOW. Design D used to
// put a live run's lines in a block at the TOP of the task, so they were
// deliberately kept out of the thread to avoid drawing them twice.
describe('the run happening right now', () => {
  it('is in the conversation while it is live, exactly as a finished one is', () => {
    const said = itemThread(ledger, [trace]).events.map((e) => e.text ?? e.verb);
    expect(said).toContain('Reading what the Claude Code view does before touching anything.');
  });

  // A claim whose session left no trace on disk is a real thing on real rows,
  // and it still has to say so rather than vanish.
  it('still says a claim happened when its run left nothing behind', () => {
    const { events } = itemThread(ledger, []);
    expect(events.map((e) => e.verb)).toContain('An agent picked it up');
  });
});

/* ------------------------- the moment, not the digits -------------------- */
// The trace's clock is UTC and carries no date, so a work line inside a
// conversation had no way to know which day it belonged under. Printing the
// digits straight out put her evening seven hours into the morning once
// already.
describe('when a work line happened', () => {
  it('carries a real moment, not just the digits on the trace', () => {
    // The session's own startedAt supplies the date the trace does not carry.
    const startedAt = Date.parse('2026-08-22T09:00:00Z');
    const [first, second] = traceLines({
      startedAt,
      text: ['09:01:04  the first line', '09:02:00  [Bash] ls'].join('\n'),
    });
    expect(first.at).toBe(Date.parse('2026-08-22T09:01:04Z'));
    expect(second.at).toBe(Date.parse('2026-08-22T09:02:00Z'));
  });

  it('gives every node in a thread a moment the day heading can read', () => {
    const { events } = itemThread(ledger, [trace]);
    for (const e of events) expect(Number.isFinite(e.at)).toBe(true);
    expect(events.every((e) => e.at > 0)).toBe(true);
  });
});

/* --------------------- the answer at the end of it ----------------------- */
// The first cut put the agent's finished word through the same chat block as
// everything else, so what she opened the row FOR came out as the fortieth grey
// bubble in a stream: same size, same name, same time as a checkpoint written
// half an hour earlier. It is held out of the stream now and drawn whole
// underneath, which is the block the pane led with before this row existed.
//
// WHAT CAN SILENTLY BREAK. Lifting the wrong message is invisible: a settled
// answer sitting under her own reply reads exactly like a live one, and a
// message drawn in both places reads as the agent saying it twice.
describe('the concise answer, at the foot of the conversation', () => {
  const came_back = [
    { id: 'w-5', ts: T, source: 'founder', patch: { title: 'the button', body: 'the export button does nothing.' } },
    { id: 'w-5', ts: T + 2 * min, source: 'agent', patch: { note: 'Reading what the button is wired to.' } },
    { id: 'w-5', ts: T + 9 * min, source: 'agent', patch: { status: 'done', result: '**It is fixed.**\n\nThe handler was never bound.' } },
  ];

  it('hands the finished result to the foot, and not to the stream', () => {
    const { events, outcome } = itemThread(came_back, []);
    expect(outcome).toMatchObject({ field: 'result', text: '**It is fixed.**\n\nThe handler was never bound.' });
    expect(events.map((e) => e.text ?? '').join(' ')).not.toContain('It is fixed.');
    // And everything else on the row is still in the stream, in order.
    const said = events.filter((e) => e.kind !== 'work').map((e) => e.text);
    expect(said).toEqual(['the export button does nothing.', 'Reading what the button is wired to.']);
  });

  // A row still in flight has a checkpoint as its newest word, and the pane has
  // always labelled the two differently. So the foot has to say which it is.
  it('hands a checkpoint to the foot too, and says it is one', () => {
    const { events, outcome } = itemThread(came_back.slice(0, 2), []);
    expect(outcome).toMatchObject({ field: 'note', text: 'Reading what the button is wired to.' });
    expect(events.map((e) => e.text)).not.toContain('Reading what the button is wired to.');
  });

  // THE ONE THAT MATTERS. Once she has replied, the newest word on the row is
  // HERS. There is no answer at the end to lift, and pinning the result she has
  // already answered below her own reply would put a settled answer at the
  // bottom of the page pretending to be the live one.
  it('lifts nothing once she has replied, and ends on her words', () => {
    const answered = [
      ...came_back,
      { id: 'w-5', ts: T + 20 * min, source: 'founder', patch: { answer: 'that is not the button I meant' } },
    ];
    const { events, outcome } = itemThread(answered, []);
    expect(outcome).toBe(null);
    const said = events.filter((e) => e.kind !== 'work');
    expect(said[said.length - 1]).toMatchObject({ who: 'you', text: 'that is not the button I meant' });
    // And the result is back in the stream where it happened, not missing.
    expect(said.map((e) => e.text).join(' ')).toContain('It is fixed.');
  });

  // A row picked up AGAIN after a result has the agent talking below that
  // result. The end of the conversation is then those lines, so nothing is
  // lifted: a result dragged underneath a run that came after it would be the
  // thread reordering itself.
  it('lifts nothing when a later run is talking under the result', () => {
    const again = [
      ...came_back,
      { id: 'w-5', ts: T + 30 * min, source: 'agent', claim: { holder: 'mcp-2', leaseUntil: T + 40 * min }, patch: { status: 'claimed' } },
    ];
    const later = { startedAt: T + 29 * min, text: '09:30:00  Picking the button back up.' };
    const { events, outcome } = itemThread(again, [later]);
    expect(outcome).toBe(null);
    const said = events.filter((e) => e.kind !== 'work');
    expect(said[said.length - 1].text).toBe('Picking the button back up.');
  });

  // A row nobody has answered on yet has no agent word at all, and the thread
  // is her ask alone. Inventing a foot for it would draw the user's words twice.
  it('lifts nothing from a row that only holds her ask', () => {
    const { events, outcome } = itemThread(came_back.slice(0, 1), []);
    expect(outcome).toBe(null);
    expect(events.map((e) => e.text)).toEqual(['the export button does nothing.']);
  });

  // The pane's half of it: the block that draws the foot is the block the pane
  // led with before, not a new one invented for the thread.
  it('is drawn in the block the pane already had', () => {
    const view = read('renderer/src/components/ItemThread.tsx');
    expect(view).toMatch(/built\.outcome|outcome\s*[,}]/);
    expect(view).toContain('className="outcome"');
    expect(view).toContain('appendix-label');
    expect(view).toContain('Latest checkpoint');
    // Both the closed-row outcome and the in-flight label survive in the sheet.
    const css = read('renderer/src/styles.css');
    expect(css).toMatch(/^\.outcome \{/m);
    expect(css).toMatch(/^\.appendix-foot \{/m);
  });
});

/* ----------------------------- one component ----------------------------- */
describe('one component draws every chat', () => {
  const shared = read('renderer/src/components/Thread.tsx');
  const agentThread = read('renderer/src/components/AgentThread.tsx');
  const itemThreadView = read('renderer/src/components/ItemThread.tsx');
  const focus = read('renderer/src/components/Focus.tsx');

  it('draws both kinds of chat from the same file', () => {
    expect(agentThread).toMatch(/<Thread/);
    expect(itemThreadView).toMatch(/<Thread/);
    // The look, the folding and the landing are the shared component's alone.
    for (const own of ['msg-body', 'did-run', 'holdAtBottom', 'groupWork']) {
      expect(shared).toContain(own);
      expect(agentThread).not.toContain(own);
      expect(itemThreadView).not.toContain(own);
    }
  });

  // The frosted, semi-transparent, blurred look picked in design round two was
  // scoped to an agent's item because that was the only chat in the app. One
  // screen style means it rides the pane.
  it('gives every task the look she picked for the chat', () => {
    expect(focus).toMatch(/className="focus-body markdown agent-thread"/);
  });

  it('never writes anything to draw a conversation', () => {
    for (const src of [shared, agentThread, itemThreadView]) {
      expect(src).not.toMatch(/api\.(update|reply|send|write|patch)/i);
    }
  });
});

/* --------- the bottom of a live conversation is its newest line ----------- */

// The agent she was watching had been working without a pause for 26 minutes
// and had run about 240 commands. What she could see was its checkpoint from
// 3:34pm and nothing under it, because a run was poured out whole at the
// position of the ONE ledger line it hangs off — the claim — and anything
// written after that claim was appended below all of it. Her own two replies
// went under 76 work lines that were typed before she sent them, and the
// agent's newest sentence sat ABOVE a message stamped 22 minutes earlier.
//
// So the thing pinned here is not the sort. It is that the last line of a
// live thread is the last thing that happened on the row, whoever wrote it.
describe('a message written while a run is working lands where it happened', () => {
  const R = Date.parse('2026-08-23T22:33:00.000Z');
  const stamp = (ms) => new Date(R + ms).toISOString().slice(11, 19);

  const live = [
    { id: 'w-2', ts: R - 11_000, source: 'founder', patch: { title: 'The code artifact', body: "That's not how the preview card should look." } },
    { id: 'w-2', ts: R + 7_000, source: 'agent', claim: { holder: 'mcp-2', leaseUntil: R + 300_000 }, patch: { status: 'claimed' } },
    // The checkpoint the worker wrote 85 seconds in, and then kept working.
    { id: 'w-2', ts: R + 85_000, source: 'agent', patch: { note: 'Redrawing it inside the real app. I will bring it back on this row.' } },
    { id: 'w-2', ts: R + 1_133_000, source: 'founder', patch: { answer: 'keep going please' } },
    { id: 'w-2', ts: R + 1_588_000, source: 'founder', patch: { answer: 'any update on this' } },
  ];
  const running = {
    startedAt: R,
    text: [
      '# the code artifact',
      `${stamp(5_000)}  I'll start by claiming the item and reading the current state.`,
      `${stamp(81_000)}  [Bash] ls renderer/src`,
      `${stamp(397_000)}  Now wiring the pane and the bridge.`,
      `${stamp(1_018_000)}  Now the shot script that drives the real app.`,
      `${stamp(1_438_000)}  [Bash] npx vitest run`,
    ].join('\n'),
  };

  const { events, outcome } = itemThread(live, [running]);
  const said = events.filter((e) => e.kind !== 'work');

  it('reads top to bottom in the order the clock says', () => {
    expect(said.map((e) => [e.who, e.text])).toEqual([
      ['you', "That's not how the preview card should look."],
      ['it', "I'll start by claiming the item and reading the current state."],
      ['it', 'Redrawing it inside the real app. I will bring it back on this row.'],
      ['it', 'Now wiring the pane and the bridge.'],
      ['it', 'Now the shot script that drives the real app.'],
      ['you', 'keep going please'],
      ['you', 'any update on this'],
    ]);
    // And it really is sorted, work lines included: nothing on the screen goes
    // backwards in time, which is the check that fails if a run is ever poured
    // out at its pickup again.
    const times = events.map((e) => e.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  // A worker still talking wears no name; a worker talking again AFTER
  // something else was written on the row does. The checkpoint at 85s breaks
  // the run's own chain, so the sentence under it is named rather than
  // reading as more of the checkpoint.
  it('renames the agent when something else came between its sentences', () => {
    const first = said.find((e) => e.text.startsWith("I'll start"));
    const after = said.find((e) => e.text === 'Now wiring the pane and the bridge.');
    const next = said.find((e) => e.text === 'Now the shot script that drives the real app.');
    expect(first.same).toBeUndefined();
    expect(after.same).toBeUndefined();
    expect(next.same).toBe(true);
  });

  // Her reply is the newest word on the row, so there is no agent answer to
  // lift to the foot. The checkpoint stays in the stream where it happened.
  it('leaves no answer at the foot once she has replied', () => {
    expect(outcome).toBe(null);
  });
});

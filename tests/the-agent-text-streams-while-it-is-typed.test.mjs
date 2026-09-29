// THE TEXT ARRIVES WHILE IT IS BEING WRITTEN —, hers, 2026-08-25, on a shot of
// one of her own rows with a session live on it:
//
// THE CAUSE WAS TWO WAITS STACKED ON EACH OTHER, and both are measured.
//
// The first is the CLI. Without `--include-partial-messages` it emits one
// `assistant` event per FINISHED message, so a sentence exists nowhere until
// the model has written the last word of it. Measured over her own 1,664
// traces on 2026-08-25: 12,892 lines of agent prose, and the gap before one
// appears has a median of 8 seconds, a 90th of 35, and 452 of those waits run
// over a minute. Measured on the real binary (2.1.245) with the flag on, a
// two-sentence answer put its first text on our stdout at 3,279ms against
// 4,508ms for the finished message; a long answer is where the whole gap is.
//
// The second is ours. `ItemThread` re-read the trace on an 8 second timer and
// on nothing else, so up to another 8 seconds rode on top of every one of
// those waits, including the ones for the work lines she says DO stream.
//
// What is pinned here is the parsing and the joining, because both can be
// wrong while the screen still looks perfect: a half-typed sentence that never
// gets dropped sits under its own finished copy for the rest of the run, and a
// live block that is never drawn looks exactly like an agent that is thinking.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamingText } from '../main/supervisor.mjs';
import { itemThread } from '../renderer/src/item-thread.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// The frames the CLI really writes, in the shape the probe caught them:
// message_start, content_block_start, N text deltas, then the finished
// `assistant` event, then the stops.
const frame = (event) => JSON.stringify({ type: 'stream_event', event });
const start = () => frame({ type: 'message_start' });
const textBlock = () => frame({ type: 'content_block_start', content_block: { type: 'text' } });
const toolBlock = () => frame({ type: 'content_block_start', content_block: { type: 'tool_use' } });
const delta = (text) => frame({ type: 'content_block_delta', delta: { type: 'text_delta', text } });

/* --------------------- what the supervisor keeps ------------------------- */
describe('the sentence being typed, held on the live session', () => {
  it('grows a piece at a time', () => {
    const s = {};
    expect(streamingText(s, start())).toBe(true);
    streamingText(s, textBlock());
    streamingText(s, delta('Now the IPC handlers'));
    expect(s.saying).toBe('Now the IPC handlers');
    streamingText(s, delta(' and the bridge.'));
    expect(s.saying).toBe('Now the IPC handlers and the bridge.');
    expect(s.sayingAt).toBeGreaterThan(0);
  });

  it('keeps the finished block while the agent runs a tool', () => {
    // THE BLOCK IS NOT CLEARED WHEN THE MESSAGE ENDS, on purpose. The finished
    // words reach her screen down the trace file and the live ones down the
    // snapshot, so clearing them here would blink the sentence off for however
    // long a read takes and then put it back. The thread drops it by comparing
    // (below), which is not a race.
    const s = {};
    streamingText(s, start());
    streamingText(s, textBlock());
    streamingText(s, delta('Reading the two files first.'));
    streamingText(s, toolBlock());
    streamingText(s, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Reading the two files first.' }] } }));
    expect(s.saying).toBe('Reading the two files first.');
  });

  it('starts clean on the next message', () => {
    const s = { saying: 'the last thing it said', sayingAt: 1 };
    streamingText(s, start());
    expect(s.saying).toBe('');
    expect(s.sayingAt).toBe(0);
  });

  it('keeps nothing from a thought or a tool argument', () => {
    const s = {};
    streamingText(s, start());
    streamingText(s, frame({ type: 'content_block_start', content_block: { type: 'thinking' } }));
    streamingText(s, frame({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } }));
    streamingText(s, frame({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"a":' } }));
    expect(s.saying ?? '').toBe('');
  });

  it('drops a block too long to be a sentence rather than cutting it', () => {
    // A CUT STRING NEVER MATCHES THE TRACED ONE, so cutting would leave half a
    // paragraph parked under its own whole copy for the rest of the run. Her
    // longest real line of agent prose over 1,664 traces is 423 characters.
    const s = {};
    streamingText(s, start());
    streamingText(s, textBlock());
    streamingText(s, delta('x'.repeat(20_001)));
    expect(s.saying).toBe('');
  });

  it('ignores a line that is not a partial frame at all', () => {
    const s = { saying: 'held', sayingAt: 5 };
    expect(streamingText(s, 'not json')).toBe(false);
    expect(streamingText(s, JSON.stringify({ type: 'result', result: 'done' }))).toBe(false);
    expect(s.saying).toBe('held');
  });
});

/* ---------------- and the flag that makes those frames exist -------------- */
describe('the sessions are spawned asking for it', () => {
  it('passes --include-partial-messages', () => {
    const src = read('main/supervisor.mjs');
    expect(src).toContain("'--output-format', 'stream-json', '--verbose', '--include-partial-messages'");
  });

  it('writes only finished lines to the trace', () => {
    // The persisted trace is what she reads back weeks later and what every
    // count in decisions.md is measured off. A half-typed sentence in it would
    // corrupt both. `traceStreamLine` reads `assistant` and `result` and
    // nothing else, and the partial frames are handled by their own function.
    const src = read('main/supervisor.mjs');
    const fn = src.slice(src.indexOf('function traceStreamLine'));
    expect(fn.slice(0, fn.indexOf('\n}\n'))).not.toMatch(/stream_event|text_delta|saying/);
  });
});

/* ------------------- what the thread does with it ------------------------- */
const T = Date.parse('2026-08-25T12:00:00Z');
const min = 60_000;
const at = (ms) => new Date(T + ms).toISOString().slice(11, 19);

// Her row in the shape her store writes it: she composes it, a worker claims
// it and is still on it. Every field here is one appended line in
// work-items.jsonl.
const ledger = [
  { id: 'w-1', ts: T, source: 'founder', patch: { title: 'The theme step', body: 'The tutorial is in light mode.' } },
  { id: 'w-1', ts: T + 1 * min, source: 'agent', claim: { holder: 'mcp-1', leaseUntil: T + 6 * min }, patch: { status: 'claimed' } },
];

const trace = {
  startedAt: T + 1 * min,
  text: [
    '# The theme step',
    `${at(64_000)}  Her app came back up at noon, so the first thing to check is the build.`,
    `${at(82_000)}  [Bash] git log --oneline -1`,
  ].join('\n'),
};

const sayingOf = (events) => events.filter((e) => e.kind !== 'work').map((e) => e.text);

describe('the live sentence in her conversation', () => {
  it('is at the foot of the thread while it is being typed', () => {
    const { events } = itemThread(ledger, [trace], {
      text: 'Now re-running the whole suite on that branch,',
      at: T + 90_000,
      run: trace.startedAt,
    });
    expect(sayingOf(events).at(-1)).toBe('Now re-running the whole suite on that branch,');
    // And it is the last thing on the page, under the work line that came
    // before it, because it happened after that work line.
    expect(events.at(-1).text).toBe('Now re-running the whole suite on that branch,');
  });

  it('wears no second name under its own run', () => {
    // One agent still talking is not four messages from four people. The live
    // block belongs to the session that is typing it, so it is `same` exactly
    // when the thing above it is that session too.
    const { events } = itemThread(ledger, [trace], {
      text: 'and the three fixes still stand.',
      at: T + 90_000,
      run: trace.startedAt,
    });
    expect(events.at(-1).same).toBe(true);
  });

  it('disappears the moment the trace carries the same words', () => {
    // THE ONE THING THAT MAKES THIS SAFE. Both strings go through `said`, so a
    // live copy differing only by a trailing space cannot sit under its
    // finished twin for the rest of the run.
    const settled = {
      startedAt: trace.startedAt,
      text: `${trace.text}\n${at(92_000)}  Now re-running the whole suite on that branch.`,
    };
    const { events } = itemThread(ledger, [settled], {
      text: 'Now re-running the whole suite on that branch.  \n',
      at: T + 90_000,
      run: trace.startedAt,
    });
    const said = sayingOf(events).filter((t) => t.startsWith('Now re-running'));
    expect(said).toEqual(['Now re-running the whole suite on that branch.']);
  });

  it('changes nothing at all on a row with nothing running', () => {
    const quiet = itemThread(ledger, [trace]);
    const withEmpty = itemThread(ledger, [trace], null);
    expect(withEmpty).toEqual(quiet);
    expect(itemThread(ledger, [trace], { text: '', at: 0, run: 0 })).toEqual(quiet);
  });

  it('does not move the count over the conversation', () => {
    // The head says how many MESSAGES are on the task, and a run that narrates
    // four times is one agent still talking (`saidCount`). A live block
    // continuing its own run is part of that same message, so the number over
    // the thread does not tick up while a sentence is being typed and then
    // stay put when the trace delivers it. The count she reads is steady.
    const before = itemThread(ledger, [trace]);
    const during = itemThread(ledger, [trace], {
      text: 'One more thing to check.',
      at: T + 90_000,
      run: trace.startedAt,
    });
    expect(during.total).toBe(before.total);
    expect(during.events.at(-1).text).toBe('One more thing to check.');
  });
});

/* ----------------- and it reaches the screen on the push ------------------ */
describe('the thread reads on the push, not only on the timer', () => {
  it('subscribes to the change the supervisor already fires', () => {
    // The supervisor fires its hook on every stdout line and main/ipc.mjs
    // coalesces those to one `zero:changed` every 400ms. Hanging the read off
    // it is the difference between a line appearing when it happens and
    // appearing up to eight seconds later.
    const src = read('renderer/src/components/ItemThread.tsx');
    expect(src).toMatch(/const off = api\.onChanged\(read\)/);
    expect(src).toMatch(/off\(\);/);
  });

  it('still keeps the timer, for the traces no push covers', () => {
    const src = read('renderer/src/components/ItemThread.tsx');
    expect(src).toMatch(/setInterval\(read, REFRESH_MS\)/);
  });

  it('hands the live block to the thread builder', () => {
    const src = read('renderer/src/components/ItemThread.tsx');
    // `engine` joined `whole` in the bag on 2026-09-05, so that a `blocked` row
    // after one of Claude Code's eight commands can be called an answer on the
    // engine that really ran it and nothing else on the other. It rides beside
    // the live block rather than displacing it, which is what this pins.
    //
    // `pending` joined them on 2026-09-21 and rides the same way: her own
    // message, from the moment she sends it, is another thing that belongs in
    // this conversation and must not displace the live block. So the bag is
    // open at its end and the two names this test is about are still pinned
    // where they were.
    expect(src).toMatch(/itemThread\(ledger\.lines, sessions, saying, \{ whole, engine[,}]/);
  });
});

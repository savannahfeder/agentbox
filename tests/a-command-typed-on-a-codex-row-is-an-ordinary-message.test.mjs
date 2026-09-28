// SHE WAITED ON THE ROW FOR A TABLE CODEX WAS NEVER GOING TO PRINT.
//
// THE MAIN PROCESS IS RIGHT AND THE RENDERER IS NOT, which is the whole of this
// file. `main/supervisor.mjs` guards the eight commands on the engine in two
// places, in the same words both times:
//
// const command = continuation && engine === DEFAULT_ENGINE ?
// commandPrompt(item.answer): null; command: continuation &&
// !!commandPrompt(item.answer) && this._engineFor(item) === DEFAULT_ENGINE,
//
// So on a Codex row `/usage` is NOT a command. It stays in her prompt, the
// brief is not thrown away, and an ordinary turn runs -- which is correct, and
// is exactly why the two renderer rules below are wrong.
//
// TWO SURFACES ASKED `commandPrompt` WITH NO ENGINE IN THE QUESTION, and the
// menu that would have stopped her typing one is drawn empty on that row
// (renderer/src/slash-menu.ts), so the only way to reach either is by hand --
// which is the case a gate on the menu cannot cover and the reason main has its
// own half.
//
// `staysOnTheTask` (renderer/src/stay-with-a-command.ts). Typing `/usage` by
// hand on a Codex row set `following`, and `following` changes where Escape and
// the back arrow leave her: her INBOX instead of In progress.
//
// `threadEvents` (renderer/src/thread-history.ts). On a Codex row `blocked`
// means what it has always meant -- the agent stopped and asked her something
// -- so the thread told her she had an answer on a row that was waiting for
// her. That is the same class as the mode: the screen saying a thing happened
// when it did not.
//
// THE ENGINE IS NOT RE-DERIVED IN EITHER. Both take the word the pane was
// already handed on the snapshot (`byItem[id] ?? workspace`, App.tsx), which is
// the same word the supervisor spawns on. A second opinion about which engine a
// row runs on is a second opinion that can disagree with the running fleet.
//
// AND ABSENT MEANS CLAUDE CODE, because that is what `runningEngine` is on every
// Mac with one coding agent and on every payload written before `engines` was on
// the snapshot at all. The identity block at the foot of this file is the proof
// that nothing on such a Mac moved.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { staysOnTheTask } from '../renderer/src/stay-with-a-command';
import { threadEvents } from '../renderer/src/thread-history';
import { itemThread } from '../renderer/src/item-thread';
import { commandPrompt, CLAUDE_COMMANDS } from '../shared/claude-commands.mjs';
import { DEFAULT_ENGINE } from '../shared/engines.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const row = { product: 'agentbox', id: 'w-1', status: 'blocked' };

/*
 * Every word a Mac with one coding agent can hand down for `runningEngine`:
   main answers `claude` for every row on it, and an older snapshot with no
   `engines` key at all reaches the pane as null. */
const ONE_ENGINE = [undefined, null, DEFAULT_ENGINE];

describe('staying on the row a command runs on', () => {
  it('still stays on every one of the eight, on the engine that has them', () => {
    for (const engine of ONE_ENGINE) {
      for (const cmd of CLAUDE_COMMANDS) {
        expect(staysOnTheTask(row, `/${cmd.name}`, engine), `${cmd.name} / ${String(engine)}`).toBe(true);
      }
    }
  });

  it('does not stay on a Codex row, because nothing is coming back', () => {
    for (const cmd of CLAUDE_COMMANDS) {
      expect(staysOnTheTask(row, `/${cmd.name}`, 'codex'), cmd.name).toBe(false);
    }
    // With an argument too, which is the shape half of the eight take.
    expect(staysOnTheTask(row, '/goal ship the landing page', 'codex')).toBe(false);
    expect(staysOnTheTask(row, '/goal ship the landing page', DEFAULT_ENGINE)).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH, both ways round. An ordinary reply never
  // stayed on either engine, so "false on Codex" is not proof of the gate; and
  // an unknown engine word is not a licence to stay either.
  it('leaves an ordinary reply advancing her, on both engines', () => {
    for (const engine of [...ONE_ENGINE, 'codex']) {
      expect(staysOnTheTask(row, 'merge it', engine), String(engine)).toBe(false);
      expect(staysOnTheTask(row, 'look in reports/w-5d1ad29efa/usage.html', engine), String(engine)).toBe(false);
    }
  });

  it('treats a word that is not an engine as not Claude Code', () => {
    // The safe answer is the one that has to be the accident: a word nothing
    // recognises must not buy the front of the queue's screen behaviour.
    expect(staysOnTheTask(row, '/usage', 'nonsense')).toBe(false);
  });

  it('still refuses an agent row on either engine, which was already the rule', () => {
    expect(staysOnTheTask({ ...row, agent: { pid: 42 } }, '/usage', DEFAULT_ENGINE)).toBe(false);
    expect(staysOnTheTask({ ...row, agent: { pid: 42 } }, '/usage', 'codex')).toBe(false);
  });

  it('is asked with the row\'s own engine by the one caller there is', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/const stay = staysOnTheTask\(item, text, engine\)/);
    // Handed in rather than read off the item: `item.engine` is what she MARKED
    // and may be an August row the gate refuses, while `runningEngine` is what
    // will really pick it up.
    expect(app).toContain('answerWith(focused, text, priority, sent, mode, runningEngine, pick)');
    expect(app.match(/staysOnTheTask\(/g)).toHaveLength(1);
  });
});

describe('what the thread calls a blocked row after a slash command', () => {
  const lineFor = (answer, engine) => threadEvents([
    { ts: 1000, source: 'agent', patch: { title: 'A row', body: 'Say merge it.' } },
    { ts: 2000, source: 'founder', patch: { answer } },
    { ts: 3000, source: 'agent', patch: { result: 'Current session: 14% used' } },
    { ts: 4000, source: 'system', patch: { status: 'blocked' } },
  ], engine).at(-1).said;

  it('says it answered you on the engine that really ran the command', () => {
    for (const engine of ONE_ENGINE) {
      expect(lineFor('/usage', engine), String(engine)).toBe('It answered you');
      expect(lineFor('/context', engine), String(engine)).toBe('It answered you');
    }
  });

  it('says it stopped and asked you on a Codex row, which is what happened', () => {
    // Codex knows none of the eight. `/usage` reached it as her message, the
    // brief rode with it, and the row came back blocked for the ordinary
    // reason: it has something to ask her.
    expect(lineFor('/usage', 'codex')).toBe('It stopped and asked you');
    expect(lineFor('/context', 'codex')).toBe('It stopped and asked you');
  });

  it('leaves every other blocked row saying exactly what it said, on both', () => {
    for (const engine of [...ONE_ENGINE, 'codex']) {
      expect(lineFor('Yes, merge it.', engine), String(engine)).toBe('It stopped and asked you');
      expect(lineFor('/deploy the thing', engine), String(engine)).toBe('It stopped and asked you');
    }
  });

  // AND NOTHING ELSE IN THE THREAD MOVED. The engine reaches exactly one
  // sentence; a row's whole history on Codex is otherwise the history it was.
  it('changes that one line and no other', () => {
    const lines = [
      { ts: 1000, source: 'founder', patch: { title: 'A row', body: 'Do the thing' } },
      { ts: 2000, source: 'agent', claim: { holder: 's-1', leaseUntil: 3000 } },
      { ts: 3000, source: 'agent', patch: { note: 'Halfway.' } },
      { ts: 4000, source: 'founder', patch: { answer: '/usage' } },
      { ts: 5000, source: 'agent', patch: { result: 'Current session: 14% used' } },
      { ts: 6000, source: 'system', patch: { status: 'blocked' } },
    ];
    const claude = threadEvents(lines, DEFAULT_ENGINE).map((e) => e.said);
    const codex = threadEvents(lines, 'codex').map((e) => e.said);
    expect(claude.slice(0, -1)).toEqual(codex.slice(0, -1));
    expect(claude.at(-1)).toBe('It answered you');
    expect(codex.at(-1)).toBe('It stopped and asked you');
  });

  it('is asked with the row\'s own engine all the way down from the pane', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    const thread = read('renderer/src/components/ItemThread.tsx');
    const built = read('renderer/src/item-thread.ts');
    // Focus already holds the word for the byline and for the composer; the
    // conversation is the third surface on the same row that needs it.
    expect(focus).toContain('engine={runningEngine}');
    // The bag is open at its end since put her in-flight message in it; what
    // this pins is that the engine is still handed down with it.
    expect(thread).toMatch(/itemThread\(ledger\.lines, sessions, saying, \{ whole, engine[,}]/);
    expect(built).toContain('threadEvents(lines, opts.engine)');
  });
});

/*
 * THE OPTION RIDES THROUGH `itemThread` WITHOUT DISTURBING IT, which is worth
   a case of its own: it is passed in an options bag several tests already build
   by hand, and a bag that changes shape under them is how a whole screen goes
   quiet. */
describe('the conversation the pane really builds', () => {
  const lines = [
    { ts: 1000, source: 'founder', patch: { title: 'A row', body: 'Do the thing' } },
    { ts: 2000, source: 'founder', patch: { answer: '/usage' } },
    { ts: 3000, source: 'agent', patch: { result: 'Current session: 14% used' } },
    { ts: 4000, source: 'system', patch: { status: 'blocked' } },
  ];

  it('is unchanged when nobody names an engine', () => {
    expect(itemThread(lines, [], null, {})).toEqual(itemThread(lines, []));
    expect(itemThread(lines, [], null, { engine: DEFAULT_ENGINE })).toEqual(itemThread(lines, []));
  });

  it('carries the word down to the sentence on a Codex row', () => {
    const said = (opts) => itemThread(lines, [], null, opts).events.map((e) => e.text ?? e.verb);
    expect(said({ engine: 'codex' })).not.toEqual(said({ engine: DEFAULT_ENGINE }));
  });

  it('leaves `whole` doing exactly what it did beside it', () => {
    expect(itemThread(lines, [], null, { whole: true, engine: DEFAULT_ENGINE }))
      .toEqual(itemThread(lines, [], null, { whole: true }));
  });
});

/*
 * A MAC WITH ONE CODING AGENT IS EXACTLY WHERE IT WAS.
 *
 * The rules as they were on 2026-09-04, written out rather than paraphrased,
 * and compared against the rules as they are over every input such a Mac can
 * produce. Same technique, and the same reason, as
 * tests/a-mac-with-one-coding-agent-is-exactly-where-it-was.test.mjs: a test
 * that only asserted the new answers would be re-stating the new code. */
describe('a Mac with one coding agent is exactly where it was', () => {
  const wasStaying = (item, text) => {
    if (!item || item.agent) return false;
    return commandPrompt(text) !== null;
  };

  const TEXTS = [
    ...CLAUDE_COMMANDS.map((c) => `/${c.name}`),
    '/goal ship the landing page',
    '/compact keep the\nbits about the parser',
    '/plan', '/clear', '/theme', '/modelling is fun',
    ' /context', 'merge it', '', 'look at src/model for the fix',
  ];
  const ITEMS = [row, { ...row, agent: { pid: 42 } }, null];

  it('answers what it used to for every reply on every row', () => {
    for (const engine of ONE_ENGINE) {
      for (const item of ITEMS) {
        for (const text of TEXTS) {
          expect(staysOnTheTask(item, text, engine), `${String(engine)} / ${JSON.stringify(text)}`)
            .toBe(wasStaying(item, text));
        }
      }
    }
  });

  it('and the fixtures really do cover both answers, so agreement means something', () => {
    const answers = new Set(TEXTS.map((t) => wasStaying(row, t)));
    expect(answers).toEqual(new Set([true, false]));
  });

  // The blocked sentence as the old code chose it: on `commandPrompt` alone,
  // with no engine in the question. It is the whole of what changed here.
  //
  // ON THE TRIMMED REPLY, because that is what the old code was asking. That
  // is pre-existing, it is the same on both engines, and modelling it any
  // other way here would make this file assert a change it is not making.
  const wasSaid = (text) => (commandPrompt(text.trim()) !== null ? 'It answered you' : 'It stopped and asked you');

  it('says what it used to about every reply on such a Mac', () => {
    const ledger = (answer) => [
      { ts: 1000, source: 'agent', patch: { title: 'A row', body: 'Say merge it.' } },
      { ts: 2000, source: 'founder', patch: { answer } },
      { ts: 3000, source: 'agent', patch: { result: 'Current session: 14% used' } },
      { ts: 4000, source: 'system', patch: { status: 'blocked' } },
    ];
    for (const engine of ONE_ENGINE) {
      for (const text of TEXTS.filter(Boolean)) {
        expect(threadEvents(ledger(text), engine).at(-1).said, `${String(engine)} / ${text}`)
          .toBe(wasSaid(text));
      }
    }
  });

  it('and those fixtures really do produce both sentences', () => {
    expect(new Set(TEXTS.filter(Boolean).map(wasSaid)))
      .toEqual(new Set(['It answered you', 'It stopped and asked you']));
  });
});

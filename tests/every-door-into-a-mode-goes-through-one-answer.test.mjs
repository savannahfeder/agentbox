// EVERY DOOR INTO A MODE GOES THROUGH ONE ANSWER.
//
// This file was `a-permission-mode-cannot-be-set-on-a-codex-row.test.mjs`. Its
// finding, 2026-09-05, was real and is worth keeping in view: the menu had been
// gated on the engine but TWO OTHER KEYS REACHED THE SAME STATE and neither was
// brought along.
//
//   SHIFT+TAB. `if (e.key === 'Tab' && e.shiftKey && canSetMode)` cycled the
//   modes and raised the toast, on any row at all.
//
//   TYPING IT STRAIGHT THROUGH. `changeText` turned `/plan `, `/auto ` and
//   `/clear ` into a mode pick -- WHICH ALSO SWALLOWED THE TEXT: `pickMode`
//   returns without calling `setText`, so the characters she typed left the box
//   and no message was sent.
//
// So a mode could be set on a row that would never read it, and it LOOKED like
// it stuck: `answerMode` rides the reply into the ledger and the composer
// re-seeds from it, while the run cleared the one-off and never read it.
//
// WHAT CHANGED ON 2026-09-23: Codex has three modes of its own, they reach
// `thread/start`, and the keys should work on that engine too. So the answer
// to "may this row set a mode" is no longer "is it Claude Code" but "is it one
// of ours at all" -- an external agent row still cannot, because that value
// really is thrown away by the send.
//
// THE INVARIANT SURVIVES THE REVERSAL AND IS THE POINT OF THIS FILE: there is
// exactly ONE expression deciding it, every door is behind that one expression,
// and the toast that says a mode out loud has one definition and two callers. A
// third caller is how the keys and the menu come apart again.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ENGINE } from '../shared/engines.mjs';
import { MODE_CYCLE, MODE_ORDER, nextMode, exactMode, exactClear } from '../renderer/src/modes.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const focus = fs.readFileSync(path.join(root, 'renderer/src/components/Focus.tsx'), 'utf8');

/* The composer, sliced out of the file, so a match cannot come from the pane
   above it. Every assertion below is about `DockComposer` and nothing else. */
const composer = focus.slice(focus.indexOf('function DockComposer('));

/* WHERE THAT WORD COMES FROM, AND IT IS THE WHOLE SLICE RESTING ON ONE LINE.
 *
 * `runningEngine` decides the composer's keys, the conversation's blocked
 * sentence, whether a slash command keeps her on the row, and what the byline
 * names. Until 2026-09-05 it was an expression inside the pane's props and
 * NOTHING ASSERTED IT: replacing it with `null` left the whole suite green,
 * measured by doing exactly that, while every gate in this file silently
 * reverted to "always Claude Code" and the byline stopped naming the engine.
 *
 * So it is derived once at the top of the component -- three surfaces need it
 * and one of them is a callback -- and the line is lifted out of the source and
 * RUN here, rather than matched as text. The same technique
 * tests/her-claude-plan-does-not-throttle-codex.test.mjs uses on the plan
 * sentence, for the same reason: a `toContain` passes on an expression nothing
 * reaches. */
describe('which engine the pane says the open row is on', () => {
  const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
  const derivation = (() => {
    const at = app.indexOf('const runningEngine = ');
    const end = app.indexOf('\n', at);
    expect(at).toBeGreaterThan(-1);
    return app.slice(at, end);
  })();
  // eslint-disable-next-line no-new-func
  const engineOf = (snap, focused) =>
    new Function('snap', 'focused', `${derivation}\nreturn runningEngine;`)(snap, focused);

  const row = { id: 'w-1', product: 'agentbox' };

  it('is derived in exactly one place', () => {
    expect(app.match(/const runningEngine = /g)).toHaveLength(1);
    // And read, not re-derived, at each of the places that need it.
    expect(app).toContain('runningEngine={runningEngine}');
    expect(app).toContain('answerWith(focused, text, priority, sent, mode, runningEngine, pick)');
  });

  // A MAC WITH ONE CODING AGENT, which is every copy of Agentbox until she writes
  // the moment into zero.config.json.
  it('says Claude Code for every row where main offers one engine', () => {
    const snap = { engines: { choices: [{ id: 'claude' }], workspace: DEFAULT_ENGINE, byItem: {} } };
    expect(engineOf(snap, row)).toBe(DEFAULT_ENGINE);
  });

  // AND ON A PAYLOAD FROM BEFORE `engines` EXISTED AT ALL, which a renderer left
  // open across an update really does see. Null, which reads as Claude Code
  // everywhere it is used.
  it('says nothing at all where the snapshot has no engines on it', () => {
    expect(engineOf({}, row)).toBe(null);
    expect(engineOf({ engines: { choices: [], workspace: undefined, byItem: {} } }, row)).toBe(null);
  });

  it('falls back to the workspace for a row that names no engine of its own', () => {
    const snap = { engines: { choices: [{ id: 'claude' }, { id: 'codex' }], workspace: 'codex', byItem: {} } };
    expect(engineOf(snap, row)).toBe('codex');
  });

  // `byItem` names ONLY the rows whose engine differs from the workspace, so the
  // row's own word has to win. Getting this the other way round is a screen that
  // is right about the workspace and wrong about the row she is reading.
  it('lets the row it names beat the workspace', () => {
    const snap = { engines: { choices: [{ id: 'claude' }, { id: 'codex' }], workspace: 'codex', byItem: { 'w-1': 'claude' } } };
    expect(engineOf(snap, row)).toBe(DEFAULT_ENGINE);
    expect(engineOf(snap, { id: 'w-2', product: 'agentbox' })).toBe('codex');
  });

  // The case that must not match: nothing is open, so there is no row to be on.
  it('says nothing when no task is open', () => {
    const snap = { engines: { choices: [], workspace: 'codex', byItem: { 'w-1': 'codex' } } };
    expect(engineOf(snap, null)).toBe(null);
  });
});

describe('the composer asks which engine the row runs on, once', () => {
  it('derives it in exactly one place', () => {
    // ONE expression. Two would be the defect this file is about, one layer
    // along: the menu asked and the keys did not.
    expect(composer).toContain('const claudeCode = (runningEngine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE;');
    expect(composer.match(/const claudeCode = /g)).toHaveLength(1);
    expect(composer.match(/const canSetMode = /g)).toHaveLength(1);
  });

  it('reads that one answer from the mode rule and from the menu alike', () => {
    expect(composer).toContain('const canSetMode = !item.agent;');
    expect(composer).toContain('const menuRows = slashRows(query, mode !== null, claudeCode, nativeNames);');
  });

  // THE LINE AS IT WAS, BY NAME, so this cannot go green against the old file.
  it('decides it on the agent row alone, and on nothing else', () => {
    // The engine is deliberately NOT in it any more: both of ours can set a
    // mode, and an external agent row is the only kind that cannot.
    expect(focus).not.toContain('const canSetMode = !item.agent && claudeCode;');
  });
});

describe('every door into a permission mode goes through that one answer', () => {
  // Claude Code's own key. Their docs: "press Shift+Tab to cycle permission
  // modes". It is checked before the menu because it works whether the menu is
  // open or shut, which is exactly why gating the menu did not gate this.
  it('gates Shift+Tab', () => {
    expect(composer).toContain("if (e.key === 'Tab' && e.shiftKey && canSetMode) {");
  });

  // The typed-through path, and the one that swallows her words.
  it('gates the mode words typed straight through', () => {
    expect(composer).toContain(
      "const q = canSetMode && next.startsWith('/') && next.endsWith(' ') ? next.slice(1, -1).toLowerCase() : null;",
    );
    // `/clear ` hangs off the same `q`, so it is closed by the same line rather
    // than by a second guard that could be taught separately.
    expect(composer).toContain('if (mode !== null && exactClear(q)) { pickMode(null); return; }');
  });

  // And the menu's own query, which was already gated by `slashRows` and is now
  // gated twice, on purpose: `query` feeds nothing else, but a null query means
  // the menu cannot open even if somebody widens `slashRows` later.
  it('keeps external agent queries gated while allowing Codex commands', () => {
    expect(composer).toContain('const query = !item.agent ? slashQuery(text) : null;');
  });
});

describe("Claude Code's status line is not printed over a Codex row", () => {
  /* THE TOAST IS INSEPARABLE FROM THE KEYS, and this is why it needs no guard
     of its own: `announce` is the only thing that says MODE_STATUS out loud,
     and it is reachable from exactly two places, both of which are now behind
     `canSetMode`. A third caller is what would break that, so the count is the
     test. */
  it('says a mode out loud in one place only', () => {
    expect(composer.match(/const announce = /g)).toHaveLength(1);
    expect(composer.match(/\bannounce\(/g)).toHaveLength(2);
  });

  it('has both of those callers behind the mode rule', () => {
    // The slash pick, which cannot happen on a Codex row because the menu is
    // empty and therefore never drawn.
    expect(composer).toMatch(/const pickMode = \(m: PermissionMode \| CodexModeId \| null\) => \{\s*setMode\(m\);\s*announce\(m\);/);
    // And Shift+Tab, which is guarded above.
    expect(composer).toMatch(/const next = claudeCode \? nextMode\(running as PermissionMode\) : nextCodexMode\(running as CodexModeId\);\s*setMode\(next\);[\s\S]{0,400}?announce\(next\);/);
    // `pickMode` itself is CALLED from four places, and every one of them is
    // behind `canSetMode`: the menu row, an exact mode word typed through,
    // `/clear` typed through, and the word in the reply sentence, which is
    // drawn inside `{canSetMode && ...}`. A fifth caller is what would open a
    // door this file has not looked at.
    expect(composer.match(/pickMode\(/g)).toHaveLength(4);
    // And the sentence's word really is gated, rather than merely looking it.
    expect(composer).toMatch(/\{canSetMode && \([\s\S]{0,900}?<ModePicker/);
  });

  it('reads either engine\'s status table in one place only', () => {
    // The two tables used to be read inside `announce` itself. With a second
    // engine they are read by `statusOf`, which is the one expression that
    // knows which vocabulary this row speaks, and `announce` asks it. So the
    // locality claim moves one function along rather than going away: each
    // table is read exactly once, and both readings are inside `statusOf`.
    const from = composer.indexOf('const statusOf = ');
    const to = composer.indexOf('const announce = ');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const inside = composer.slice(from, to);
    expect(inside.match(/\bMODE_STATUS\[/g) ?? []).toHaveLength(1);
    expect(inside.match(/CODEX_MODE_STATUS\[/g) ?? []).toHaveLength(1);
    expect(composer.match(/\bMODE_STATUS\[/g) ?? []).toHaveLength(1);
    expect(composer.match(/CODEX_MODE_STATUS\[/g) ?? []).toHaveLength(1);
  });

  it('says a mode out loud only through that one resolver', () => {
    // `statusOf` is called twice, both times by `announce`: once for a mode she
    // picked and once for the way back. A third call is a second place naming
    // a mode, which is how the two engines' words come apart on one screen.
    // Two: once for a mode she picked, once for the way back. The definition
    // itself is `const statusOf = (m: ...) =>` and carries no call.
    expect(composer.match(/statusOf\(/g)).toHaveLength(2);
  });
});

/* THE CASE THAT MUST NOT MATCH, AND IT IS THE ROW SHE HAS ALWAYS HAD.
 *
 * Everything above is a gate, and a gate is only worth pinning if the thing it
 * gates still happens on the other side of it. A Mac with one coding agent has
 * `runningEngine` of `claude` or of nothing at all, and the composer must be
 * byte-identical to what it was. */
describe('a Mac with one coding agent is exactly where it was', () => {
  // The rule as it was on 2026-09-04, written out rather than paraphrased, and
  // the rule as it is now, and the two compared over every input such a Mac can
  // produce. Same technique as
  // tests/a-mac-with-one-coding-agent-is-exactly-where-it-was.test.mjs.
  const was = (item) => !item.agent;
  const now = (item, runningEngine) => !item.agent && (runningEngine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE;

  // `runningEngine` is `byItem[id] ?? workspace ?? null` (App.tsx). On a Mac
  // with one coding agent main answers `claude` for every row, and on an older
  // payload with no `engines` at all it answers null.
  const ONE_ENGINE = [null, undefined, DEFAULT_ENGINE];
  const ROWS = [{}, { agent: null }, { agent: { name: 'Claude Code', pid: 42 } }];

  it('answers exactly what it used to for every row on such a Mac', () => {
    for (const engine of ONE_ENGINE) {
      for (const item of ROWS) {
        expect(now(item, engine), `${String(engine)} / ${JSON.stringify(item)}`).toBe(was(item));
      }
    }
  });

  it('leaves Shift+Tab cycling all four modes there, as it always did', () => {
    expect(MODE_CYCLE).toEqual(['default', 'acceptEdits', 'plan', 'auto']);
    let m = 'default';
    const walked = [];
    for (let i = 0; i < MODE_CYCLE.length; i += 1) { m = nextMode(m); walked.push(m); }
    expect(walked).toEqual(['acceptEdits', 'plan', 'auto', 'default']);
  });

  it('leaves the words she types straight through working there', () => {
    expect(exactMode('plan')).toBe('plan');
    expect(exactMode('bypasspermissions')).toBe('bypassPermissions');
    expect(exactMode('yolo')).toBe('bypassPermissions');
    expect(exactClear('clear')).toBe(true);
  });

  // AND THE BOUNDARY THE OTHER SIDE: the row that really is on the second
  // engine is the only thing this takes anything away from.
  it('takes the whole of it away on a Codex row and on nothing else', () => {
    expect(now({}, 'codex')).toBe(false);
    expect(now({}, DEFAULT_ENGINE)).toBe(true);
    // An agent row is refused on either engine, which is the rule that was
    // already here and must survive untouched.
    expect(now({ agent: { pid: 42 } }, DEFAULT_ENGINE)).toBe(false);
    expect(now({ agent: { pid: 42 } }, 'codex')).toBe(false);
  });

  /* And nothing was invented to stand in for the six on the other engine.
     NAMED IN A COMMENT AND NOWHERE ELSE, which is the distinction this makes:
     the posture is exactly what the note above `canSetMode` has to state -- a
     rule whose measurement is not written down is deleted by whoever next finds
     it inconvenient -- and it is the one thing that must never become a word on
     the screen or a value in a control. So the check is where the words are, not
     whether they occur. */
  it('draws no Codex permission control anywhere in the composer', () => {
    expect(MODE_ORDER).toHaveLength(6);
    for (const word of ['untrusted', 'on-request', 'workspace-write', 'approvalPolicy', 'sandbox']) {
      const live = composer
        .split('\n')
        .filter((l) => l.toLowerCase().includes(word.toLowerCase()))
        .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
      expect(live, word).toEqual([]);
    }
    // And the posture IS named, in the comment, with what it costs. A gate whose
    // reason is not written down is a gate somebody undoes.
    expect(composer).toContain('`untrusted`');
    expect(composer).toContain('`workspace-write`');
  });
});

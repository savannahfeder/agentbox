// A CODEX CARD BELONGS TO THE WORKER THAT RAISED IT, AND SHE READS ALL OF IT.
//
// Three things an adversarial pass found in the card path, all of which show up
// on her screen rather than in a log.
//
// 1. A CARD OUTLIVED ITS WORKER BY FIFTEEN MINUTES AND SAT IN FRONT OF EVERY
//    REAL ONE.
//
//    Every Codex worker on the Mac raised its cards into one fleet-wide map
//    with nothing per-worker in it, so killing a worker ended its facade and
//    interrupted its turn and did NOT deny or remove its card. Stop a run,
//    preempt one for an urgent row, archive a row, lose the app-server -- each
//    of those leaves a live-looking question on screen about a command nothing
//    is waiting to run any more.
//
// And it does not merely sit there: `listPending` sorts oldest first and both
// ⌘Y/⌘N and the menu act on `listPending[0]`, so the DEAD card is the one in
// front of every real card until its deadline. She answers it, and the answer
// goes to a worker that stopped ten minutes ago while the card she meant to
// answer is still behind it.
//
// 2. THE CARD TRUNCATED THE COMMAND AND THE APPROVAL COVERED ALL OF IT.
//
//    `renderer/src/App.tsx` sliced the command to 400 characters with no mark,
//    and nothing capped it at the source. So she read 400 characters and
//    authorised however many there were. This matters more on Codex than
//    anywhere else in the app: Codex reads, searches and edits BY RUNNING SHELL
//    COMMANDS, so a long command is the normal case rather than the odd one,
//    and the command is the whole of what the card is asking about.
//
//    The display boundary and the enforcement boundary must not differ. They
//    do not now: the card carries the whole command, the `<pre>` it is drawn in
//    already scrolls (max-height 120px, overflow-y auto), and the one cap left
//    is at the source and SAYS how much it dropped.
//
// 3. AND THE CARD SAID WHAT WOULD RUN WITHOUT SAYING WHERE. `cat auth.json`
//    reads very differently in a scratch clone and in her home directory.
//    `CommandExecutionRequestApprovalParams` has carried `cwd` the whole time
//    ("The command's working directory", read out of the CLI's own
//    `generate-json-schema` dump on 2026-09-04); nothing was reading it.
//
// PLUS THE REFUSAL NOBODY COULD SEE. An approval Agentbox cannot describe is
// always refused, correctly -- a card she answers blind is the 2026-08-05 flood
// again -- but the only signal was a `console.warn` that reaches no screen, no
// row and no trace. It goes to the worker's own stderr now, which is what
// `troubleCause` classifies and what the persisted trace records.
//
// WHAT COUNTS AS UNDESCRIBABLE HAS SINCE NARROWED, and this file's own
// measurement is what made it urgent: under `approvalPolicy: "untrusted"` an
// in-workspace patch RAISES `item/fileChange/requestApproval`, so refusing that
// shape was a Codex worker that could not write a file at all. It is carded now
// -- the `item/started` for the same itemId goes past first carrying the paths
// and the diff, and main/codex-approvals.mjs draws the card off that. The
// approval policy did not move and must not:
// tests/a-codex-file-change-reaches-her-as-something-she-can-read.test.mjs is
// where that whole path is pinned.
//
// What is still refused here is what is still undescribable: an
// `item/permissions/requestApproval`, which is answered with a granted profile
// rather than a decision, and a `fileChange` naming a change this worker never
// saw. What this file pins is that when either happens she can SEE it.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { createCodexApprovals, codexApprovalCard, CARD_CAP } from '../main/codex-approvals.mjs';
import { spoolDir, listPending } from '../main/approvals.mjs';
import { REFUSAL_DECISION } from '../main/codex-app-server.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

const dirs = [];
const root = () => { const d = mkdtempSync(join(tmpdir(), 'zero-cards-')); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const commandAsk = (command, extra = {}) => ['item/commandExecution/requestApproval', { threadId: 'T', turnId: 'U', itemId: 'I', command, ...extra }];

/* ======================= what the card actually says ===================== */

describe('the card one gated command is drawn as', () => {
  it('carries the whole command when it is an ordinary one', () => {
    const card = codexApprovalCard(...commandAsk('sed -n "1,200p" main/supervisor.mjs'));
    expect(card.input.command).toBe('sed -n "1,200p" main/supervisor.mjs');
  });

  // THE BUG. Anything over the renderer's silent 400 was authorised unread.
  it('caps a very long command at the source, and says how much is missing', () => {
    // Trimmed first, the way any command off the wire is, so the count in the
    // mark is the count of what was really dropped.
    const long = `git log ${'--author=someone '.repeat(400)}`.trim();
    const card = codexApprovalCard(...commandAsk(long));
    expect(card.input.command.length).toBeLessThan(long.length);
    expect(card.input.command).toContain(`+${long.length - CARD_CAP} characters`);
    expect(card.input.command.startsWith(long.slice(0, 200))).toBe(true);
  });

  // THE BOUNDARY EITHER SIDE of the cap, on the number rather than near it.
  it('leaves a command of exactly the cap alone and marks one character more', () => {
    const exact = 'x'.repeat(CARD_CAP);
    expect(codexApprovalCard(...commandAsk(exact)).input.command).toBe(exact);
    const over = 'x'.repeat(CARD_CAP + 1);
    expect(codexApprovalCard(...commandAsk(over)).input.command).toContain('+1 character');
  });

  it('says where the command would run, because that is half of what it means', () => {
    const card = codexApprovalCard(...commandAsk('cat auth.json', { cwd: '/Users/her/.codex' }));
    expect(card.input.cwd).toBe('/Users/her/.codex');
  });

  // THE CASE THAT MUST NOT MATCH: no cwd in the params is no cwd on the card,
  // never the word "undefined" drawn under a command.
  it('leaves the folder off when the server did not say one', () => {
    const card = codexApprovalCard(...commandAsk('ls'));
    expect('cwd' in card.input).toBe(false);
  });

  // A `fileChange` is drawn from the item that went past before it, never from
  // the approval's own params, so with no memory behind it there is still
  // nothing to draw and the refusal stands.
  it('still refuses to draw anything for a shape that carries no command', () => {
    expect(codexApprovalCard('item/fileChange/requestApproval', { threadId: 'T', itemId: 'I' })).toBe(null);
    expect(codexApprovalCard('item/permissions/requestApproval', { threadId: 'T' })).toBe(null);
    expect(codexApprovalCard(...commandAsk(''))).toBe(null);
  });
});

/* ============ the renderer draws what the card actually holds ============ */

describe('what her screen does with it', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');

  it('never slices the command a second time behind the cap', () => {
    const at = app.indexOf('approval-cmd');
    expect(at).toBeGreaterThan(-1);
    expect(app.slice(at, at + 400)).not.toMatch(/slice\(0,\s*400\)/);
  });

  it('scrolls a long one rather than clipping it', () => {
    const at = css.indexOf('.approval-cmd {');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('}', at));
    expect(block).toMatch(/overflow-y:\s*auto/);
  });

  // The folder is still on the card and is still read off `cwd`. It stopped
  // being a stack of its own on 2026-09-24 (w-34b7b861b6), when she asked for
  // fewer of them: it shares the quiet line at the foot with the chat now, and
  // `.approval-cwd` went with the merge. What this test is for has not changed,
  // so it asks the same question of the markup that actually exists.
  it('draws the folder it would run in', () => {
    expect(app).toMatch(/approval-where/);
    expect(app).toMatch(/cwd \? `in \$\{cwd\}` : null/);
  });
});

/* ================== a card dies with the worker that asked =============== */

describe('one worker own cards', () => {
  let storeRoot; let cards; let n;
  beforeEach(() => {
    storeRoot = root();
    n = 0;
    cards = createCodexApprovals({ storeRoot, uuid: () => `card-${n += 1}`, timeoutMs: 60_000, pollMs: 60_000 });
  });

  const raise = (scope, command) => scope.handle(...commandAsk(command));

  it('are denied and taken off her screen when that worker stops', async () => {
    const one = cards.scope({ product: 'agentbox', item: 'w-one' });
    const answer = raise(one, 'rm -rf build');
    expect(listPending(storeRoot)).toHaveLength(1);

    one.close('the worker that asked has stopped');

    await expect(answer).resolves.toBe(REFUSAL_DECISION);
    expect(listPending(storeRoot)).toHaveLength(0);
    expect(existsSync(join(spoolDir(storeRoot), 'card-1.request.json'))).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH, and it is the whole reason a scope exists: one
  // worker stopping must not answer another worker's question.
  it('leave every other worker card exactly where it was', async () => {
    const one = cards.scope({ product: 'agentbox', item: 'w-one' });
    const two = cards.scope({ product: 'agentbox', item: 'w-two' });
    const first = raise(one, 'rm -rf build');
    const second = raise(two, 'curl https://example.com');
    expect(cards.pending()).toHaveLength(2);

    one.close('stopped');
    await expect(first).resolves.toBe(REFUSAL_DECISION);

    expect(cards.pending()).toEqual(['card-2']);
    expect(listPending(storeRoot).map((r) => r.item)).toEqual(['w-two']);
    // And the survivor is still answerable through the one door.
    expect(cards.settle('card-2', true)).toBe(true);
    await expect(second).resolves.toBe('accept');
  });

  it('are denied once and once only, however many times the scope is closed', async () => {
    const one = cards.scope({ product: 'agentbox', item: 'w-one' });
    const answer = raise(one, 'ls');
    one.close('stopped');
    one.close('stopped again');
    await expect(answer).resolves.toBe(REFUSAL_DECISION);
    expect(cards.pending()).toEqual([]);
  });

  it('cannot be answered by her after the worker that asked has gone', async () => {
    const one = cards.scope({ product: 'agentbox', item: 'w-one' });
    const answer = raise(one, 'ls');
    one.close('stopped');
    await answer;
    expect(cards.settle('card-1', true)).toBe(false);
  });

  // The global close is unchanged: Agentbox going away denies everything.
  it(`all go when ${NAME} itself quits`, async () => {
    const one = cards.scope({ product: 'agentbox', item: 'w-one' });
    const two = cards.scope({ product: 'agentbox', item: 'w-two' });
    const first = raise(one, 'ls');
    const second = raise(two, 'ls');
    cards.close(`${Name} is shutting down`);
    await expect(first).resolves.toBe(REFUSAL_DECISION);
    await expect(second).resolves.toBe(REFUSAL_DECISION);
    expect(cards.pending()).toEqual([]);
  });
});

/* ============== the refusal she could not see anywhere =================== */

describe(`an approval ${NAME} cannot draw a card for`, () => {
  it('is still refused, and now says so on the pipe the run is diagnosed from', async () => {
    const storeRoot = root();
    const said = [];
    const cards = createCodexApprovals({ storeRoot, timeoutMs: 60_000, pollMs: 60_000 });
    const scope = cards.scope({ product: 'agentbox', item: 'w-one', say: (line) => said.push(line) });

    // A patch this worker never saw the item for, which is the one fileChange
    // shape that is still undrawable.
    await expect(scope.handle('item/fileChange/requestApproval', { threadId: 'T', itemId: 'I' })).resolves.toBe(REFUSAL_DECISION);

    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/item\/fileChange\/requestApproval/);
    expect(said[0]).toMatch(/refus/i);
    // Nothing was ever put in front of her for it.
    expect(listPending(storeRoot)).toHaveLength(0);
  });

  it('says it for a permissions request too', async () => {
    const said = [];
    const cards = createCodexApprovals({ storeRoot: root(), timeoutMs: 60_000, pollMs: 60_000 });
    const scope = cards.scope({ product: 'agentbox', item: 'w-one', say: (line) => said.push(line) });
    await scope.handle('item/permissions/requestApproval', { threadId: 'T' });
    expect(said.join('\n')).toMatch(/item\/permissions\/requestApproval/);
  });

  // THE CASE THAT MUST NOT MATCH: an ordinary command approval is a card, not a
  // line on stderr.
  it('says nothing for a command it can draw', async () => {
    const said = [];
    const cards = createCodexApprovals({ storeRoot: root(), uuid: () => 'card-1', timeoutMs: 60_000, pollMs: 60_000 });
    const scope = cards.scope({ product: 'agentbox', item: 'w-one', say: (line) => said.push(line) });
    scope.handle(...commandAsk('ls'));
    expect(said).toEqual([]);
  });
});

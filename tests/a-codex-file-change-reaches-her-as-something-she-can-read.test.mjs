// A CODEX WORKER'S FILE CHANGE REACHES HER AS SOMETHING SHE CAN READ, AND THAT
// IS WHAT LETS A CODEX WORKER WRITE A FILE AT ALL.
//
// Agentbox refused `item/fileChange/requestApproval` outright, and the refusal was
// right for the reason it was written down with: the approval's OWN params carry
// nothing readable. Measured on this Mac 2026-09-04, codex-cli 0.148.0, in full:
//
//   {"threadId":"...","turnId":"...","itemId":"call_eBjH...",
//    "startedAtMs":1788504140524,"reason":null,"grantRoot":null}
//
// No path, no diff, no sentence. A card she answers blind is the 2026-08-05
// flood again, so drawing nothing was correct.
//
// IT WAS ALSO WHY A CODEX WORKER COULD NOT WRITE A SINGLE FILE. Every approval
// policy the CLI offers was measured the same day:
//
//   untrusted (what this app ships)  risky commands CARDED, in-workspace edit
//                                    raises the undrawable fileChange -> refused
//                                    -> nothing written
//   on-request                       commands NOT carded, edit runs
//   granular (any flags)             commands NOT carded, edit runs
//
// So the choice looked like "safe but cannot write" against "writes anything,
// never asks". IT IS NOT, because the card can be drawn honestly after all.
//
// ------------------------------------------------------------------------
// THE MEASUREMENT THIS FILE EXISTS FOR. codex-cli 0.148.0, this Mac,
// 2026-09-04, one turn asked to edit `math.js`, create `notes.txt` and rename
// `oldname.txt`, under `approvalPolicy: "untrusted"` and `sandbox:
// "workspace-write"`. THREE fileChange approvals, and every one of them was
// preceded by an `item/started` for the SAME itemId carrying the real content:
//
//   item/started    fileChange id=call_ylWd... changes=2
//   APPROVAL        item/fileChange/requestApproval itemId=call_ylWd... known=YES
//   item/completed  fileChange id=call_ylWd... changes=2
//   item/started    fileChange id=call_m6Kt... changes=1
//   APPROVAL        item/fileChange/requestApproval itemId=call_m6Kt... known=YES
//   item/completed  fileChange id=call_m6Kt... changes=1
//   item/started    fileChange id=call_Yk9f... changes=2
//   APPROVAL        item/fileChange/requestApproval itemId=call_Yk9f... known=YES
//   item/completed  fileChange id=call_Yk9f... changes=2
//
// Three for three, `item/started` first and `item/completed` only AFTER the
// answer -- which is why the memory is fed from `item/started` and from nothing
// else. The item carries `changes: [{path, kind: {type, move_path}, diff}]`,
// paths absolute, and the `diff` of an `add` is RAW FILE CONTENT rather than a
// unified diff. main/codex.mjs's own header records the same thing.
//
// So: remember the fileChange items as they arrive, and when the approval comes
// draw a card naming the files and showing the change. The refusal stays
// EXACTLY where it was for anything that cannot be described -- an approval
// whose itemId this app never saw is refused, not carded blank, which is the
// case that must not match and the one every test below is built around.
//
// `item/permissions/requestApproval` is still refused and deliberately so: it
// is answered with a granted-permissions profile rather than a decision, and
// there is still nothing honest to put in front of her.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createCodexApprovals, codexApprovalCard, fileChangeCard, CARD_CAP, REMEMBERED_CHANGES,
} from '../main/codex-approvals.mjs';
import { REFUSAL_DECISION } from '../main/codex-app-server.mjs';
import { listPending } from '../main/approvals.mjs';
import { approvalReads, UNREADABLE } from '../renderer/src/approval-card.ts';

const dirs = [];
const root = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-filechange-')); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const REPO = '/Users/her/Zero/accounts/acct/agentbox';

/** One `item/started`, framed exactly as the measured capture frames it. */
const started = (id, changes) => ['item/started', {
  threadId: 'T-1',
  turnId: 'TURN-1',
  item: { type: 'fileChange', id, changes, status: 'inProgress' },
}];

/** The approval, with every field the measured one carried and nothing more. */
const patchAsk = (itemId, extra = {}) => ['item/fileChange/requestApproval', {
  threadId: 'T-1',
  turnId: 'TURN-1',
  itemId,
  startedAtMs: 1_788_504_140_524,
  reason: null,
  grantRoot: null,
  ...extra,
}];

const add = (p, content) => ({ path: p, kind: { type: 'add' }, diff: content });
const del = (p, content) => ({ path: p, kind: { type: 'delete' }, diff: content });
const update = (p, diff) => ({ path: p, kind: { type: 'update', move_path: null }, diff });
const moved = (from, to, diff) => ({ path: from, kind: { type: 'update', move_path: to }, diff });

const UPDATE_DIFF = '@@ -1,3 +1,3 @@\n export function add(a, b) {\n-  return a + b;\n+  return a - b;\n }\n';

/* ===================== what one change is drawn as ======================= */

describe('the card a file change is drawn as', () => {
  it('names the file and shows a unified diff for an update', () => {
    const card = fileChangeCard({ type: 'fileChange', id: 'call_1', changes: [update(`${REPO}/math.js`, UPDATE_DIFF)] });
    expect(card.tool).toBe('Edit');
    expect(card.input.changes).toBe(`Edit ${REPO}/math.js\n${UPDATE_DIFF.trimEnd()}`);
  });

  // A CREATION IS NOT A DIFF. Measured: the `add` entry beside an `update` in
  // one event was the string "hello\n" -- raw file content, no `@@` header.
  it('names the file and shows the raw content for a creation', () => {
    const card = fileChangeCard({ type: 'fileChange', id: 'call_1', changes: [add(`${REPO}/notes.txt`, 'hello\n')] });
    expect(card.tool).toBe('Write');
    expect(card.input.changes).toBe(`Write ${REPO}/notes.txt\nhello`);
  });

  it('names the file and shows what goes for a delete', () => {
    const card = fileChangeCard({ type: 'fileChange', id: 'call_1', changes: [del(`${REPO}/gone.txt`, 'old name\n')] });
    expect(card.tool).toBe('Delete');
    expect(card.input.changes).toBe(`Delete ${REPO}/gone.txt\nold name`);
  });

  // BOTH ENDS OF A MOVE, because the path she would go looking for is the one
  // it is at now and the one beside it is the one it left. `move_path` lives
  // only on the `update` kind (main/codex.mjs, measurement 6).
  it('says both ends of a rename', () => {
    const card = fileChangeCard({ type: 'fileChange', id: 'call_1', changes: [moved(`${REPO}/old.txt`, `${REPO}/new.txt`, '')] });
    expect(card.tool).toBe('Move');
    expect(card.input.changes).toBe(`Move ${REPO}/old.txt -> ${REPO}/new.txt`);
  });

  // The measured turn's first item was exactly this: one apply_patch carrying
  // an add and a delete together. She is being asked about both at once, so
  // both are on the card.
  it('carries every file in one patch, and one word for the lot of them', () => {
    const card = fileChangeCard({
      type: 'fileChange',
      id: 'call_1',
      changes: [add(`${REPO}/newname.txt`, 'old name\n'), del(`${REPO}/oldname.txt`, 'old name\n')],
    });
    expect(card.input.changes).toContain(`Write ${REPO}/newname.txt`);
    expect(card.input.changes).toContain(`Delete ${REPO}/oldname.txt`);
    // Two different verbs in one patch have no single honest word, so the card
    // takes the class word rather than picking one of them.
    expect(card.tool).toBe('Edit');
  });

  // ONE trailing newline is the line terminator and goes; a second one is a
  // blank line the file really has and stays. The measured rename's `add` half
  // arrived as the string "\n" and nothing else, which is a header and no body.
  it('drops the line terminator and keeps a blank line that is really there', () => {
    const body = (diff) => fileChangeCard({ type: 'fileChange', id: 'c', changes: [add('/f', diff)] }).input.changes;
    expect(body('hello\n')).toBe('Write /f\nhello');
    expect(body('hello\n\n')).toBe('Write /f\nhello\n');
    expect(body('\n')).toBe('Write /f');
  });

  // THE CASE THAT MUST NOT MATCH, at the level of one item: an item with
  // nothing describable in it is not a card with an empty body.
  it('is nothing at all when there is no file in it', () => {
    expect(fileChangeCard({ type: 'fileChange', id: 'call_1', changes: [] })).toBe(null);
    expect(fileChangeCard({ type: 'fileChange', id: 'call_1', changes: [{ path: '', kind: { type: 'add' }, diff: 'x' }] })).toBe(null);
    expect(fileChangeCard({ type: 'fileChange', id: 'call_1' })).toBe(null);
    expect(fileChangeCard(null)).toBe(null);
  });
});

/* ========================= the cap, and its mark ========================= */

describe('a change too big to read whole', () => {
  const bodyOf = (diff) => fileChangeCard({ type: 'fileChange', id: 'c', changes: [add('/f', diff)] }).input.changes;

  it('is cut once, at the source, saying exactly how much went', () => {
    const huge = `${'x'.repeat(CARD_CAP * 2)}\n`;
    const body = bodyOf(huge);
    expect(body.length).toBeLessThan(huge.length);
    expect(body).toMatch(/\n\[\+\d+ characters not shown\]$/);
    // The count is the count of what was really dropped from what she is shown.
    const head = 'Write /f\n';
    expect(body).toContain(`+${head.length + CARD_CAP * 2 - CARD_CAP} characters not shown`);
  });

  // THE BOUNDARY EITHER SIDE, on the number rather than near it.
  it('leaves a change of exactly the cap alone and marks one character more', () => {
    const head = 'Write /f\n'.length;
    expect(bodyOf('x'.repeat(CARD_CAP - head))).not.toContain('not shown');
    expect(bodyOf('x'.repeat(CARD_CAP - head + 1))).toContain('+1 character not shown');
  });
});

/* ================== the correlation, which is the point ================== */

describe('an approval joined to the change it is about', () => {
  const seen = (...items) => {
    const map = new Map();
    for (const [id, changes] of items) map.set(id, fileChangeCard({ type: 'fileChange', id, changes }));
    return map;
  };

  it('is a card carrying the real path and the real change', () => {
    const map = seen(['call_A', [update(`${REPO}/math.js`, UPDATE_DIFF)]]);
    const card = codexApprovalCard(...patchAsk('call_A'), map);
    expect(card).toEqual({ tool: 'Edit', input: { changes: `Edit ${REPO}/math.js\n${UPDATE_DIFF.trimEnd()}` } });
  });

  it('carries the reason as the description, on the rare turn that sends one', () => {
    const map = seen(['call_A', [add('/f', 'hi\n')]]);
    const card = codexApprovalCard(...patchAsk('call_A', { reason: 'the file is outside the workspace' }), map);
    expect(card.input.description).toBe('the file is outside the workspace');
  });

  it('answers the right one when a turn has several changes in flight', () => {
    const map = seen(['call_A', [add('/a.txt', 'a\n')]], ['call_B', [add('/b.txt', 'b\n')]]);
    expect(codexApprovalCard(...patchAsk('call_B'), map).input.changes).toBe('Write /b.txt\nb');
  });

  // THE CASE THAT MUST NOT MATCH, AND THE ONE THIS WHOLE FILE IS BUILT AROUND.
  // A card she cannot read is worse than no card, so an approval naming an item
  // this app never saw is refused exactly as it always was.
  it('is refused, not carded blank, when the change was never seen', () => {
    expect(codexApprovalCard(...patchAsk('call_NEVER'), seen(['call_A', [add('/a.txt', 'a\n')]]))).toBe(null);
    expect(codexApprovalCard(...patchAsk('call_A'), new Map())).toBe(null);
    expect(codexApprovalCard(...patchAsk('call_A'))).toBe(null);
    expect(codexApprovalCard(...patchAsk(null), seen(['call_A', [add('/a.txt', 'a\n')]]))).toBe(null);
  });

  // AND THE OTHER SHAPE STAYS REFUSED. `item/permissions/requestApproval` is
  // answered with a granted-permissions profile rather than a decision, and
  // its params still carry nothing that could be put in front of her.
  it('leaves a permissions request refused however much has been seen', () => {
    const map = seen(['call_A', [add('/a.txt', 'a\n')]]);
    expect(codexApprovalCard('item/permissions/requestApproval', { threadId: 'T-1', itemId: 'call_A' }, map)).toBe(null);
  });
});

/* ==================== the memory, per worker and bounded ================= */

describe('what one worker remembers of its own changes', () => {
  const store = () => {
    let n = 0;
    return createCodexApprovals({ storeRoot: root(), uuid: () => `card-${n += 1}`, timeoutMs: 60_000, pollMs: 60_000 });
  };

  it('turns the refusal into a card once the item has gone past', async () => {
    const cards = store();
    const said = [];
    const scope = cards.scope({ product: 'agentbox', item: 'w-1', say: (l) => said.push(l) });

    scope.remember(...started('call_A', [add(`${REPO}/notes.txt`, 'hello\n')]));
    const asked = scope.handle(...patchAsk('call_A'));

    // Nothing on the run's stderr, because nothing was refused.
    expect(said).toEqual([]);
    expect(cards.pending()).toEqual(['card-1']);
    expect(cards.settle('card-1', true)).toBe(true);
    await expect(asked).resolves.toBe('accept');
  });

  it('puts the paths and the change in the spool, where her screen reads them', async () => {
    const storeRoot = root();
    const cards = createCodexApprovals({ storeRoot, uuid: () => 'card-1', now: () => 1234, timeoutMs: 60_000, pollMs: 60_000 });
    const scope = cards.scope({ product: 'agentbox', item: 'w-1' });
    scope.remember(...started('call_A', [add(`${REPO}/notes.txt`, 'hello\n')]));
    scope.handle(...patchAsk('call_A'));

    expect(listPending(storeRoot)).toEqual([{
      id: 'card-1',
      at: 1234,
      product: 'agentbox',
      item: 'w-1',
      tool: 'Write',
      input: { changes: `Write ${REPO}/notes.txt\nhello` },
    }]);
    cards.close('done');
  });

  // THE CASE THAT MUST NOT MATCH: one worker's memory is not another's. Two
  // Codex threads run on ONE app-server, and an itemId is the server's own
  // string; a shared memory would let thread A's change answer thread B's
  // question.
  it('is one worker own, and never answers another worker question', async () => {
    const cards = store();
    const said = [];
    const one = cards.scope({ product: 'agentbox', item: 'w-one' });
    const two = cards.scope({ product: 'agentbox', item: 'w-two', say: (l) => said.push(l) });

    one.remember(...started('call_A', [add('/a.txt', 'a\n')]));

    await expect(two.handle(...patchAsk('call_A'))).resolves.toBe(REFUSAL_DECISION);
    expect(said.join('\n')).toMatch(/item\/fileChange\/requestApproval/);
    expect(cards.pending()).toEqual([]);
    // ...and the worker that DID see it is still answered with a card.
    one.handle(...patchAsk('call_A'));
    expect(cards.pending()).toEqual(['card-1']);
    cards.close('done');
  });

  // A worker that stops takes its memory with it: nothing it saw can card an
  // approval that arrives after its cards have been denied.
  it('is let go when the worker that made it stops', async () => {
    const cards = store();
    const said = [];
    const scope = cards.scope({ product: 'agentbox', item: 'w-1', say: (l) => said.push(l) });
    scope.remember(...started('call_A', [add('/a.txt', 'a\n')]));
    scope.close('the run that asked this has stopped');

    await expect(scope.handle(...patchAsk('call_A'))).resolves.toBe(REFUSAL_DECISION);
    expect(said.join('\n')).toMatch(/refus/i);
  });

  // AND IT IS BOUNDED, because a turn can edit in a loop and each diff can be
  // the whole of a file. Same reasoning as CHANGE_FRAME_CAP in main/codex.mjs,
  // and the boundary is tested either side of the number rather than near it.
  it('keeps the last changes and forgets the oldest rather than growing', async () => {
    const cards = store();
    const said = [];
    const scope = cards.scope({ product: 'agentbox', item: 'w-1', say: (l) => said.push(l) });
    for (let i = 0; i <= REMEMBERED_CHANGES; i += 1) {
      scope.remember(...started(`call_${i}`, [add(`/f${i}.txt`, `${i}\n`)]));
    }

    // One past the cap, so the very first one has been let go and is refused.
    await expect(scope.handle(...patchAsk('call_0'))).resolves.toBe(REFUSAL_DECISION);
    expect(said).toHaveLength(1);

    // The one beside it, and the newest of all, are both still readable.
    scope.handle(...patchAsk('call_1'));
    scope.handle(...patchAsk(`call_${REMEMBERED_CHANGES}`));
    expect(cards.pending()).toEqual(['card-1', 'card-2']);
    cards.close('done');
  });

  // ONLY `item/started` FEEDS IT, because that is the event measured to arrive
  // BEFORE the approval; `item/completed` arrives only after the answer, so a
  // memory fed from it would be a memory that is always one beat too late.
  it('is fed by the event that arrives first and by nothing else', async () => {
    const cards = store();
    const said = [];
    const scope = cards.scope({ product: 'agentbox', item: 'w-1', say: (l) => said.push(l) });
    scope.remember('item/completed', { threadId: 'T-1', item: { type: 'fileChange', id: 'call_A', changes: [add('/a.txt', 'a\n')], status: 'completed' } });
    scope.remember('item/started', { threadId: 'T-1', item: { type: 'commandExecution', id: 'call_B', command: 'ls' } });

    await expect(scope.handle(...patchAsk('call_A'))).resolves.toBe(REFUSAL_DECISION);
    expect(said).toHaveLength(1);
  });

  // A reader that throws inside the supervisor's event loop takes itself out
  // for the rest of the session, which is a worker that keeps running and
  // reports nothing. This one is handed rubbish and keeps going.
  it('cannot be made to throw by anything on the wire', () => {
    const cards = store();
    const scope = cards.scope({ product: 'agentbox', item: 'w-1' });
    expect(() => {
      scope.remember(null, null);
      scope.remember('item/started', null);
      scope.remember('item/started', { item: { type: 'fileChange', id: 7, changes: 'not an array' } });
    }).not.toThrow();
  });
});

/* ==================== the wire from the running worker =================== */

// READ OUT OF THE SOURCE, the way this repo pins its other unrunnable facts
// (tests/a-codex-approval-reaches-her-on-the-same-card.test.mjs does it for
// main/ipc.mjs, and for the same reason). `_spawnCodexWorker` needs a whole
// Supervisor and a live app-server; what it must never lose is the ONE line
// that feeds the worker's notifications into the memory its cards are drawn
// from. Without it every fileChange approval is refused again and a Codex
// worker silently stops being able to write a file -- which is exactly the
// failure this slice exists to end, and it has no symptom on any screen.
describe('the line that joins a running worker to its own memory', () => {
  const supervisor = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');

  it('feeds every notification on the thread into the scope that draws its cards', () => {
    expect(supervisor).toMatch(/worker\.on\('event',\s*cards\.remember\)/);
  });

  it('has one such wire and no second one reaching past it', () => {
    expect(supervisor.match(/cards\.remember/g) ?? []).toHaveLength(1);
  });
});

/* ===================== what her screen does with it ====================== */

describe('the card her screen draws', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

  // "asks to run" over a diff is a lie, and it is the sentence she reads first.
  it('says change for a change and run for a command', () => {
    expect(approvalReads({ changes: 'Write /f\nhello' })).toEqual({ what: 'asks to change', body: 'Write /f\nhello' });
    expect(approvalReads({ command: 'rm -rf build' })).toEqual({ what: 'asks to run', body: 'rm -rf build' });
  });

  // THE CLAUDE CARD IS NOT MOVED BY A PIXEL. Its two shapes are a Bash card
  // carrying `command` and a `Read(**/.env*)` card carrying `file_path`, and
  // both read exactly as they read before this file existed.
  it('leaves a claude worker card exactly where it was', () => {
    expect(approvalReads({ command: 'sudo rm -rf /', cwd: '/repo' })).toEqual({ what: 'asks to run', body: 'sudo rm -rf /' });
    expect(approvalReads({ file_path: '/Users/her/p/.env' })).toEqual({ what: 'asks to run', body: '/Users/her/p/.env' });
    // A command still wins over a path when a tool input carries both.
    expect(approvalReads({ command: 'cat .env', file_path: '/p/.env' }).body).toBe('cat .env');
  });

  // THE CASE THAT MUST NOT MATCH: a shape with nothing readable in it is not a
  // blob of JSON in front of the founder. It says so, and she denies it.
  it('never puts a JSON dump in front of her', () => {
    expect(approvalReads({ url: 'https://example.com' })).toEqual({ what: 'asks to run', body: UNREADABLE });
    expect(approvalReads(null).body).toBe(UNREADABLE);
    expect(UNREADABLE).not.toMatch(/[{}]/);
    expect(app).not.toMatch(/JSON\.stringify\(a\.input\)/);
  });

  // A command approval and a file-change approval are one card wearing two
  // sentences, never two cards. `.approval-what` was the span that carried the
  // verb until the four-block round merged it away (w-34b7b861b6); the verb is
  // still `reads.what` and is still written in exactly two places, the lede's
  // fallback and the quiet line, which are the two halves of one either/or.
  it('draws both shapes through the one card the app already has', () => {
    expect(app).toMatch(/approvalReads/);
    // One <pre>, one card format.
    expect(app.match(/approval-cmd/g) ?? []).toHaveLength(1);
    expect(app.match(/reads\.what/g) ?? []).toHaveLength(2);
    expect(app).toContain('{said ?? <>{product} {reads.what}</>}');
    expect(app).toContain('said ? reads.what : null');
  });
});

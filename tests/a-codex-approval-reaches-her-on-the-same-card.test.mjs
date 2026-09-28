// A CODEX WORKER'S GATED COMMAND REACHES THE SAME CARD A CLAUDE ONE DOES.
//
// main/codex-app-server.mjs already turns a server request into a callback
// with a fifteen-minute deadline and a deny on every failure path. It was
// written with nobody on the other end of that callback, and said so: "the
// slice that builds the card is the slice that passes a handler". This is that
// slice, and the handler is joined to the spool Agentbox already has
// (main/approvals.mjs, main/approval-prompt-server.mjs) rather than to a
// second one: `{id, at, product, item, tool, input}`, one file per request,
// and `renderer/src/App.tsx` draws the `<pre>` off `input` without knowing or
// caring which engine asked.
//
// ------------------------------------------------------------------------
// THE SECURITY FINDING, AND WHY THE ANSWER DOES NOT TRAVEL BY FILE.
//
// The spool lives INSIDE the store root. For a Claude Code worker that is a
// granted directory (`writeWorkerSettings` puts the store root in
// `additionalDirectories`) and `worker-permissions.json` allows Bash broadly,
// so a worker on either engine that can run a shell can, in principle, write
// `<uuid>.answer.json` and approve itself. On the Claude path the reader of
// that file is a separate process (main/approval-prompt-server.mjs) and there
// is no other channel; here the reader is Agentbox itself, so there is a better
// one available and it is used: THE FOUNDER'S ANSWER IS DELIVERED IN PROCESS,
// from `main/ipc.mjs`'s one answering door, and a Codex approval is never
// resolved by reading a file at all. A file that appears for a request still
// waiting was therefore not written by her, and is deleted.
//
// WHAT THE SANDBOX ALREADY DOES, measured on this Mac 2026-09-04 against
// codex-cli 0.148.0 with `command/exec` and `sandboxPolicy: {type:
// "workspaceWrite", writableRoots: []}`, cwd set to a product folder inside a
// store root under $HOME:
//
//   write inside the cwd                      -> exit 0, file created
//   write <storeRoot>/.approvals/x.answer.json -> "Operation not permitted"
//   write <storeRoot>/poke.txt                 -> "Operation not permitted"
//   write under $TMPDIR                         -> exit 0, file created
//
// So a Codex worker's own commands cannot reach the spool -- WITH ONE REAL
// CAVEAT, which is the last line of that table: `workspace-write` leaves /tmp
// and $TMPDIR writable (`excludeSlashTmp` and `excludeTmpdirEnvVar` both
// default to false), so a store root under either of those IS reachable. Hers
// is `~/Zero`. The first version of that probe put its fixture store in
// `os.tmpdir` and every write "succeeded", which is exactly the false negative
// worth writing down.
//
// Between the two -- a sandbox that refuses, and an answer that never comes
// off disk -- a forged answer is not a weaker approval, it is not an approval.
// The residue is honest and stated in the tests below: a forged file makes the
// card blink out of `listPending` until the next poll deletes it, because
// `listPending` is main/approvals.mjs's rule and this slice does not change it.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCodexApprovals, codexApprovalCard } from '../main/codex-approvals.mjs';
import { listPending, answer, spoolDir } from '../main/approvals.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

const dirs = [];
const root = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-approvals-'));
  dirs.push(dir);
  return dir;
};
const tick = () => new Promise((resolve) => { setImmediate(resolve); });
const after = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * One command approval, as the server really frames it (the required fields
 *  are itemId, startedAtMs, threadId and turnId; `command` is nullable). */
const askToRun = (command, extra = {}) => ({
  threadId: 'T-1',
  turnId: 'TURN-1',
  itemId: 'item_1',
  startedAtMs: 1_700_000_000_000,
  command,
  cwd: '/repo',
  commandActions: [{ type: 'unknown', command }],
  ...extra,
});

const COMMAND = 'item/commandExecution/requestApproval';

beforeEach(() => { vi.restoreAllMocks(); });
afterAll(() => {
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/* ============================ the card itself ============================= */

describe('what a codex approval looks like on her card', () => {
  // `Bash` and `command` are not a new vocabulary: they are the two keys
  // renderer/src/App.tsx already reads, and Codex really does read and search
  // by running shell commands, so the honest spelling is also the matching one.
  it('is a Bash card carrying the command, exactly like a claude one', () => {
    expect(codexApprovalCard(COMMAND, askToRun('rm -rf build'))).toEqual({
      tool: 'Bash',
      // `cwd` is on the card now: `cat auth.json` in a scratch clone and in her
      // home directory are two different questions, and this fixture has
      // carried the folder since it was written.
      input: { command: 'rm -rf build', cwd: '/repo' },
    });
  });

  it('carries the reason as the description the card draws above the command', () => {
    expect(codexApprovalCard(COMMAND, askToRun('curl https://example.com', { reason: 'needs the network' })))
      .toEqual({ tool: 'Bash', input: { command: 'curl https://example.com', cwd: '/repo', description: 'needs the network' } });
  });

  // The schema makes `command` nullable, and the best-effort parse is the only
  // other place the words are. She must never be shown a blank card.
  it('falls back to the parsed action when the command itself is missing', () => {
    expect(codexApprovalCard(COMMAND, askToRun(null, { commandActions: [{ type: 'search', command: 'rg needle' }] })))
      .toEqual({ tool: 'Bash', input: { command: 'rg needle', cwd: '/repo' } });
  });

  // THE CASE THAT MUST NOT MATCH. A card with nothing on it is a card she would
  // answer blind. `FileChangeRequestApprovalParams` is itemId, threadId,
  // turnId, startedAtMs, reason and grantRoot -- no path and no diff -- so with
  // no memory of the item behind it there is nothing to draw; a fileChange IS
  // carded when the run saw that item go past, which is
  // tests/a-codex-file-change-reaches-her-as-something-she-can-read.test.mjs.
  // The permissions one is answered with a granted profile rather than a word
  // and stays undrawable outright. Both are refused by the transport's own
  // deny-by-default instead.
  it('draws nothing at all for a shape it cannot say out loud', () => {
    expect(codexApprovalCard(COMMAND, askToRun(''))).toBeNull();
    expect(codexApprovalCard(COMMAND, askToRun(null, { commandActions: null }))).toBeNull();
    expect(codexApprovalCard('item/fileChange/requestApproval', { threadId: 'T-1', itemId: 'I', grantRoot: '/etc' })).toBeNull();
    expect(codexApprovalCard('item/permissions/requestApproval', { threadId: 'T-1' })).toBeNull();
    expect(codexApprovalCard(COMMAND, null)).toBeNull();
    expect(codexApprovalCard(null, askToRun('ls'))).toBeNull();
  });
});

/* =========================== the spool round trip ========================= */

describe('an approval that reaches the spool', () => {
  it('lands as one request file in the shape the founder already sees', async () => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1', now: () => 1234 });
    const ask = spool.scope({ product: 'agentbox', item: 'w-1' }).handle;

    ask(COMMAND, askToRun('git push'));
    await tick();

    expect(listPending(store)).toEqual([{
      id: 'card-1',
      at: 1234,
      product: 'agentbox',
      item: 'w-1',
      tool: 'Bash',
      input: { command: 'git push', cwd: '/repo' },
    }]);
  });

  it('is released by her answer, with the word the transport takes', async () => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1' });
    const asked = spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('git push'));
    await tick();

    // The door main/ipc.mjs goes through, in the order it goes through it --
    // and the list comes first there too, because her decision is bound to the
    // card that was drawn rather than to its id
    // (tests/an-approval-authorises-only-the-action-she-read.test.mjs).
    listPending(store);
    expect(answer(store, 'card-1', true)).toBe(true);
    expect(spool.settle('card-1', true)).toBe(true);

    await expect(asked).resolves.toBe('accept');
  });

  it('is refused by a no, and the run carries on rather than being cancelled', async () => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1' });
    const asked = spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('rm -rf /'));
    await tick();

    answer(store, 'card-1', false, 'not that one');
    spool.settle('card-1', false, 'not that one');

    // `decline` and not `cancel`: a refusal should cost the command, not the
    // work item (main/codex-app-server.mjs, REFUSAL_DECISION).
    await expect(asked).resolves.toBe('decline');
  });

  // One audit line per decision and no litter, exactly as
  // main/approval-prompt-server.mjs `finish` does it for the other engine.
  it('leaves the spool empty and the decision in the log', async () => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1' });
    const asked = spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('git push'));
    await tick();
    answer(store, 'card-1', true);
    spool.settle('card-1', true);
    await asked;

    expect(fs.readdirSync(spoolDir(store)).filter((f) => f.endsWith('.json'))).toEqual([]);
    const logged = JSON.parse(fs.readFileSync(path.join(spoolDir(store), 'log.jsonl'), 'utf8').trim());
    expect(logged.id).toBe('card-1');
    expect(logged.tool).toBe('Bash');
    expect(logged.answer.allow).toBe(true);
  });

  it('denies when she never answers, and stops holding the card open', async () => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1', timeoutMs: 20, pollMs: 5 });
    const asked = spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('git push'));

    await expect(asked).resolves.toBe('decline');
    expect(listPending(store)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(spoolDir(store), 'log.jsonl'), 'utf8').trim()).answer.timeout).toBe(true);
  });

  // Her late click, after the deadline already said no. The turn was told no
  // and has moved on, so this must not resolve anything a second time.
  it('drops an answer that arrives after the deadline', async () => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1', timeoutMs: 20, pollMs: 5 });
    const asked = spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('git push'));
    await expect(asked).resolves.toBe('decline');

    expect(spool.settle('card-1', true)).toBe(false);
  });

  // Deny is the default in every failure mode, including a spool that cannot
  // be written at all (a store root that is gone, a full disk).
  it('denies rather than throwing when the spool cannot be written', async () => {
    const spool = createCodexApprovals({ storeRoot: '/nonexistent/ /store', uuid: () => 'card-1' });
    await expect(spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('git push'))).resolves.toBe('decline');
  });

  it(`denies everything still open when ${NAME} shuts the connection down`, async () => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1' });
    const asked = spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('git push'));
    await tick();

    spool.close(`${Name} is quitting`);

    await expect(asked).resolves.toBe('decline');
    expect(listPending(store)).toEqual([]);
  });
});

/* ======================= the wire from her button ======================== */

// READ OUT OF THE SOURCE, AND THAT IS A DELIBERATE SECOND BEST. `main/ipc.mjs`
// imports `electron`, nothing in this suite mocks it, and there is no test
// process that can call `answerApproval`. So the one thing that cannot be
// proven by running it is pinned the way this repo pins its other unrunnable
// facts (tests/a-codex-row-from-august-still-runs-on-claude.test.mjs reads
// sources for the same reason).
//
// It matters more than it looks. The founder's yes reaches a Codex worker
// ONLY through this call: the spool poll deletes answer files rather than
// reading them, so an ipc that wrote the file and forgot to say so in process
// would leave every Codex card denying itself fifteen minutes later, and the
// card would have LEFT her screen when she pressed the button. Deny-by-default
// means that failure is safe. It does not mean it is visible.
describe('the door the founder answers through', () => {
  const ipc = fs.readFileSync(new URL('../main/ipc.mjs', import.meta.url), 'utf8');

  it('tells the codex spool as well as writing the answer file', () => {
    expect(ipc).toMatch(/approvals\.answer\(config\.storeRoot, id, allow, note\)/);
    expect(ipc).toMatch(/supervisor\.settleCodexApproval\?\.\(id, allow, note\)/);
  });

  it('has one answering door and no second one reaching past it', () => {
    expect(ipc.match(/approvals\.answer\(/g) ?? []).toHaveLength(1);
    expect(ipc.match(/settleCodexApproval/g) ?? []).toHaveLength(1);
  });
});

/* ==================== the case that must not match ======================== */

describe('a worker that writes its own answer file', () => {
  const forge = async (allow) => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1', timeoutMs: 5_000, pollMs: 5 });
    const asked = spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('git push'));
    await tick();
    fs.writeFileSync(path.join(spoolDir(store), 'card-1.answer.json'), JSON.stringify({ allow, at: Date.now() }));
    await after(60);
    return { store, spool, asked };
  };

  // THE ONE THAT MATTERS. The founder's answer is delivered in process; nothing
  // a worker can write to the disk is read as one.
  it('does not approve itself', async () => {
    const { asked } = await forge(true);
    let settled = null;
    asked.then((d) => { settled = d; });
    await tick();
    expect(settled).toBeNull();
  });

  // And the forgery is not merely ignored, it is removed: her card comes back
  // rather than staying hidden behind a file she never wrote.
  it('has its file deleted, and the card is still waiting for her', async () => {
    const { store } = await forge(true);
    expect(fs.existsSync(path.join(spoolDir(store), 'card-1.answer.json'))).toBe(false);
    expect(listPending(store).map((a) => a.id)).toEqual(['card-1']);
  });

  it('cannot deny another worker either, and her real answer still lands', async () => {
    const { store, spool, asked } = await forge(false);
    listPending(store); // the card is drawn before it can be answered
    expect(answer(store, 'card-1', true)).toBe(true);
    expect(spool.settle('card-1', true)).toBe(true);
    await expect(asked).resolves.toBe('accept');
  });

  // THE RESIDUE THAT USED TO BE HERE IS GONE, and this is what took its place.
  //
  // It read: "between the forged write and the poll that deletes it,
  // `listPending` hides the card, because that rule belongs to
  // main/approvals.mjs and is shared with the Claude path." True at the time,
  // and worse than it sounded -- a worker rewriting the forgery on a loop keeps
  // ANY card, its own or another worker's, off her screen until the deadline
  // denies it in silence.
  //
  // `listPending` checks the signature now (2026-09-05), so the shared rule
  // that carried the residue is the rule that removes it: a file the founder
  // did not write hides nothing, on either engine, not even for one poll.
  it('cannot hide her card at all, not even for one poll', async () => {
    const store = root();
    const spool = createCodexApprovals({ storeRoot: store, uuid: () => 'card-1', timeoutMs: 5_000, pollMs: 5 });
    spool.scope({ product: 'agentbox', item: 'w-1' }).handle(COMMAND, askToRun('git push'));
    await tick();

    fs.writeFileSync(path.join(spoolDir(store), 'card-1.answer.json'), '{"allow":true}');
    expect(listPending(store).map((a) => a.id)).toEqual(['card-1']);

    await after(60);
    expect(listPending(store).map((a) => a.id)).toEqual(['card-1']);
    spool.close('done');
  });
});

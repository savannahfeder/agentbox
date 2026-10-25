// A PERMISSION CARD WAITS FOR THE PERSON IT ASKS, AND NOTHING ANSWERS FOR THEM.
//
// Found by a tester on the Linux QA box, Oct 24-25 2026 (F-51, F-44, F-52).
// Two small tasks reached `git add … && git commit`, raised their commit
// approvals at 7:07pm, and were left alone. Six hours later both threads were
// still under IN PROGRESS reading WORKING, with "Running /bin/bash -lc 'git add
// … && git commit …' 5h 57m" and no card anywhere on screen. The next morning
// both had moved to Needs you saying "Commit permission was denied … so the
// changes remain uncommitted." Nobody had denied anything, and both branches
// still had no commit on them.
//
// TWO CLOCKS, AND THEY DISAGREED. The engines denied a card after fifteen
// minutes of `setTimeout`, which does not run while a machine is suspended. The
// spool's own sweep (REQUEST_TTL_MS, main/approvals.mjs) counts `Date.now()`,
// which does. So on a box that slept the card left the screen at sixteen
// minutes of wall time -- the log said "approval 3bf36a0e-… outlasted every
// deadline that could have answered it" -- while the thing that was supposed to
// have answered it was still waiting, and denied it hours later.
//
// Matching the clocks would have fixed the vanishing and kept the lie, so the
// deadline went instead. It was put there when a waiting card showed nowhere
// but the open thread, so a parked worker was invisible; the row reads Asking
// and sits in Needs you now (w-fe48447cab). The rule around the spool is turned
// around to match: whoever is waiting keeps its own request there, and the
// sweep only ever reaps what nobody is holding up.
//
// Measured by driving both engines' own code: the Codex handler
// (main/codex-approvals.mjs) and the Claude Code channel
// (main/approval-prompt-core.mjs), with the sweep done by hand exactly as
// `listPending` does it.
import { describe, it, expect, vi, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createCodexApprovals } from '../main/codex-approvals.mjs';
import { serveApprovals } from '../main/approval-prompt-core.mjs';
import { answer, approvalPublicKey, listPending, spoolDir } from '../main/approvals.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');

const roots = [];
function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-waits-'));
  roots.push(root);
  fs.mkdirSync(spoolDir(root), { recursive: true });
  return root;
}
afterAll(() => { for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ } } });

const commandAsk = (command) => ['item/commandExecution/requestApproval', { threadId: 'T', turnId: 'U', itemId: 'I', command }];
/** Longer than the 5ms poll under test, short enough that nothing here sleeps. */
const aBeat = () => new Promise((r) => setTimeout(r, 60));

/** What `listPending` does at the TTL: the request and any answer, both gone. */
const sweep = (root, id) => {
  for (const f of [`${id}.request.json`, `${id}.answer.json`]) {
    fs.rmSync(path.join(spoolDir(root), f), { recursive: true, force: true });
  }
};

describe('a Codex card nobody has answered', () => {
  it('is still on screen and still answerable after the sweep has taken it', async () => {
    const root = store();
    const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', pollMs: 5 });
    const asked = cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('git add convert.js test.js && git commit -m "x"'));
    expect(listPending(root).map((r) => r.id)).toEqual(['card-1']);

    // RED BEFORE THE FIX: nothing put the request back, so the card was gone
    // from here for good and the only thing left to answer it was the deadline.
    sweep(root, 'card-1');
    await aBeat();

    const [back] = listPending(root);
    expect(back.id).toBe('card-1');
    expect(back.input.command).toContain('git commit');
    expect(back.item).toBe('w-1');

    // And her answer still lands on it, through the one door that answers.
    expect(cards.settle('card-1', true, null)).toBe(true);
    await expect(asked).resolves.toBe('accept');
  });

  it('is answered by her six hours later, and by nothing in between', async () => {
    vi.useFakeTimers();
    try {
      const root = store();
      // A minute between beats, so advancing six hours is 360 of them rather
      // than a million: this test is about the wait, not about the poll.
      const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', pollMs: 60_000 });
      let decided = null;
      const asked = cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('git commit -m "x"'));
      asked.then((d) => { decided = d; });

      // The quarter hour the deadline used to fire on, the minute the spool
      // used to reap on, and a night away. RED BEFORE THE FIX at the first.
      for (const ms of [15 * 60_000, 60_000, 6 * 60 * 60_000]) {
        await vi.advanceTimersByTimeAsync(ms);
        expect(decided).toBeNull();
        expect(cards.pending()).toEqual(['card-1']);
      }

      expect(cards.settle('card-1', false, 'not on main')).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(decided).toBe('decline');
    } finally {
      vi.useRealTimers();
    }
  });

  // AND IT NEVER WAITS IN SILENCE. Putting the card back can fail -- here the
  // spool itself has gone -- and that leaves the worker parked with nothing on
  // screen, which is the fault this whole change is about.
  it('says so, once, when it cannot be put back', async () => {
    const root = store();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', pollMs: 5 });
      cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('git commit -m "x"'));
      fs.rmSync(spoolDir(root), { recursive: true, force: true });
      await aBeat();

      const said = warn.mock.calls.flat().filter((l) => String(l).includes('could not be put back'));
      expect(said).toHaveLength(1);
      expect(said[0]).toMatch(/no card on screen/);
      cards.close('done with this test');
    } finally {
      warn.mockRestore();
    }
  });

  // THE CASE THAT MUST NOT MATCH. A card only waits while something is waiting
  // on it. The run that asked ending is what takes it away, and it must not
  // come back: before the fix the deadline was the backstop for this, and now
  // there is none.
  it('goes for good when the run that asked it stops', async () => {
    const root = store();
    const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', pollMs: 5 });
    const worker = cards.scope({ product: 'agentbox', item: 'w-1' });
    const asked = worker.handle(...commandAsk('git push'));

    worker.close('the worker that asked has stopped');
    await expect(asked).resolves.toBe('decline');
    await aBeat();

    expect(cards.pending()).toEqual([]);
    expect(listPending(root)).toEqual([]);
    expect(fs.existsSync(path.join(spoolDir(root), 'card-1.request.json'))).toBe(false);
  });
});

describe('a Claude Code card nobody has answered', () => {
  /** The channel as a worker's own child speaks it, over two pipes. */
  function channel(root) {
    const input = new PassThrough();
    const output = new PassThrough();
    const server = serveApprovals({
      env: { ZERO_APPROVALS_DIR: spoolDir(root), ZERO_APPROVALS_PUBKEY: approvalPublicKey(), ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'agentbox' },
      input,
      output,
      warn: () => {},
    });
    const said = new Promise((resolve) => output.once('data', (d) => resolve(JSON.parse(String(d)))));
    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'approval_prompt', arguments: { tool_name: 'Bash', input: { command: 'git commit -m "x"' } } },
    })}\n`);
    const decided = said.then((msg) => JSON.parse(msg.result.content[0].text));
    return { server, decided };
  }

  // This channel naps for its own POLL_MS between looks, so the wait is for a
  // card to appear rather than for a fixed number of beats.
  const waiting = async (root) => {
    for (let i = 0; i < 200 && !listPending(root).length; i += 1) await aBeat();
    return listPending(root);
  };

  it('is still on screen and still answerable after the sweep has taken it', async () => {
    const root = store();
    const { server, decided } = channel(root);
    const [first] = await waiting(root);
    expect(first.tool).toBe('Bash');

    sweep(root, first.id);
    const [back] = await waiting(root);
    expect(back.id).toBe(first.id);
    expect(back.input.command).toBe('git commit -m "x"');

    // The card she is looking at is the one her Allow is signed against.
    expect(answer(root, back.id, true, null)).toBe(true);
    await expect(decided).resolves.toEqual({ behavior: 'allow', updatedInput: { command: 'git commit -m "x"' } });
    server.close();
  });

  // THE CASE THAT MUST NOT MATCH, and the only bound left on the wait.
  it('ends when the run that asked ends, saying so rather than claiming she said no', async () => {
    const root = store();
    const { server, decided } = channel(root);
    await waiting(root);

    server.close();

    await expect(decided).resolves.toEqual({ behavior: 'deny', message: 'the run that asked has ended' });
    expect(listPending(root)).toEqual([]);
  });
});

// F-52, the other half of the same screen. While both threads sat there, the
// summary panel's DONE list already read "Committed the change on the task
// branch." against a branch with no commit on it, which is the line that could
// have got the only copy of that work thrown away. The DONE list is the
// worker's own (`progress`), so the fix is in what a worker is told, in both
// places it is told it.
describe('the DONE list a worker writes', () => {
  it('is told, in the brief and on the tool, that a line is a step that has finished', () => {
    for (const source of [read('briefs/worker.md'), read('mcp/tools.mjs')]) {
      expect(source).toMatch(/step that (has )?FINISHED/i);
      expect(source).toMatch(/never before/);
    }
    // And the shipped copy of the brief is the brief.
    expect(JSON.parse(read('shared/instruction-defaults.json')).system).toBe(read('briefs/worker.md'));
  });
});

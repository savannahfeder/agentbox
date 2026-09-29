// HER CLICK IS A WRITE FROM THE MAIN PROCESS, AND A WORKER USED TO CHOOSE
// WHERE IT LANDED (2026-09-04).
//
// `main/approvals.mjs`'s `answer` was a bare
// `fs.writeFileSync(path.join(dir, `${id}.answer.json`), ...)`. The spool lives
// at `<storeRoot>/.approvals`, the store root is in `additionalDirectories` and
// `worker-permissions.json` allows Bash broadly, so a Claude Code worker can
// list the spool, read its own request id off it, and pre-create
// `<id>.answer.json` AS A SYMLINK to any path on the machine. Measured on this
// Mac with node v22.19.0:
//
//     fs.writeFileSync(<symlink>, 'PWNED')   -> target content "PWNED"
//     fs.openSync(<symlink>, 'wx')           -> EEXIST, target untouched
//     fs.renameSync(tmp, <symlink>)          -> target untouched, dest is a
//                                               real file holding her answer
//
// The first line is the defect: her next Allow wrote JSON through the link,
// from AGENTBOX'S MAIN PROCESS, which is the one holding her real Mac permission
// identity. She pulls the trigger, on a card she believes is about something
// else.
//
// The fix is the third line rather than the second: an exclusive create at a
// name the worker cannot guess, then an atomic rename onto `<id>.answer.json`.
// `rename` replaces the directory entry and never resolves it, so the link is
// destroyed rather than followed AND her decision still lands on the first
// press. Plain `wx` on the final name would refuse to follow but would also
// throw away her click whenever anything was squatting the name, and a lost
// Allow is the silence this app is built not to produce.

import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answer, listPending, spoolDir } from '../main/approvals.mjs';
import { createCodexApprovals } from '../main/codex-approvals.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const ORIGINAL = '# Standing instructions\n\nBe careful with her files.\n';

const dirs = [];
afterAll(() => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

/** A store root with a spool, one waiting request already drawn on her screen,
 *  and a bystander file of hers standing in for `briefs/founder.md`. */
function planted(id = 'ap-1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-answer-link-'));
  dirs.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const bystander = path.join(root, 'founder.md');
  fs.writeFileSync(bystander, ORIGINAL);
  fs.writeFileSync(path.join(dir, `${id}.request.json`),
    JSON.stringify({ id, at: Date.now(), product: 'agentbox', item: 'w-1', tool: 'Bash', input: { command: 'echo hi' } }));
  // DRAWN BEFORE IT CAN BE ANSWERED, which is what the app does and is now what
  // `answer` requires: her decision is signed against the card that was put in
  // front of her, so a request nobody was ever shown cannot be answered at all
  // (tests/an-approval-authorises-only-the-action-she-read.test.mjs).
  listPending(root);
  return { root, dir, bystander, answerPath: path.join(dir, `${id}.answer.json`) };
}

describe('an answer file a worker pre-created as a symlink', () => {
  it('does not carry her decision into the file it points at', () => {
    const { root, bystander, answerPath } = planted();
    fs.symlinkSync(bystander, answerPath); // the attack, planted before she clicks

    answer(root, 'ap-1', true, null);

    // THE ASSERTION THAT GOES RED IF THE FIX IS REVERTED. With the old
    // `writeFileSync` this file holds `{"allow":true,...}`.
    expect(fs.readFileSync(bystander, 'utf8')).toBe(ORIGINAL);
  });

  it('still lands her decision, on the first press, as a real file', () => {
    const { root, bystander, answerPath } = planted();
    fs.symlinkSync(bystander, answerPath);

    expect(answer(root, 'ap-1', true, null)).toBe(true);
    expect(fs.lstatSync(answerPath).isSymbolicLink()).toBe(false);
    expect(JSON.parse(fs.readFileSync(answerPath, 'utf8')).allow).toBe(true);
    // And the card is gone from her stack, which is what the answer file is for
    // on this side of the protocol.
    expect(listPending(root)).toEqual([]);
  });

  it('does not create the file a dangling link names', () => {
    // The other half of the attack, and the more dangerous one: the target need
    // not exist yet. `writeFileSync` through a link to a missing path CREATES
    // it, so a worker could have Agentbox author a file anywhere it can name.
    const { root, answerPath } = planted();
    // Out of the spool, and inside this test's own throwaway root so a red run
    // does not leave the evidence lying in /tmp -- which is exactly what the
    // first red run of this file did.
    const missing = path.join(root, 'invented.md');
    fs.symlinkSync(missing, answerPath);

    answer(root, 'ap-1', true, null);

    expect(fs.existsSync(missing)).toBe(false);
    expect(JSON.parse(fs.readFileSync(answerPath, 'utf8')).allow).toBe(true);
  });

  it('a deny is still a deny, and a squatted name cannot jam it', () => {
    // The case that must NOT match: nothing about this may turn her refusal
    // into an allow, and a worker that squats the name with something `unlink`
    // refuses (a directory: EPERM, measured) must not be able to hold her card
    // unanswerable. `rename` onto a directory is EISDIR, so the write falls
    // back to removing the squatter first.
    const { root, answerPath } = planted();
    fs.mkdirSync(answerPath);

    expect(answer(root, 'ap-1', false, 'not this one')).toBe(true);
    const written = JSON.parse(fs.readFileSync(answerPath, 'utf8'));
    expect(written.allow).toBe(false);
    expect(written.note).toBe('not this one');
  });

  it('leaves the ordinary case exactly as it was', () => {
    const { root, answerPath } = planted();

    expect(answer(root, 'ap-1', true, null)).toBe(true);
    expect(JSON.parse(fs.readFileSync(answerPath, 'utf8'))).toMatchObject({ allow: true, note: null });
    expect(answer(root, 'nope', true, null)).toBe(false);
    expect(answer(root, '../escape', true, null)).toBe(false);
  });

  it('leaves no working file behind in the spool', () => {
    // The exclusive create happens at a name nothing can guess, in the same
    // directory so the rename is atomic. It must not survive the write, or the
    // spool fills with litter one card at a time.
    const { root, dir } = planted();
    answer(root, 'ap-1', true, null);
    expect(fs.readdirSync(dir).sort()).toEqual(['ap-1.answer.json', 'ap-1.request.json']);
  });
});

// AND WHEN THE WRITE CANNOT HAPPEN AT ALL, THE ANSWER IS NO.
//
// Hardening the write added a way for it to come back false where it used to
// come back true or THROW -- and a throw here landed in an ipc handler and in
// the ⌘Y `before-input-event` listener, where nothing catches it. Deny is this
// channel's default in every failure mode, and the one thing it may never be is
// silence: a Codex worker is parked on a promise in Agentbox's own process, so it
// is told the refusal and unblocks; a Claude Code worker has only the file, so
// it denies on its own deadline.

describe('an answer the spool will not take at all', () => {
  it('comes back false instead of throwing out of a keystroke handler', () => {
    const { root, dir } = planted();
    fs.chmodSync(dir, 0o500); // no writes in this directory, for anybody
    try {
      expect(() => answer(root, 'ap-1', true, null)).not.toThrow();
      expect(answer(root, 'ap-1', true, null)).toBe(false);
      expect(fs.readdirSync(dir)).toEqual(['ap-1.request.json']); // and no litter
    } finally {
      fs.chmodSync(dir, 0o700);
    }
  });

  // The main process is not something this suite can boot, so the door is
  // asserted against its source -- the same way
  // tests/the-menu-answers-a-card-through-the-one-door.test.mjs asserts it.
  const door = () => {
    const ipc = fs.readFileSync(path.join(here, '..', 'main', 'ipc.mjs'), 'utf8');
    const start = ipc.indexOf('const answerApproval = (');
    expect(start).toBeGreaterThan(-1);
    const end = ipc.indexOf('\n  };', start);
    expect(end).toBeGreaterThan(start);
    return ipc.slice(start, end);
  };

  it('is turned into a deny by the one answering door, not dropped', () => {
    // The Codex side is told whatever was RECORDED, which is why the call is
    // not guarded by the write succeeding: a card she pressed Allow on and
    // Agentbox could not record is a card the worker must be refused on.
    expect(door()).toMatch(/if \(!ok\) \{ allow = false; note = SPOOL_REFUSED; \}/);
    expect(door()).not.toMatch(/if \(ok\) supervisor\.settleCodexApproval/);
    expect(door().indexOf('allow = false')).toBeLessThan(door().indexOf('settleCodexApproval'));
  });

  it('tells the renderer what was recorded rather than what she pressed', () => {
    expect(door()).toMatch(/'zero:approval-answered', \{ id, allow: !!allow \}/);
  });
});

// AND THE SWEEP THAT WATCHES FOR A FORGED ANSWER MUST STILL TELL THE TWO APART.
//
// On a Codex card nothing ever READS an answer file: the worker is parked on a
// promise inside Agentbox, her decision arrives through `settle`, and a
// `<id>.answer.json` that turns up for a card still waiting is by definition a
// worker's (main/codex-approvals.mjs). `sweepForgery` deletes it. Her own
// answer is written by the same door a beat before `settle` runs, so the two
// live one line apart and getting it wrong in either direction is loud: sweep
// her answer and Agentbox accuses her of forging her own approval (which it did,
// through the Agents menu, until 2026-09-04); miss a forgery and her card stays
// hidden while `listPending` counts it decided.

const commandAsk = (command) => ['item/commandExecution/requestApproval', { threadId: 'T', turnId: 'U', itemId: 'I', command }];
const settled = () => new Promise((r) => setTimeout(r, 60));

describe('her own answer, on a Codex card', () => {
  it('is not mistaken for the forgery the sweep is looking for', async () => {
    const { root, dir } = planted('unused');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', timeoutMs: 60_000, pollMs: 5 });
      const asked = cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('git push'));

      // Exactly main/ipc.mjs's order, in one breath: the card is drawn, then
      // the file, then the door.
      listPending(root);
      expect(answer(root, 'card-1', true, null)).toBe(true);
      expect(cards.settle('card-1', true, null)).toBe(true);
      await expect(asked).resolves.toBe('accept');
      await settled();

      expect(warn.mock.calls.flat().join(' ')).not.toMatch(/did not write/);
      expect(fs.readdirSync(dir).sort()).toEqual(['log.jsonl', 'unused.request.json']);
    } finally {
      warn.mockRestore();
    }
  });

  it('and a forgery it can no longer see through is still swept', async () => {
    // A DANGLING link, which is the case the old `existsSync` gate missed:
    // `readdir` shows the entry, so `listPending` counts the card decided and
    // hides it, while `existsSync` resolves the link, finds nothing, and
    // reports there is nothing to sweep. The card would have stayed hidden for
    // the whole fifteen minutes.
    const { root, dir } = planted('unused');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', timeoutMs: 60_000, pollMs: 5 });
      const asked = cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('git push'));
      fs.symlinkSync(path.join(root, 'nowhere.md'), path.join(dir, 'card-1.answer.json'));
      await settled();

      expect(warn.mock.calls.flat().join(' ')).toMatch(/did not write/);
      expect(fs.existsSync(path.join(root, 'nowhere.md'))).toBe(false);
      expect(cards.pending()).toEqual(['card-1']);
      expect(listPending(root).map((r) => r.id)).toContain('card-1');

      cards.close('done with this test');
      await expect(asked).resolves.toBe('decline');
    } finally {
      warn.mockRestore();
    }
  });

  it('and so is one squatting the name with a directory', async () => {
    const { root, dir } = planted('unused');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const cards = createCodexApprovals({ storeRoot: root, uuid: () => 'card-1', timeoutMs: 60_000, pollMs: 5 });
      const asked = cards.scope({ product: 'agentbox', item: 'w-1' }).handle(...commandAsk('git push'));
      fs.mkdirSync(path.join(dir, 'card-1.answer.json'));
      await settled();

      expect(fs.existsSync(path.join(dir, 'card-1.answer.json'))).toBe(false);
      expect(listPending(root).map((r) => r.id)).toContain('card-1');

      cards.close('done with this test');
      await expect(asked).resolves.toBe('decline');
    } finally {
      warn.mockRestore();
    }
  });
});

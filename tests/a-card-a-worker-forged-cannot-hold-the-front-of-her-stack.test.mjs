// A FORGED REQUEST USED TO SIT AT THE HEAD OF THE CARD STACK FOREVER
// (2026-09-04).
//
// `listPending` sorted by `a.at`, read straight out of the request file, and
// the request file is worker-writable: the spool is `<storeRoot>/.approvals`,
// the store root is in `additionalDirectories`, and `worker-permissions.json`
// allows Bash broadly. So a worker writes `<uuid>.request.json` with `at: 0`
// and owns the front of the stack.
//
// That is not one bad card, it is every card. The renderer draws only the front
// one (`approvalStage`), and ⌘Y/⌘N and the Agents menu both act on
// `listPending[0]` -- so every real question, on either engine, hides behind a
// decoy the worker wrote, and her keystroke answers the decoy. And nothing
// reaped it: a request file whose process is gone is never removed by anybody,
// so `at: 0` meant permanently.
//
// TWO CHANGES, AND THEY ARE ONE IDEA: the spool stops believing anything a
// worker wrote about time.
//
// 1. ORDER IS AGENTBOX'S OWN CLOCK. `at` is no longer read for sorting at all.
//    Cards are ordered by when THIS PROCESS first saw the file, on a monotonic
//    counter taken at that sighting, so the order is total and nothing in the
//    directory can move a card forward. `at` stays in the request and in the
//    audit line, because that is a worker's own account of itself and the log
//    is where an account belongs.
//
//    A floor on `at` was the other candidate and it is weaker: a legitimate
//    `at` written moments before Agentbox sees the file needs a tolerance, and
//    anything inside that tolerance is exactly the window a forgery would be
//    planted in.
//
// 2. A REQUEST NOBODY IS WAITING ON IS REAPED. Both engines give up on a card
//    after fifteen minutes -- main/approval-prompt-server.mjs's own deadline,
//    main/codex-approvals.mjs's `timeoutMs` -- and both delete the pair when
//    they do. A request file still there well after that is either a forgery or
//    the leftovers of a worker that died before its own deadline, and in both
//    cases the card is a question nothing can answer. It goes, on Agentbox's
//    clock, never on the file's.
//
// What this does NOT claim: a worker able to write into the spool can still put
// A card in front of her, because a file is the whole of the Claude Code
// protocol and provenance cannot be proved on it. What it can no longer do is
// put that card in front of every card that came before it, or leave it there.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answer, listPending, spoolDir, REQUEST_TTL_MS } from '../main/approvals.mjs';
import { APPROVAL_TIMEOUT_MS } from '../main/codex-app-server.mjs';
import { NAME } from '../shared/product-name.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const dirs = [];
function spool() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-forged-'));
  dirs.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}
afterAll(() => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

const request = (dir, id, at) => fs.writeFileSync(path.join(dir, `${id}.request.json`),
  JSON.stringify({ id, at, product: 'agentbox', item: 'w-1', tool: 'Bash', input: { command: 'echo hi' } }));

describe('the order her cards are stacked in', () => {
  it(`is the order ${NAME} saw them, not the order they claim`, () => {
    const { root, dir } = spool();
    request(dir, 'real', 1_700_000_000_000);
    expect(listPending(root).map((r) => r.id)).toEqual(['real']);

    // The attack: a worker forges a request dated the beginning of time.
    request(dir, 'forged', 0);

    // RED IF THE FIX IS REVERTED: sorting by `a.at` puts 'forged' first, which
    // is the card the renderer draws and the one ⌘Y answers.
    expect(listPending(root).map((r) => r.id)).toEqual(['real', 'forged']);
  });

  it('is not seized by a card that claims to be from the future either', () => {
    // The boundary on the other side. Ordering must come off one clock, so a
    // huge `at` may no more push a card to the back than a zero may pull it to
    // the front -- otherwise a worker could bury a real card it wanted ignored.
    const { root, dir } = spool();
    request(dir, 'first', Number.MAX_SAFE_INTEGER);
    expect(listPending(root).map((r) => r.id)).toEqual(['first']);
    request(dir, 'second', 1);
    expect(listPending(root).map((r) => r.id)).toEqual(['first', 'second']);
  });

  it('is not seized by a name either, when two land inside one poll', () => {
    // A sighting is only as fine as the poll that made it, so two cards that
    // appear inside one interval share a timestamp and something breaks the
    // tie. `readdir` comes back in NAME order on this Mac -- measured -- and a
    // forgery names itself, so a worker watching the spool could plant a decoy
    // the instant a real card appeared and sort itself in front of it. The tie
    // goes on `ctime`, which an unprivileged process can push forward but never
    // back (measured: `utimes(epoch)` set mtime and birthtime to 0 and moved
    // ctime to now).
    const { root, dir } = spool();
    request(dir, 'zzz-real', 1);
    request(dir, 'aaa-forged', 0);
    expect(fs.readdirSync(dir)).toEqual(['aaa-forged.request.json', 'zzz-real.request.json']);

    expect(listPending(root).map((r) => r.id)).toEqual(['zzz-real', 'aaa-forged']);
  });

  it('still puts the oldest real card in front, which is the whole point of it', () => {
    // The case that must NOT match: this is not "ordering does not matter now".
    // Two honest cards, raised in order, still stack in that order, and the one
    // she answers is still the one that has been waiting longest.
    const { root, dir } = spool();
    request(dir, 'older', 5);
    listPending(root);
    request(dir, 'newer', 6);
    listPending(root);
    request(dir, 'newest', 7);
    expect(listPending(root).map((r) => r.id)).toEqual(['older', 'newer', 'newest']);
  });

  // DECIDED BY HER, WHICH IS NOT THE SAME AS "HAS AN ANSWER FILE". This wrote
  // a bare `{allow:true}` and expected the card to vanish, which is exactly the
  // hiding a worker could do to any card on the machine; `answer` signs, and
  // `listPending` hides only what verifies (2026-09-05, see
  // tests/a-worker-cannot-write-its-own-approval).
  it('keeps hiding a card that has been decided', () => {
    const { root, dir } = spool();
    request(dir, 'a', 1);
    request(dir, 'b', 2);
    listPending(root); // drawn before it can be answered
    expect(answer(root, 'a', true, null)).toBe(true);
    expect(listPending(root).map((r) => r.id)).toEqual(['b']);
  });

  it('an empty or missing spool is still just an empty list', () => {
    const { root } = spool();
    expect(listPending(root)).toEqual([]);
    expect(listPending(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-nospool-')))).toEqual([]);
  });
});

describe('a request nobody is waiting on any more', () => {
  it('is reaped, so a forgery cannot outlast the fleet', () => {
    const { root, dir } = spool();
    const t0 = 1_700_000_000_000;
    request(dir, 'forged', 0);
    expect(listPending(root, { now: () => t0 }).map((r) => r.id)).toEqual(['forged']);

    // RED IF THE FIX IS REVERTED: nothing has ever removed a request file whose
    // process is gone, so this card is still in the list and still on disk.
    expect(listPending(root, { now: () => t0 + REQUEST_TTL_MS + 1 })).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'forged.request.json'))).toBe(false);
  });

  it('is not reaped while a worker could still be waiting on it', () => {
    // The boundary that matters most, because getting it wrong takes a real
    // card off her screen while a worker is parked on it. Both engines wait
    // fifteen minutes, so nothing may go before that.
    const { root, dir } = spool();
    const t0 = 1_700_000_000_000;
    request(dir, 'live', t0);
    listPending(root, { now: () => t0 });

    expect(listPending(root, { now: () => t0 + REQUEST_TTL_MS }).map((r) => r.id)).toEqual(['live']);
    expect(fs.existsSync(path.join(dir, 'live.request.json'))).toBe(true);
  });

  it('waits out the whole of both engines\' deadlines before it does', () => {
    // The one number this file leans on, checked rather than trusted: the TTL
    // is a second copy of "fifteen minutes" and it must never be the shorter
    // one. main/approval-prompt-server.mjs holds the Claude side's copy.
    const server = fs.readFileSync(path.join(here, '..', 'main', 'approval-prompt-server.mjs'), 'utf8');
    expect(REQUEST_TTL_MS).toBeGreaterThan(APPROVAL_TIMEOUT_MS);
    expect(server).toMatch(/TIMEOUT_MS = 15 \* 60_000/);
    expect(REQUEST_TTL_MS).toBeGreaterThan(15 * 60_000);
  });

  it('takes a stray answer file with it, and leaves the live cards alone', () => {
    const { root, dir } = spool();
    const t0 = 1_700_000_000_000;
    request(dir, 'old', 0);
    fs.writeFileSync(path.join(dir, 'old.answer.json'), JSON.stringify({ allow: false }));
    listPending(root, { now: () => t0 });

    request(dir, 'fresh', 0);
    const later = t0 + REQUEST_TTL_MS + 1;
    expect(listPending(root, { now: () => later }).map((r) => r.id)).toEqual(['fresh']);
    expect(fs.readdirSync(dir).sort()).toEqual(['fresh.request.json']);
  });
});

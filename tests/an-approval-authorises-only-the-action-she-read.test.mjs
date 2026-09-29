// AN APPROVAL AUTHORISES ONLY THE ACTION SHE READ, NOT WHATEVER IS FILED UNDER
// THAT ID BY THE TIME IT IS HONOURED.
//
// The signature slice (2026-09-05) made an approval answer unforgeable: Agentbox
// signs the founder's decision with an ed25519 key that never leaves its
// process, and the worker's MCP server verifies with the public half. That
// closed "a worker can write itself an allow". It did NOT close what the
// allow is an allow FOR.
//
// `decisionBytes` covered `[id, allow, note, at]` and nothing else. The request
// file is worker-writable -- the spool is `<storeRoot>/.approvals`,
// `writeWorkerSettings` puts the store root in `additionalDirectories` and
// `worker-permissions.json` allows Bash broadly -- and a file's NAME and the id
// inside it can be kept while its CONTENTS are replaced. So:
//
//   1. a worker raises `rm -rf ~/Zero`; main/approval-prompt-server.mjs keeps
//      that request in its own memory and waits on the answer file
//   2. the worker rewrites `<id>.request.json` in place, same id, with
//      `echo hi`
//   3. `listPending` reads the file and Agentbox draws `echo hi` on the card
//   4. she presses Allow, `answer` signs a decision that says only "yes to
//      <id>", and the server -- still holding `rm -rf ~/Zero` -- verifies the
//      signature happily and returns `behavior: allow`
//
// The signature is real and it proves nothing about what she agreed to.
//
// THE CODEX HALF HAS THE SAME SHAPE. `settle` takes an id and a verdict while
// the original request sits in `open` in Agentbox's memory, and the card she is
// shown is drawn from the same worker-writable spool file. A Codex worker's own
// sandbox cannot reach the spool (measured, main/codex-approvals.mjs), but a
// CLAUDE worker on the same machine can, and one Agentbox shows both engines'
// cards out of one directory.
//
// SO THE DECISION IS BOUND TO THE ACTION, NOT TO THE ID. `answer` signs a
// digest of the card Agentbox last put in front of her, the signature covers it
// alongside the verdict, and each engine compares that digest against the
// request IT is holding before anything is allowed. A mismatch is a deny.
//
// WHY THE DIGEST IS OF WHAT WAS *DISPLAYED* AND NOT OF THE FILE AT ANSWER TIME.
// Re-reading the request inside `answer` looks equivalent and is not: a worker
// that flips the file between the harmless body and the real one wins whenever
// her press lands on a harmless draw and the re-read catches the real body.
// `listPending` is the only thing that reads a request, every one of its three
// callers acts on or draws exactly what it returned (main/ipc.mjs's snapshot,
// and main/main.mjs's ⌘Y chord and Agents menu), so the digest it records IS
// the card she is looking at.
//
// CANONICALISATION IS THE PART THAT CAN FAIL QUIETLY, and a digest that
// disagrees with itself across a round-trip would deny every approval on the
// machine. Both sides hold JSON: the engine's in-memory object, and Agentbox's
// parse of the file that object was stringified into. So the digest is taken
// over a canonical form -- keys sorted, nesting recursed, taken after one
// JSON round-trip so `toJSON`, `undefined` and `NaN` are already resolved the
// way the file resolved them. The first describe below is that property, and
// it is the one to read first when approvals start denying for no reason.

import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  answer, answerIsHers, approvalPublicKey, cardDigest, cardShown, listPending, spoolDir,
} from '../main/approvals.mjs';
import { createCodexApprovals } from '../main/codex-approvals.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(here, '..', 'main', 'approval-prompt-server.mjs');

const roots = [];
function spool() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-bound-'));
  roots.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}
const write = (dir, id, request) => fs.writeFileSync(path.join(dir, `${id}.request.json`), JSON.stringify(request));
const card = (id, input) => ({ id, at: 1_700_000_000_000, product: 'agentbox', item: 'w-1', tool: 'Bash', input });
const readAnswer = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.answer.json`), 'utf8'));

afterAll(() => {
  for (const root of roots) { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } }
});

/* =================== the digest agrees with itself ======================= */
//
// EVERY CASE HERE IS A DENIAL-OF-SERVICE IF IT GOES RED. A digest that differs
// between the engine's own object and Agentbox's parse of the file it wrote means
// every card on the machine is denied, on both engines, with nothing on screen
// saying why.

describe('the digest of one card', () => {
  it('survives the round trip through the file the engine wrote', () => {
    const request = card('a', { command: 'git status', description: 'look around' });
    expect(cardDigest(JSON.parse(JSON.stringify(request)))).toBe(cardDigest(request));
  });

  it('does not depend on the order the keys happen to be in', () => {
    expect(cardDigest({ id: 'a', tool: 'Bash', input: { b: 2, a: 1 } }))
      .toBe(cardDigest({ input: { a: 1, b: 2 }, tool: 'Bash', id: 'a' }));
  });

  it('reaches all the way down a nested input', () => {
    const deep = { id: 'a', tool: 'Edit', input: { edits: [{ path: '/x', old: 'a', new: 'b' }], meta: { n: 1 } } };
    expect(cardDigest(deep)).toBe(cardDigest(JSON.parse(JSON.stringify(deep))));
    const moved = { id: 'a', tool: 'Edit', input: { meta: { n: 1 }, edits: [{ new: 'b', old: 'a', path: '/x' }] } };
    expect(cardDigest(moved)).toBe(cardDigest(deep));
  });

  it('is stable across the shapes JSON resolves on its way to disk', () => {
    // `undefined` is dropped from an object and becomes null in an array;
    // NaN becomes null. Agentbox only ever sees the resolved form, so the
    // engine's own object has to digest to the same thing.
    expect(cardDigest({ id: 'a', gone: undefined, tool: 'Bash' })).toBe(cardDigest({ id: 'a', tool: 'Bash' }));
    expect(cardDigest({ id: 'a', xs: [1, undefined, NaN] })).toBe(cardDigest({ id: 'a', xs: [1, null, null] }));
    // AND ANYTHING THAT WRITES ITSELF DOWN AS SOMETHING ELSE. A value with a
    // `toJSON` reaches the file as that, and has no own keys at all in memory,
    // so a digest taken without the round trip reads `{}` on one side and a
    // string on the other -- which is not a hole, it is every approval on the
    // machine denied with nothing on screen saying why. `at` is a number today
    // and this is what keeps it from mattering if it ever is not.
    const dated = { id: 'a', at: new Date(1_700_000_000_000) };
    expect(cardDigest(dated)).toBe(cardDigest(JSON.parse(JSON.stringify(dated))));
  });

  it('holds for text that is not plain ascii', () => {
    for (const command of ['echo "héllo"', 'echo 🙈', 'echo é', 'echo é', 'echo \u{10FFFF}']) {
      const request = card('a', { command });
      expect(cardDigest(JSON.parse(JSON.stringify(request)))).toBe(cardDigest(request));
    }
  });

  // THE CASE THAT MUST NOT MATCH, which is the whole point of taking a digest
  // at all. Two cards that say different things are different cards -- and a
  // combining sequence is NOT the precomposed character, because normalising
  // would be Agentbox deciding two different byte strings are the same command.
  it('is different for a different command', () => {
    expect(cardDigest(card('a', { command: 'echo hi' }))).not.toBe(cardDigest(card('a', { command: 'rm -rf ~/Zero' })));
    expect(cardDigest(card('a', { command: 'echo hi' }))).not.toBe(cardDigest(card('a', { command: 'echo hi ' })));
    expect(cardDigest(card('a', { command: 'echo é' }))).not.toBe(cardDigest(card('a', { command: 'echo é' })));
    // The tool, the project and the row are on the card too, so each of them
    // changes it.
    expect(cardDigest(card('a', { command: 'echo hi' })))
      .not.toBe(cardDigest({ ...card('a', { command: 'echo hi' }), tool: 'Write' }));
    expect(cardDigest(card('a', { command: 'echo hi' })))
      .not.toBe(cardDigest({ ...card('a', { command: 'echo hi' }), product: 'elsewhere' }));
  });

  // FAIL CLOSED RATHER THAN FAIL EQUAL. Something that cannot be digested has
  // no digest, and null must never compare equal to a real one -- every caller
  // below treats a null as a mismatch.
  it('is nothing at all for something that is not a request', () => {
    const cyclic = { id: 'a' };
    cyclic.self = cyclic;
    for (const bad of [null, undefined, 'a string', 42, ['a'], cyclic]) expect(cardDigest(bad)).toBeNull();
  });
});

/* ============ what Agentbox signs is the card it put in front of her ======== */

describe('the founder\'s decision', () => {
  it('carries the digest of the card that was drawn, and verifies with it', () => {
    const { root, dir } = spool();
    const request = card('card-1', { command: 'echo hi' });
    write(dir, 'card-1', request);
    listPending(root); // the card reaches her screen

    expect(answer(root, 'card-1', true, null)).toBe(true);
    const hers = readAnswer(dir, 'card-1');
    expect(hers.card).toBe(cardDigest(request));
    expect(answerIsHers('card-1', hers)).toBe(true);
  });

  // BOUND TO THE ACTION, WHICH IS THE BUG. The signature used to cover the id
  // and the verdict, so it stayed valid over a body that had been swapped
  // underneath it.
  it('stops verifying if the card it names is edited', () => {
    const { root, dir } = spool();
    write(dir, 'card-1', card('card-1', { command: 'echo hi' }));
    listPending(root);
    answer(root, 'card-1', true, null);
    const hers = readAnswer(dir, 'card-1');

    expect(answerIsHers('card-1', { ...hers, card: cardDigest(card('card-1', { command: 'rm -rf ~/Zero' })) })).toBe(false);
    expect(answerIsHers('card-1', { ...hers, card: null })).toBe(false);
    const { card: _dropped, ...without } = hers;
    expect(answerIsHers('card-1', without)).toBe(false);
  });

  // IT IS THE CARD SHE WAS SHOWN, NOT WHATEVER THE FILE SAYS BY THE TIME SHE
  // PRESSES, AND THIS IS THE CASE THAT TELLS THE FIX FROM THE PLAUSIBLE
  // NEAR-MISS. Re-reading the request inside `answer` passes every other
  // assertion in this file -- measured 2026-09-05 by making exactly that change
  // and watching the swap test below stay green -- because in the simple attack
  // the worker leaves the harmless body in place. It fails here: a worker that
  // puts its own command back after the draw and before the press gets her
  // signature over the command she never read.
  it('is the card she was shown, not whatever the file says when she presses', () => {
    const { root, dir } = spool();
    const drawn = card('card-1', { command: 'echo hi' });
    write(dir, 'card-1', drawn);
    listPending(root);
    write(dir, 'card-1', card('card-1', { command: 'rm -rf ~/Zero' }));

    expect(answer(root, 'card-1', true, null)).toBe(true);
    expect(readAnswer(dir, 'card-1').card).toBe(cardDigest(drawn));
  });

  // AND A CARD NOBODY WAS SHOWN CANNOT BE ANSWERED AT ALL. There is nothing to
  // bind the decision to, and guessing from the file on disk is the hole this
  // whole file is about. Every route that answers a card reads `listPending`
  // first, so in the app this is unreachable; it is the fail-closed floor under
  // all three of them.
  it('is refused for a request that was never put in front of her', () => {
    const { root, dir } = spool();
    write(dir, 'card-1', card('card-1', { command: 'echo hi' }));

    expect(answer(root, 'card-1', true, null)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'card-1.answer.json'))).toBe(false);
  });

  it('remembers the card as it was last drawn, per spool and per id', () => {
    const { root, dir } = spool();
    const first = card('card-1', { command: 'echo hi' });
    write(dir, 'card-1', first);
    listPending(root);
    expect(cardShown(root, 'card-1')).toBe(cardDigest(first));

    const second = card('card-1', { command: 'echo again' });
    write(dir, 'card-1', second);
    listPending(root);
    expect(cardShown(root, 'card-1')).toBe(cardDigest(second));

    expect(cardShown(root, 'never-seen')).toBeNull();
  });
});

/* ============= the process the Claude Code worker is waiting on ========== */
//
// Driven as the real thing, because the decision only happens inside a real
// one: the CLI spawns that server as the worker's own child and speaks JSON-RPC
// to it over stdio.

/**
 * Ask the server for one approval and run `plant` once the request is in the
 * spool. Resolves with the tool result the worker would have received.
 */
function askAndPlant(root, command, plant) {
  const dir = spoolDir(root);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        ZERO_APPROVALS_DIR: dir,
        ZERO_APPROVALS_PUBKEY: approvalPublicKey(),
        ZERO_PRODUCT: 'agentbox',
        ZERO_ITEM: 'w-1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const fail = (why) => { try { child.kill('SIGKILL'); } catch { /* gone */ } reject(new Error(why)); };
    const giveUp = setTimeout(() => fail('the approvals server never answered'), 25_000);
    let out = '';
    child.stdout.on('data', (b) => {
      out += b;
      if (!out.includes('\n')) return;
      clearTimeout(giveUp);
      clearInterval(watch);
      child.kill();
      resolve(JSON.parse(JSON.parse(out.split('\n')[0]).result.content[0].text));
    });
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'approval_prompt', arguments: { tool_name: 'Bash', input: { command } } },
    })}\n`);
    let done = false;
    const watch = setInterval(() => {
      let req;
      try { req = fs.readdirSync(dir).find((f) => f.endsWith('.request.json')); } catch { return; }
      if (!req || done) return;
      done = true;
      clearInterval(watch);
      plant(root, req.replace('.request.json', ''), dir);
    }, 50);
    child.on('exit', () => { clearInterval(watch); clearTimeout(giveUp); });
  });
}

describe('a request rewritten under the id she is reading', () => {
  // THE BUG, END TO END. The worker swaps its own dangerous request for a
  // harmless one, she reads the harmless one and presses Allow, and the server
  // is still holding the dangerous one.
  //
  // HER ALLOW IS PLANTED PAST A POLL ON PURPOSE. The server looks for an answer
  // every two seconds; a swap and an answer inside the first poll would leave
  // no window in which the old code could be caught doing anything.
  it('is denied even though her signature is real', async () => {
    const { root, dir } = spool();
    const result = await askAndPlant(root, 'rm -rf ~/Zero', (r, id) => {
      const swapped = { ...card(id, { command: 'echo hi' }), at: Date.now() };
      write(dir, id, swapped);
      setTimeout(() => {
        listPending(r); // Agentbox draws `echo hi`
        expect(cardShown(r, id)).toBe(cardDigest(swapped));
        expect(answer(r, id, true, null)).toBe(true); // and she says yes to it
      }, 2_500);
    });

    expect(result.behavior).toBe('deny');
    expect(result.message).toMatch(/changed/i);
  }, 40_000);

  // AND PUT BACK AGAIN BEFORE HER PRESS LANDS, which is the same attack run by
  // a worker patient enough to restore its own command. It is the one shape a
  // digest taken at answer time cannot see: that variant signs the command that
  // is on disk when she presses, the server is holding the same command, the
  // two agree, and the allow goes through for something she never read.
  it('is denied even when the worker puts its own command back before she presses', async () => {
    const { root } = spool();
    const result = await askAndPlant(root, 'rm -rf ~/Zero', (r, id, dir) => {
      const original = fs.readFileSync(path.join(dir, `${id}.request.json`), 'utf8');
      write(dir, id, { ...JSON.parse(original), input: { command: 'echo hi' } });
      setTimeout(() => {
        listPending(r); // Agentbox draws `echo hi`
        fs.writeFileSync(path.join(dir, `${id}.request.json`), original); // and it goes back
        expect(answer(r, id, true, null)).toBe(true);
      }, 2_500);
    });

    expect(result.behavior).toBe('deny');
    expect(result.message).toMatch(/changed/i);
  }, 40_000);

  // THE CASE THAT MUST NOT MATCH, AND THE ONE THAT MUST NOT REGRESS: her real
  // Allow on an untouched card is still an allow. This is the Claude Code path,
  // which is the engine she actually uses.
  it('does not stop an ordinary Allow, which is the path that must not regress', async () => {
    const { root } = spool();
    const result = await askAndPlant(root, 'rm -rf ~/Zero', (r, id) => {
      setTimeout(() => {
        listPending(r);
        expect(answer(r, id, true, null)).toBe(true);
      }, 2_500);
    });

    expect(result).toMatchObject({ behavior: 'allow' });
  }, 40_000);

  it('does not stop an ordinary Deny either, and keeps her words on it', async () => {
    const { root } = spool();
    const result = await askAndPlant(root, 'rm -rf ~/Zero', (r, id) => {
      setTimeout(() => {
        listPending(r);
        expect(answer(r, id, false, 'not that one')).toBe(true);
      }, 2_500);
    });

    expect(result).toEqual({ behavior: 'deny', message: 'not that one' });
  }, 40_000);
});

/* ================== and the same rule on the Codex side ================== */
//
// Here the thing holding the original is Agentbox itself: `open` in
// main/codex-approvals.mjs, keyed by the id the card was written under. The
// request FILE is still in the shared spool and a Claude Code worker can still
// write there, so the card she reads and the question the turn is parked on can
// still come apart.

describe('a codex card rewritten in the shared spool', () => {
  const raise = (root) => {
    const cards = createCodexApprovals({ storeRoot: root, timeoutMs: 60_000, pollMs: 60_000 });
    const worker = cards.scope({ product: 'agentbox', item: 'w-1' });
    const decided = worker.handle('item/commandExecution/requestApproval', { command: 'rm -rf ~/Zero' });
    const id = cards.pending()[0];
    return { cards, decided, id };
  };

  it('is not the card the turn is parked on any more, and says so', () => {
    const { root, dir } = spool();
    const { cards, id } = raise(root);
    listPending(root);
    expect(cards.changed(id, cardShown(root, id))).toBe(false);

    // A Claude Code worker on the same Mac rewrites the Codex worker's card.
    const seen = JSON.parse(fs.readFileSync(path.join(dir, `${id}.request.json`), 'utf8'));
    write(dir, id, { ...seen, input: { command: 'echo hi' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      listPending(root);
      expect(cards.changed(id, cardShown(root, id))).toBe(true);
    } finally { warn.mockRestore(); }

    cards.close();
  });

  it('is changed for a digest that is missing or belongs to another card', () => {
    const { root } = spool();
    const { cards, id } = raise(root);
    listPending(root);

    expect(cards.changed(id, null)).toBe(true);
    expect(cards.changed(id, cardDigest(card(id, { command: 'echo hi' })))).toBe(true);
    cards.close();
  });

  // THE CASE THAT MUST NOT MATCH. A Claude Code worker's card is not a Codex
  // card, and asking about one must never turn her Allow into a deny.
  it('answers nothing for an id this engine has never heard of', () => {
    const { root } = spool();
    const { cards } = raise(root);

    expect(cards.changed('some-claude-card', null)).toBe(false);
    expect(cards.changed('some-claude-card', 'anything')).toBe(false);
    cards.close();
  });
});

/* ==================== and the door really asks the question ============== */
// main/ipc.mjs imports electron at module scope and cannot be loaded here, so
// the one door is asserted against its source, the way the other door tests in
// this suite are (tests/the-menu-answers-a-card-through-the-one-door.test.mjs).

describe('the one door every answer goes through', () => {
  const door = fs.readFileSync(path.join(here, '..', 'main', 'ipc.mjs'), 'utf8')
    .match(/const answerApproval = \(id, allow, note\) => \{[\s\S]*?\n {2}\};/)[0];

  it('binds her press to the card that was drawn before it records anything', () => {
    expect(door).toMatch(/approvals\.cardShown\(config\.storeRoot, id\)/);
    // Downgraded rather than refused, the same way a spool that will not take
    // the write is: what `allow` means after this line is what was recorded.
    expect(door).toMatch(/codexCardChanged/);
    expect(door).toMatch(/allow = false/);
  });
});

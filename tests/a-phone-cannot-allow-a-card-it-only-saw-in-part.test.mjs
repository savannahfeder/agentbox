// A PHONE CANNOT ALLOW A CARD IT ONLY SAW IN PART.
//
// What broke (found in the phone-approval audit, 2026-10-24): `phoneApproval`
// cleans a permission card for the phone -- it hides secret-shaped values,
// clips strings past 4000 chars, and drops nesting past depth 3 and lists past
// 40 -- but it still handed back `card`, the digest of the UNMODIFIED request.
// `zero:approve` allows anything whose digest is still current, so a tap of
// Allow on the phone signed the full request even though the phone had shown
// `[hidden]` or a clipped copy.
//
// Measured: digest a request with a secret in it the Mac's way (`cardDigest`),
// clean it for the phone, and ask `cardStillShown` about the card the phone
// would carry. Before the fix it said yes -- the full request, secret and all,
// approved from a screen that never showed it.
//
// The fix: a lossy clean carries no digest (`card: null`, `answerOnComputer:
// true`), so the Mac refuses a phone Allow and she answers on the computer
// where the request is shown in full. Only a lossless copy carries the digest.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { phoneApproval, checkCommand } from '../shared/phone-snapshot.mjs';
import { cardShown, cardStillShown, listPending, spoolDir } from '../main/approvals.mjs';

const HOME = '/Users/someone';
const KEY = 'sk-ant-oat01-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'; // a made-up key, to prove it is hidden. public-check: allow
const ask = (input) => ({ id: 'a-1', at: 1_700_000_000_000, product: 'alpha', item: 'w-1', tool: 'Bash', input });
const drawn = (input) => phoneApproval(ask(input), 'digest-1', { home: HOME });

describe('the card the phone draws', () => {
  it('carries no digest and asks for the computer when it hid a secret', () => {
    const card = drawn({ command: `curl -H "x-api-key: ${KEY}" https://x` });
    expect(card.card).toBeNull();
    expect(card.answerOnComputer).toBe(true);
    expect(JSON.stringify(card.input)).not.toContain(KEY);
  });

  it('carries no digest and asks for the computer when it clipped a string', () => {
    const card = drawn({ command: 'x'.repeat(4001) });
    expect(card.card).toBeNull();
    expect(card.answerOnComputer).toBe(true);
  });

  it('carries no digest and asks for the computer when it dropped deep nesting', () => {
    const card = drawn({ a: { b: { c: { d: { e: 1 } } } } });
    expect(card.card).toBeNull();
    expect(card.answerOnComputer).toBe(true);
  });

  it('carries no digest and asks for the computer when it truncated a long list', () => {
    const card = drawn({ files: Array.from({ length: 41 }, (_, i) => `f${i}`) });
    expect(card.card).toBeNull();
    expect(card.answerOnComputer).toBe(true);
  });

  // THE BOUNDARY ON THE OTHER SIDE OF EACH LIMIT is still lossless: a string of
  // exactly 4000 chars is not clipped, a container at depth 3 is not dropped,
  // and a list of 40 is kept whole, so each still carries the real digest.
  it('keeps the real digest at the edge of every limit', () => {
    expect(drawn({ command: 'x'.repeat(4000) })).toMatchObject({ card: 'digest-1' });
    expect(drawn({ a: { b: { c: { d: 1 } } } })).toMatchObject({ card: 'digest-1' });
    expect(drawn({ files: Array.from({ length: 40 }, (_, i) => `f${i}`) })).toMatchObject({ card: 'digest-1' });
    for (const card of [drawn({ command: 'x'.repeat(4000) }), drawn({ a: { b: { c: { d: 1 } } } })]) {
      expect(card.answerOnComputer).toBeUndefined();
    }
  });

  // THE CASE THAT MUST NOT REGRESS: a plain small request loses nothing on its
  // way to the phone, so it carries the real digest and can be allowed there.
  it('carries the real digest for a plain small request', () => {
    const card = drawn({ command: 'git status' });
    expect(card).toMatchObject({ id: 'a-1', tool: 'Bash', input: { command: 'git status' }, card: 'digest-1' });
    expect(card.answerOnComputer).toBeUndefined();
  });

  // A home path written `~` is for her eyes, not a value hidden from the signed
  // request, so it is not a loss: the card still carries its digest.
  it('keeps the real digest when it only rewrote her home path', () => {
    const card = drawn({ command: `cat ${HOME}/Zero/notes.txt` });
    expect(card.input.command).toBe('cat ~/Zero/notes.txt');
    expect(card).toMatchObject({ card: 'digest-1' });
    expect(card.answerOnComputer).toBeUndefined();
  });
});

describe('the Mac asked to allow a phone card', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-partial-')); });
  const write = (req) => { const dir = spoolDir(root); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${req.id}.request.json`), JSON.stringify(req)); };
  const opts = { projects: ['alpha'], hasItem: (_p, id) => id === 'w-1' };
  const approve = (card) => checkCommand({ project: 'alpha', item: 'w-1', kind: 'approve', payload: { approval: 'a-1', allow: true, card } }, opts);

  it('refuses the Allow for a card the phone only saw in part, and takes it whole', () => {
    // The whole request, with a secret in it, digested the Mac's way.
    const lossy = ask({ command: `aws configure set aws_secret_access_key ${KEY}` });
    write(lossy);
    listPending(root);
    const real = cardShown(root, 'a-1'); // the digest of the real request, as the Mac keeps it
    const card = phoneApproval(lossy, real, { home: HOME });
    // The phone cannot even form an answer without a digest, and the Mac would
    // refuse the real one it never carried.
    expect(card.card).toBeNull();
    expect(approve(card.card)).toBe('an answer needs its card');
    expect(cardStillShown(root, 'a-1', real)).toBe(true);
    expect(cardStillShown(root, 'a-1', card.card)).toBe(false);

    // A plain request loses nothing, so the phone carries the real digest and
    // the Mac allows it.
    const plain = ask({ command: 'git status' });
    write(plain);
    listPending(root);
    const realPlain = cardShown(root, 'a-1');
    const ok = phoneApproval(plain, realPlain, { home: HOME });
    expect(ok.card).toBe(realPlain);
    expect(approve(ok.card)).toBeNull();
    expect(cardStillShown(root, 'a-1', ok.card)).toBe(true);
  });
});

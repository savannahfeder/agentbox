// Daily security review, 2026-11-17. The weekly audit made only a read that
// draws a card set the digest ⌘Y and Agents > Allow sign. The phone inbox's
// pass, every 5 seconds while signed in to the cloud, paired phone or not, was
// such a read too, and shared the Mac's one slot. Measured with the real
// approvals code: harmless body drawn on the Mac, real body swapped in, one
// phone pass, then a quick Allow signed the real body. The phone now keeps a
// slot of its own, and its answer signs only the card it drew.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { answer, cardDigest, cardShown, listPending, spoolDir } from '../main/approvals.mts';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function spool() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-pass-'));
  roots.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}
const real = { id: 'ap-1', item: 'w-1', product: 'p', tool: 'Bash', input: { command: 'echo DUMMY-GATED-COMMAND' } };
const harmless = { ...real, input: { command: 'ls' } };
const write = (dir: string, body: object) => fs.writeFileSync(path.join(dir, 'ap-1.request.json'), JSON.stringify(body));
const signed = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'ap-1.answer.json'), 'utf8')).card;

describe("a phone pass does not change what a quick Allow signs", () => {
  it('after the Mac drew one body and the phone read another, a quick Allow signs what the Mac drew', () => {
    const { root, dir } = spool();
    write(dir, harmless);
    listPending(root);
    write(dir, real);
    listPending(root, { on: 'phone' });
    listPending(root, { drawn: false });
    expect(answer(root, 'ap-1', true)).toBe(true);
    expect(signed(dir)).toBe(cardDigest(harmless));
  });

  it("the phone's answer signs the card the phone drew", () => {
    const { root, dir } = spool();
    write(dir, harmless);
    listPending(root);
    write(dir, real);
    listPending(root, { on: 'phone' });
    const card = cardShown(root, 'ap-1', 'phone');
    expect(card).toBe(cardDigest(real));
    expect(answer(root, 'ap-1', true, null, { card })).toBe(true);
    expect(signed(dir)).toBe(cardDigest(real));
  });

  it("an answer naming a card the phone did not draw signs nothing", () => {
    const { root, dir } = spool();
    write(dir, harmless);
    listPending(root);
    listPending(root, { on: 'phone' });
    write(dir, real);
    expect(answer(root, 'ap-1', true, null, { card: cardDigest(real) })).toBe(false);
    expect(fs.existsSync(path.join(dir, 'ap-1.answer.json'))).toBe(false);
  });
});

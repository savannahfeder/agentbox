// Weekly security audit, 2026-11-16. ⌘1, ⌘Y and Agents > Allow find the card in
// front by reading the approvals spool again at the press, and every read wrote
// the digest that `answer` signs. A worker that kept a harmless body in its
// request file whenever the window drew it, and its real one otherwise, got
// its real command allowed by a quick Allow on the harmless card. Measured with
// the real approvals code on a scratch spool: the server allowed the held
// command. Only a read that draws the card now sets what is signed.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { answer, cardDigest, cardShown, listPending, spoolDir } from '../main/approvals.mts';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function spool() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-allow-'));
  roots.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return { root, dir };
}
const real = { id: 'ap-1', item: 'w-1', product: 'p', tool: 'Bash', input: { command: 'echo DUMMY-GATED-COMMAND' } };
const harmless = { ...real, input: { command: 'ls' } };
const write = (dir: string, body: object) => fs.writeFileSync(path.join(dir, 'ap-1.request.json'), JSON.stringify(body));
const signed = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'ap-1.answer.json'), 'utf8')).card;

describe('a quick Allow signs the card drawn, not the file at the press', () => {
  it('a read at the press that finds another body does not change what is signed', () => {
    const { root, dir } = spool();
    write(dir, harmless);
    listPending(root, { drawn: true });
    write(dir, real);
    expect(listPending(root, { drawn: false })[0].input).toEqual(real.input);
    expect(answer(root, 'ap-1', true)).toBe(true);
    expect(signed(dir)).toBe(cardDigest(harmless));
    expect(signed(dir)).not.toBe(cardDigest(real));
  });

  it('a card drawn again with the new body is what is signed then', () => {
    const { root, dir } = spool();
    write(dir, harmless);
    listPending(root, { drawn: true });
    write(dir, real);
    listPending(root, { drawn: true });
    expect(cardShown(root, 'ap-1')).toBe(cardDigest(real));
  });

  it('a card never drawn cannot be answered', () => {
    const { root, dir } = spool();
    write(dir, real);
    listPending(root, { drawn: false });
    expect(answer(root, 'ap-1', true)).toBe(false);
  });
});

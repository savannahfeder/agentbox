// A FILE A HAND-OVER NAMES IN A SENTENCE OPENS THE FILE IT CARRIES (2026-11-23).
//
// Rerun A, issues 1 and 3: Priya handed "Checkout style note" to Theo with
// "please use checkout-style.md as the starting point" in her words and the
// note attached, as `[checkout-style.md](attachments/mwtndebh-snyabk-checkout-style.md)`
// at the foot (Theo's ledger, w-1454d4970a). The bare name in the sentence is
// drawn as a link, and clicking it said "checkout-style.md is not in Direct.
// Nothing was opened.": the conversation keeps the file under its stamped name,
// the finder only matched a file named exactly checkout-style.md, and Priya's
// copy had told Theo's there was nothing behind the bare word. Measured by
// resolving the bare name in a conversation that carries the file.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact } from '../main/artifact-path.mts';
import { shelve } from '../main/team/carried-shelf.mts';

let dir: string;
let products: { slug: string; name: string; dir: string; team: { direct: boolean; projectId: string } }[];
const attach = (name: string, words: string, at: number) => {
  const file = path.join(dir, 'attachments', name);
  fs.writeFileSync(file, words);
  fs.utimesSync(file, at / 1000, at / 1000);
  return file;
};
beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'named-in-a-sentence-')), 'direct-1');
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  products = [{ slug: 'direct-1', name: 'Direct', dir, team: { direct: true, projectId: 'p' } }];
  // What the sender's copy says of a bare word it found nothing behind.
  shelve(dir, [{ ref: 'checkout-style.md', quiet: true, at: Date.now() }]);
});
afterEach(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));
const open = (src: string) => resolveArtifact({ src, product: 'direct-1', products });

describe('a bare file name in a conversation', () => {
  it('opens the file the conversation carries under that name', async () => {
    const file = attach('mwtndebh-snyabk-checkout-style.md', '# Checkout style', Date.now());
    const r = await open('checkout-style.md');
    expect(r).toMatchObject({ ok: true, path: file });
  });

  it('opens the newest of two copies of that name', async () => {
    attach('mwtndebh-snyabk-checkout-style.md', 'first', Date.now() - 60_000);
    const newer = attach('mwtnpns0-uip8b9-checkout-style.md', 'second', Date.now());
    expect(await open('checkout-style.md')).toMatchObject({ ok: true, path: newer });
  });

  it('does not open a carried file whose name only ends the same way', async () => {
    attach('mwtndebh-snyabk-old-checkout-style.md', 'old', Date.now());
    const r = await open('checkout-style.md');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/is not in Direct/);
  });

  it('still says a name nothing was carried for is not there', async () => {
    const r = await open('checkout-style.md');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/is not in Direct/);
  });
});

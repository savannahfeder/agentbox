// A chip at the foot of a card opens THIS product's file, or nothing.
//
// The finder tried every product's folders in turn, so a path an Agentbox worker
// wrote resolved under the app or Meadow whenever Agentbox had no such file.
// Nine of eleven chips on that card opened another product's code. Her answer:
// "Fix the finder so a card never opens another product's file, and say so
// plainly when it cannot find one."
//
// These pin both halves. The wrong file is the expensive failure: she cannot
// see that a chip lied, so she reads someone else's code believing it is ours.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, artifactRoots } from '../main/artifact-path.mjs';
import { machineryDir, machineryPath } from '../main/store/home.mjs';
import { NAME, Name } from '../shared/product-name.mjs';

// A store on disk with two products: ours has no code repo (Agentbox's real
// shape), theirs has one and holds a file with the same name.
function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-artifact-'));
  const accountRoot = path.join(root, 'accounts', 'acct');
  const ours = path.join(accountRoot, 'agentbox');
  const theirs = path.join(accountRoot, 'harbour');
  const theirRepo = path.join(root, 'code', 'harbour');
  for (const d of [path.join(ours, 'designs'), path.join(ours, 'attachments'), path.join(theirs, 'reports'), path.join(theirRepo, 'main')]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(theirs, 'reports', 'week-32.md'), 'their report');
  fs.writeFileSync(path.join(theirRepo, 'main', 'ipc.mjs'), 'their code');
  const products = [
    { slug: 'agentbox', dir: ours, name: NAME, repoPath: null },
    { slug: 'harbour', dir: theirs, name: 'Harbour', repoPath: theirRepo },
  ];
  return { root, accountRoot, ours, theirs, theirRepo, products };
}

const find = (s, src, product = 'agentbox') =>
  resolveArtifact({ src, product, products: s.products, accountRoot: s.accountRoot, storeRoot: s.root });

describe('a card never opens another product\'s file', () => {
  it('does not fall through to the product that happens to have the file', () => {
    const s = store();
    const out = find(s, 'reports/week-32.md');
    expect(out.ok).toBe(false);
    expect(out.path).toBeUndefined();
  });

  it('does not fall through by name either, which is how nine of eleven chips missed', () => {
    const s = store();
    // The by-name hunt is the last resort and the widest net. It walks our
    // trees only, so a file that exists ONLY under the app stays unfound.
    const out = find(s, 'main/ipc.mjs');
    expect(out.ok).toBe(false);
  });

  it('still finds our own file, under any root a worker might have used', () => {
    const s = store();
    fs.writeFileSync(path.join(s.ours, 'designs', 'round-3.html'), 'ours');
    fs.writeFileSync(path.join(s.ours, 'attachments', 'shot.png'), 'ours');
    expect(find(s, 'designs/round-3.html').path).toBe(path.join(s.ours, 'designs', 'round-3.html'));
    expect(find(s, 'round-3.html').path).toBe(path.join(s.ours, 'designs', 'round-3.html'));
    expect(find(s, 'shot.png').path).toBe(path.join(s.ours, 'attachments', 'shot.png'));
  });

  it('keeps the account-root retry, inside our own product', () => {
    const s = store();
    fs.writeFileSync(path.join(s.ours, 'notes.md'), 'ours');
    // A worker wrote the account root straight onto the file, no product slug.
    expect(find(s, path.join(s.accountRoot, 'notes.md')).path).toBe(path.join(s.ours, 'notes.md'));
  });

  it('does not use the account-root retry to reach another product', () => {
    const s = store();
    expect(find(s, path.join(s.accountRoot, 'reports', 'week-32.md')).ok).toBe(false);
  });

  it('opens an absolute path exactly as written, because that is not a guess', () => {
    const s = store();
    const said = path.join(s.theirs, 'reports', 'week-32.md');
    // Said in full. Refusing this would break every link into the app's own
    // repo, which is not a product at all.
    expect(find(s, said).path).toBe(said);
  });
});

describe('when it cannot find one, it says so', () => {
  it('hands back a sentence naming the file and the product', () => {
    const s = store();
    const out = find(s, 'reports/week-32.md');
    expect(out.error).toBe(`reports/week-32.md is not in ${NAME}. Nothing was opened.`);
  });

  it('says the project is not set up when the card belongs to no known product', () => {
    const s = store();
    const out = find(s, 'reports/week-32.md', 'kestrel');
    expect(out.ok).toBe(false);
    expect(out.error).toContain(`not set up in ${NAME}`);
  });

  it('never returns a bare code or an empty error', () => {
    const s = store();
    for (const src of ['reports/week-32.md', 'main/ipc.mjs', '/nowhere/at/all.md']) {
      const out = find(s, src);
      expect(out.ok).toBe(false);
      expect(out.error.length).toBeGreaterThan(20);
      expect(out.error.endsWith('.')).toBe(true);
    }
  });
});

describe('the roots a relative path is tried against', () => {
  // THE APP'S OWN HOME FOR THIS PRODUCT IS THE FOURTH, AND IT IS LAST.
  // `runs/<item>/the-change-it-made.change` left her folder when the move
  // landed, and the pane asks for it by that exact relative path, so without
  // this root it resolved to nothing of hers and the by-name hunt handed back
  // another card's record instead. Last in the list on purpose: a file of hers
  // always wins over one of ours.
  it('is the docs dir, designs, attachments, the repo and our home, and nothing outside the product', () => {
    const s = store();
    expect(artifactRoots(s.products[0])).toEqual([
      s.ours, path.join(s.ours, 'designs'), path.join(s.ours, 'attachments'), machineryDir(s.ours),
    ]);
    expect(artifactRoots(null)).toEqual([]);
  });

  // The measured symptom, pinned so it cannot come back: two cards, each with
  // its own run record in the home, and each asking for its own.
  it('opens this card own change record and never another card one', () => {
    const s = store();
    const mine = machineryPath(s.ours, 'runs/w-86377d7fea/the-change-it-made.change');
    const theirs = machineryPath(s.ours, 'runs/w-71210efd70/the-change-it-made.change');
    for (const [f, text] of [[mine, '{"item":"w-86377d7fea"}'], [theirs, '{"item":"w-71210efd70"}']]) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, text);
    }

    const got = find(s, 'runs/w-86377d7fea/the-change-it-made.change');

    expect(got.ok).toBe(true);
    expect(got.path).toBe(mine);
    expect(fs.readFileSync(got.path, 'utf8')).toBe('{"item":"w-86377d7fea"}');
  });

  // AND WHEN IT IS NOT THERE, IT SAYS SO RATHER THAN GUESSING. Every card's
  // record has the identical basename, so the hunt would always find one.
  it('says nothing rather than hand back a stranger change record', () => {
    const s = store();
    const other = machineryPath(s.ours, 'runs/w-9352d560c7/the-change-it-made.change');
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(other, '{"item":"w-9352d560c7"}');

    expect(find(s, 'runs/w-5413d258b4/the-change-it-made.change').ok).toBe(false);
  });
});

// THE PRACTICE PROJECT IS JUST YOU (w-fbe5e95dea, 2026-11-10).
//
// Every new project starts as just you (w-b989839656): its threads reach the
// Team page only once shared. The practice project was made by its own path,
// which predates that rule and wrote no `seenBy`, so it read as the team's.
// Walking the setup signed in, the new-thread box on the practice thread said
// "Team" where a project made from a chat said "Private". Measured by running
// the store's createPractice and reading the project back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { projectSeenBy } from '../shared/thread-cards.mts';
import { PRACTICE_SLUG } from '../shared/first-run-practice.mts';

function freshStore() {
  const account = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-practice-seen-'));
  process.env.ASTRAL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-practice-seen-home-'));
  return { store: new Store({ accountRoot: account, products: [], personalProducts: [] }), account };
}

describe('the practice project', () => {
  it('is seen by nobody but you, as every new project is', () => {
    const { store, account } = freshStore();
    store.createPractice();
    const practice = store.listProducts().find((p) => p.slug === PRACTICE_SLUG);
    expect(practice?.practice).toBe(true);
    expect(projectSeenBy(practice!).who).toBe('private');
    fs.rmSync(account, { recursive: true, force: true });
  });
  it('is the same as a project made by hand', () => {
    const { store, account } = freshStore();
    store.createPractice();
    const made = store.createProduct({ name: 'Second' });
    const all = store.listProducts();
    const seen = (slug: string) => projectSeenBy(all.find((p) => p.slug === slug)!).who;
    expect(seen(PRACTICE_SLUG)).toBe(seen(made.slug));
    fs.rmSync(account, { recursive: true, force: true });
  });
});

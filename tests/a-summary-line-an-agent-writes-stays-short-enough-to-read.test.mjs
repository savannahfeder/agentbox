// A SUMMARY LINE AN AGENT WRITES STAYS SHORT ENOUGH TO READ (w-b51b2e1c86).
//
// The brief asked for "a sentence or two each" and nothing held it. On
// 2026-10-04 a thread's summary ran 50, 63 and 95 words, the panel scrolled
// and its properties went off the bottom of the window, and the user said they
// would never read even that much. Measured across the 85 agent-written
// summaries on their store that day: a median of 30 to 36 words a line, the
// longest 219.
//
// So a line an agent writes is at most SUMMARY_WORDS words, which is about
// four lines of the panel. The store tool is where every worker's write goes
// through, so the rule lives there and no brief has to be remembered for it to
// hold. An over-long line is NOT cut: a cut sentence says less than a short
// one. It is refused, the rest of the write still lands, and the agent is told
// which line, how long it was, and to send it again shorter. The person's own
// edits in the panel are theirs and are not limited.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { SUMMARY_WORDS, wordsIn } from '../shared/thread-cards.mjs';

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('a summary line an agent writes', () => {
  let product; let work; let store; let dir; let claims;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Summary ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mjs');
    store = await import('../main/store/work-items.mjs');
    dir = path.join(home, 'accounts', 'acct', product.id);
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });

  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const agentRow = () => work.createItem(product.id, { title: 'Tidy the settings page' });

  it('is 25 words at most', () => {
    expect(SUMMARY_WORDS).toBe(25);
  });

  it('counts words the way a reader does', () => {
    expect(wordsIn('One sentence, plainly put.')).toBe(4);
    expect(wordsIn('  spaced\n\tout  ')).toBe(2);
    expect(wordsIn('')).toBe(0);
  });

  it('lands when it is exactly the limit', async () => {
    const row = agentRow();
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { solution: words(SUMMARY_WORDS) });
    expect(after.solution).toBe(words(SUMMARY_WORDS));
    expect(after.summaryTooLong).toBeUndefined();
  });

  it('is refused one word over, says which line and how long, and keeps the old one', async () => {
    const row = agentRow();
    await claims.claim({ id: row.id });
    await claims.update(row.id, { solution: 'The page is tidy.' });
    const after = await claims.update(row.id, { solution: words(SUMMARY_WORDS + 1) });
    expect(after.solution).toBe('The page is tidy.');
    expect(after.summaryTooLong).toMatch(/solution/);
    expect(after.summaryTooLong).toMatch(/26 words/);
    expect(after.summaryTooLong).toMatch(/25/);
    expect(store.readWorkItem(dir, row.id).solution).toBe('The page is tidy.');
  });

  it('lets the rest of the write land, the short lines included', async () => {
    const row = agentRow();
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, {
      note: 'Halfway.', problem: 'The settings page is cluttered.', progress: words(60), solution: words(40),
    });
    expect(after.note).toBe('Halfway.');
    expect(after.problem).toBe('The settings page is cluttered.');
    expect(after.progress ?? null).toBeNull();
    expect(after.solution ?? null).toBeNull();
    expect(after.summaryTooLong).toMatch(/progress/);
    expect(after.summaryTooLong).toMatch(/solution/);
    expect(after.summaryTooLong).not.toMatch(/problem/);
  });

  it('still lets an agent clear a line', async () => {
    const row = agentRow();
    await claims.claim({ id: row.id });
    await claims.update(row.id, { progress: 'Halfway.' });
    const after = await claims.update(row.id, { progress: '' });
    expect(after.progress).toBe('');
    expect(after.summaryTooLong).toBeUndefined();
  });

  it('is said on a row the user wrote that was left open, too', async () => {
    const row = work.createItem(product.id, { title: 'Word a note', body: 'Help me.', labels: ['founder'] }, { source: 'founder' });
    await claims.claim({ id: row.id });
    const after = await claims.update(row.id, { status: 'done', result: 'Here it is.', solution: words(30) });
    expect(after.leftOpen).toMatch(/left OPEN/);
    expect(after.summaryTooLong).toMatch(/solution/);
  });

  it('does not limit the person editing it themselves', () => {
    const row = agentRow();
    const after = store.updateWorkItem(dir, row.id, { solution: words(60) }, { source: 'founder' });
    expect(after.solution).toBe(words(60));
  });
});

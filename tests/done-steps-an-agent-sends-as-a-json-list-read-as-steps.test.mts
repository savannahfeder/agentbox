// An agent stored `progress` as a JSON array string, and every reader split it only on
// newlines, so a hand-over and a teammate's thread drew ["Wrote runbook","Read both branches",...] as one step.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { doneSteps } from '../shared/thread-cards.mts';

const LIST = '["Wrote runbook","Read both branches","Rewrote as if merged","Committed"]';

describe('reading done steps', () => {
  it('reads a JSON list of steps as those steps', () => {
    expect(doneSteps(LIST)).toEqual(['Wrote runbook', 'Read both branches', 'Rewrote as if merged', 'Committed']);
    expect(doneSteps(`  ${LIST}\n`)).toEqual(['Wrote runbook', 'Read both branches', 'Rewrote as if merged', 'Committed']);
  });
  it('drops blank entries and the marks in front of a step', () => {
    expect(doneSteps('["- Found it", "", "✓ Fixed it"]')).toEqual(['Found it', 'Fixed it']);
  });
  it('keeps a step that only starts with a bracket', () => {
    expect(doneSteps('[WIP] Found the bug\nFixed it')).toEqual(['[WIP] Found the bug', 'Fixed it']);
  });
  it('keeps a JSON list that is not all words as it was written', () => {
    expect(doneSteps('[1, 2]')).toEqual(['[1, 2]']);
    expect(doneSteps('["unclosed"')).toEqual(['["unclosed"']);
  });
  it('still reads one step per line', () => {
    expect(doneSteps('Found the bug\nFixed it')).toEqual(['Found the bug', 'Fixed it']);
  });
});

describe('an agent writing them', () => {
  let product: { id: string };
  let work: typeof import('../mcp/core/work.mts');
  let claims: ReturnType<typeof import('../mcp/core/work.mts')['createClaimRegistry']>;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Steps ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mts');
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });
  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const row = async () => { const r = work.createItem(product.id, { title: 'Write the runbook' }); await claims.claim({ id: r.id }); return r; };

  it('stores a JSON list as one step per line', async () => {
    const r = await row();
    const after = await claims.update(r.id, { progress: LIST });
    expect(after.progress).toBe('Wrote runbook\nRead both branches\nRewrote as if merged\nCommitted');
  });
  it('stores steps written one per line as they were sent', async () => {
    const r = await row();
    const after = await claims.update(r.id, { progress: '- Wrote runbook\nCommitted' });
    expect(after.progress).toBe('- Wrote runbook\nCommitted');
  });
  it('still refuses a JSON list of seven steps', async () => {
    const r = await row();
    const after = await claims.update(r.id, { progress: JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', 'g']) });
    expect(after.progress ?? null).toBeNull();
    expect(after.summaryTooLong).toMatch(/7 steps/);
  });
});

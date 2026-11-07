// AN AGENT WRITES A FEW SENTENCES OF CONTEXT AND A SHORT LIST OF DONE STEPS
// (w-54e9c7243f, 2026-10-05).
//
// What changed: the summary was problem, progress and solution, one sentence
// each. Over seven rounds of pictures the user found that one sentence of
// "problem" did not bring a thread back to mind ("the goal doesn't really add
// much beyond the header"), that "solution" said nothing a reader needed, and
// that what they wanted under the context was what had been done, as a
// timeline. So the summary is now Context (the `problem` field, a few
// sentences) and Done (the `progress` field, one step per line, newest last).
// `solution` is no longer asked for or drawn.
//
// Measured on the mockups: about 35 words of context filled five lines of the
// panel and was enough to answer from; done steps ran 4 to 15 words, and six of
// them still left the properties on screen. The store tool holds an agent to
// those, the same way it held the old single line (refused, never cut).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { CONTEXT_WORDS, DONE_STEPS, DONE_STEP_WORDS, doneSteps } from '../shared/thread-cards.mjs';

const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const steps = (n, len = 4) => Array.from({ length: n }, () => words(len)).join('\n');

describe('the limits', () => {
  it('are 45 words of context, and six done steps of 15 words each', () => {
    expect(CONTEXT_WORDS).toBe(45);
    expect(DONE_STEPS).toBe(6);
    expect(DONE_STEP_WORDS).toBe(15);
  });
});

describe('reading the done steps', () => {
  it('is one step per line, in the order written', () => {
    expect(doneSteps('Found the bug\nFixed it\nTests pass')).toEqual(['Found the bug', 'Fixed it', 'Tests pass']);
  });
  it('drops blank lines and the marks a writer puts in front of a step', () => {
    expect(doneSteps('- Found the bug\n\n  ✓ Fixed it  \n* Tests pass\n• Shipped')).toEqual(['Found the bug', 'Fixed it', 'Tests pass', 'Shipped']);
  });
  it('reads an older one-sentence progress as one step', () => {
    expect(doneSteps('Terms are drafted at 8% over last year.')).toEqual(['Terms are drafted at 8% over last year.']);
  });
  it('is no steps for nothing', () => {
    expect(doneSteps('')).toEqual([]);
    expect(doneSteps('  \n ')).toEqual([]);
    expect(doneSteps(undefined)).toEqual([]);
  });
});

describe('an agent writing them', () => {
  let product; let work; let claims;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = 'acct';
    fs.mkdirSync(path.join(home, 'accounts', 'acct'), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Context ${Math.random().toString(36).slice(2, 8)}`);
    work = await import('../mcp/core/work.mjs');
    claims = work.createClaimRegistry({ holder: 'test-worker', heartbeatMs: 60_000 });
  });
  afterEach(() => { claims._stop(); delete process.env.STORE_ACCOUNT_ID; });

  const row = async () => { const r = work.createItem(product.id, { title: 'Fix the flicker' }); await claims.claim({ id: r.id }); return r; };

  it('lands context of exactly 45 words', async () => {
    const r = await row();
    const after = await claims.update(r.id, { problem: words(45) });
    expect(after.problem).toBe(words(45));
    expect(after.summaryTooLong).toBeUndefined();
  });

  it('refuses context one word over, and says it is the context', async () => {
    const r = await row();
    const after = await claims.update(r.id, { problem: words(46) });
    expect(after.problem ?? null).toBeNull();
    expect(after.summaryTooLong).toMatch(/context/i);
    expect(after.summaryTooLong).toMatch(/46 words/);
  });

  it('lands six done steps of 15 words', async () => {
    const r = await row();
    const after = await claims.update(r.id, { progress: steps(6, 15) });
    expect(after.progress).toBe(steps(6, 15));
    expect(after.summaryTooLong).toBeUndefined();
  });

  it('refuses a seventh step', async () => {
    const r = await row();
    const after = await claims.update(r.id, { progress: steps(7) });
    expect(after.progress ?? null).toBeNull();
    expect(after.summaryTooLong).toMatch(/7 steps/);
  });

  it('refuses a step of 16 words, and lands the rest of the write', async () => {
    const r = await row();
    const after = await claims.update(r.id, { note: 'Halfway.', problem: 'Cards flicker in Safari.', progress: `Found it\n${words(16)}` });
    expect(after.note).toBe('Halfway.');
    expect(after.problem).toBe('Cards flicker in Safari.');
    expect(after.progress ?? null).toBeNull();
    expect(after.summaryTooLong).toMatch(/16 words/);
  });
});

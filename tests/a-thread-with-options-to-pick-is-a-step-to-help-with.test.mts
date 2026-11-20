// A THREAD WITH OPTIONS TO PICK IS A STEP TO HELP WITH (2026-11-20).
//
// Hand-over fixer's finding on the rerun: Sam's agent ended "The test is
// fixed and committed." with Ship it / Discard as options and no question
// mark. Help was picked only for a line ending in "?", so Share… started on
// nothing, Waits on… on Review, and the quoted step was "The test is fixed…"
// rather than the decision. A message with options is a decision: both doors
// now start on Help and quote the options; anything else starts on Review in
// both. Measured on the step rule and the menu's wiring.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { latestStep, firstWant } from '../shared/thread-ask.mts';

const said = (result: string) => ({ result, wrote: { result: { ts: 5 } } });

describe('the step and what the sheet starts on', () => {
  it('options with no question are a decision: Help, quoting the options', () => {
    const step = latestStep(said('The test is fixed and committed.\n\n## Options\n1. Ship it (recommended)\n2. Discard'));
    expect(step).toEqual({ at: 5, words: 'Ship it or Discard', decides: true });
    expect(firstWant(step)).toBe('help');
  });
  it('a question quotes the question and starts on Help', () => {
    const step = latestStep(said('I checked the handler.\n\n**Where should keys be stored?**\n\n## Options\n1. Postgres\n2. Redis'));
    expect(step).toMatchObject({ words: 'Where should keys be stored?', decides: true });
    expect(firstWant(step)).toBe('help');
  });
  it('three options read as a list', () => {
    expect(latestStep(said('Pick one.\n\n## Options\n1. A\n2. B\n3. C'))?.words).toBe('A, B or C');
  });
  it('a plain finished answer starts on Review, and nothing said yet too', () => {
    const step = latestStep(said('Done. The tests pass.'));
    expect(step).toMatchObject({ words: 'Done. The tests pass.', decides: false });
    expect(firstWant(step)).toBe('review');
    expect(firstWant(null)).toBe('review');
  });
  it('Share… and Waits on… start on the same choice', () => {
    const menu = fs.readFileSync(new URL('../renderer/src/threads/ThreadMenu.tsx', import.meta.url), 'utf8');
    expect(menu).not.toContain('wantFirst(');
    expect(menu.match(/firstWant\(step\)/g)?.length).toBe(4);
    expect(menu).not.toMatch(/firstWant\(step\) \?\?/);
  });
});

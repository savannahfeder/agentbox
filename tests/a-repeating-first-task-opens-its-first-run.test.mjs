// A REPEATING FIRST TASK OPENS ITS FIRST RUN (w-31c71743b5, 2026-10-29).
//
// The first task opens by itself once its row exists. A repeating task is sent
// as a rule, not a row, so the send handed back no id, and walking the
// "Summarize this week's AI news" idea in a fresh window left the run sitting
// in In progress with nothing opened. The run is found by its rule's label.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const { runOfRule } = await import('../renderer/src/first-run.ts');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the first run of a repeating first task', () => {
  const rows = [
    { id: 'w-1', labels: ['founder'] },
    { id: 'r-ab-20261026', labels: ['founder', 'repeat:r-ab'] },
    { id: 'r-abc-20261026', labels: ['founder', 'repeat:r-abc'] },
  ];
  it('is the row carrying its rule’s label', () => {
    expect(runOfRule('r-ab', rows)).toBe('r-ab-20261026');
    expect(runOfRule('r-abc', rows)).toBe('r-abc-20261026');
  });
  it('is nothing until that row exists', () => {
    expect(runOfRule('r-zz', rows)).toBeNull();
    expect(runOfRule('r-ab', [])).toBeNull();
  });
  it('is what the app follows and opens once the send says it was a repeat', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain("if (firstSend.current && how?.kind === 'repeat' && how.ruleId) { firstSend.current = false; setFirstRule(how.ruleId); }");
    expect(app).toContain('const run = runOfRule(firstRule, [...inbox, ...progress]);');
  });
});

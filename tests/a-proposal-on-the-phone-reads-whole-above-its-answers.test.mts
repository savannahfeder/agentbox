// A PROPOSAL ON THE PHONE READS WHOLE ABOVE ITS ANSWERS (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 27 (logged twice): "Plan the phone app"
// showed its waiting proposal as "Add a rep…" on one line beside Dismiss, Do
// here and New thread, so the tester had to guess what they were approving.
// A proposal's title now takes up to three lines, with its answers under it.
// On 2026-11-04 the founder picked the look from five: a cross to dismiss
// beside the title, and Do here and New thread as two equal buttons under it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync('mobile/src/ui/ThreadParts.tsx', 'utf8');
const filed = parts.slice(parts.indexOf('export function FiledList'), parts.indexOf('export function OptionsCard'));
const row = parts.slice(parts.indexOf('function ProposalRow'), parts.indexOf('export function FiledList'));

describe('a waiting proposal in a thread', () => {
  it('is drawn by its own row, its title given up to three lines', () => {
    expect(filed).toMatch(/if \(r\.approve\) return <ProposalRow /);
    expect(row).toMatch(/numberOfLines=\{3\}[^>]*>\{r\.title\}/);
  });
  it('dismisses from a cross beside the title, before the buttons', () => {
    const cross = row.indexOf('`${DISMISS}: ${r.title}`');
    expect(cross).toBeGreaterThan(row.indexOf('{r.title}</T>'));
    expect(cross).toBeLessThan(row.indexOf('<Btn '));
    expect(row).toMatch(/M6 6 18 18M18 6 6 18/);
  });
  it('puts Do here and New thread under it as two equal buttons, New thread filled', () => {
    expect(row).toMatch(/<Btn title=\{DO_HERE\} label=\{`Do in this thread: \$\{r\.title\}`\}/);
    expect(row).toMatch(/<Btn primary title=\{START_NEW\} label=\{`Start new thread: \$\{r\.title\}`\}/);
    expect(parts).toMatch(/flexGrow: 1, flexBasis: 0/);
  });
  it('a thread it filed that is not waiting stays on one line with its state', () => {
    expect(filed).toMatch(/numberOfLines=\{1\}[^>]*>\{r\.title\}/);
    expect(filed).toMatch(/stateWord\(r\.state\)/);
  });
});

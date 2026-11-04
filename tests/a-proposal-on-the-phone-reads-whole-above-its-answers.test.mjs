// A PROPOSAL ON THE PHONE READS WHOLE ABOVE ITS ANSWERS (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 27 (logged twice): "Plan the phone app"
// showed its waiting proposal as "Add a rep…" on one line beside Dismiss, Do
// here and New thread, so the tester had to guess what they were approving.
// A proposal's title now takes up to three lines, with its answers under it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const parts = fs.readFileSync('mobile/src/ui/ThreadParts.tsx', 'utf8');
const filed = parts.slice(parts.indexOf('export function FiledList'), parts.indexOf('export function OptionsCard'));
const row = parts.slice(parts.indexOf('function ProposalRow'), parts.indexOf('export function FiledList'));

describe('a waiting proposal in a thread', () => {
  it('is drawn by its own row, with its title over its answers', () => {
    expect(filed).toMatch(/if \(r\.approve\) return <ProposalRow /);
    expect(row).toMatch(/numberOfLines=\{lines\}[^>]*>\{r\.title\}/);
    expect(row).toMatch(/\{title\(3\)\}/);
  });
  it('still answers with New thread, Do here and Dismiss', () => {
    expect(row).toContain('`Start new thread: ${r.title}`');
    expect(row).toContain('`Do in this thread: ${r.title}`');
    expect(row).toContain('`Dismiss: ${r.title}`');
  });
  it('a thread it filed that is not waiting stays on one line with its state', () => {
    expect(filed).toMatch(/numberOfLines=\{1\}[^>]*>\{r\.title\}/);
    expect(filed).toMatch(/stateWord\(r\.state\)/);
  });
});

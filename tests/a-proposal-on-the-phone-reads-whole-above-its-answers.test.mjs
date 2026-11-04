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

describe('a waiting proposal in a thread', () => {
  it('gives its title up to three lines', () => {
    expect(filed).toMatch(/if \(r\.approve\) return \(/);
    expect(filed).toMatch(/numberOfLines=\{3\}[^>]*>\{r\.title\}/);
  });
  it('puts Dismiss, Do here and New thread on the line under it', () => {
    const block = filed.slice(filed.indexOf('if (r.approve) return ('), filed.indexOf('return (\n            <View key={r.id} style={{ flexDirection: \'row\''));
    expect(block.indexOf('{r.title}')).toBeLessThan(block.indexOf('DISMISS'));
    expect(block).toMatch(/START_NEW/);
  });
  it('a thread it filed that is not waiting stays on one line with its state', () => {
    expect(filed).toMatch(/numberOfLines=\{1\}[^>]*>\{r\.title\}/);
    expect(filed).toMatch(/stateWord\(r\.state\)/);
  });
});

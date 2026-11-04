// THREADS ON THE PHONE CAN BE CLOSED TOGETHER (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 32: at the end of the day a tester looked in
// View and filters and Board and tried swiping, and found only Done thread by
// thread. The desktop selects many and closes them in one go. The phone now
// does: long-press a thread, or Select threads in View, tap the others, Close.
// Each close is the one Done sends, so each is a close the computer takes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const filters = fs.readFileSync('mobile/src/ui/Filters.tsx', 'utf8');
const cloud = fs.readFileSync('mobile/src/state/cloud.tsx', 'utf8');

describe('picking threads on the phone', () => {
  it('starts from a long-press on a thread', () => {
    expect(inbox).toMatch(/onLongPress=\{\(\) => pick\.start\(row\.key\)\}/);
  });
  it('starts from Select threads in View, where the tester looked', () => {
    expect(filters).toMatch(/label="Select threads"/);
    expect(inbox).toMatch(/onSelect=\{rows\.length && !board \?/);
  });
  it('a tap while picking picks, rather than opening the thread', () => {
    expect(inbox).toMatch(/onPress=\{\(\) => \(picking \? pick\.toggle\(row\.key\) : open\(row\.product, row\.id\)\)\}/);
  });
  it('closes each with the press Done sends, one toast for all of them', () => {
    expect(inbox).toMatch(/await c\.send\(\{ kind: 'close' \}, r\.item, \{ quiet: true \}\)/);
    expect(inbox).toMatch(/c\.say\(`Closed \$\{done\} \$\{done === 1 \? 'thread' : 'threads'\}`\)/);
    expect(cloud).toMatch(/if \(plan\.toast && !opts\.quiet\)/);
  });
  it('says how far it got if one fails', () => {
    expect(inbox).toMatch(/Closed \$\{done\} of \$\{chosen\.length\}/);
  });
});

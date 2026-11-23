// The phone parity audit of 2026-11-21 found the phone inbox on older desktop
// choices. Its empty In progress, Later and Done kept hand-copied sentences
// the desktop shortened in 6fa8e7cf8 ("Nothing is waiting for later.",
// "Nothing done yet. Finished threads wait in Needs you."), drawn left and dim
// where the desktop centres one faint line. An empty board column still said
// "Nothing here." (the desktop leaves it blank since the same commit), every
// board card wore priority bars where the desktop draws none at Medium
// (dc5d02a47), and with no team the page was titled Threads where the
// desktop's phone layout says Inbox.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyTabWords, rowPriorityId } from '../renderer/src/threads/page-rules';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');

describe("the phone inbox's empty tabs", () => {
  it('say the words the desktop says, read from the same rule', () => {
    expect(inbox).toMatch(/emptyTabWords\(tab, false, counts\.inbox\)/);
    expect(inbox).not.toMatch(/"Add it to Later" on a new thread writes one down/);
    expect(inbox).not.toMatch(/Nothing closed yet/);
  });
  it('the rule says what the desktop shows', () => {
    expect(emptyTabWords('snoozed')).toBe('Nothing is waiting for later.');
    expect(emptyTabWords('done')).toBe('Nothing done yet. Finished threads wait in Needs you.');
    expect(emptyTabWords('progress', false, 2)).toBe('Nothing is running. 2 threads wait in Needs you.');
    expect(emptyTabWords('progress', false, 0)).toBe('Nothing is running.');
  });
  it('are one centred faint line, as `.th-empty` draws it', () => {
    expect(inbox).toMatch(/textAlign: 'center', fontSize: 14, lineHeight: 21, color: color\.faint \}\}>\{emptyTabWords/);
  });
});

describe("the phone inbox's board", () => {
  it('leaves an empty column blank', () => {
    expect(inbox).not.toMatch(/>Nothing here\.</);
  });
  it('draws no priority mark on a card at Medium, and bars for the rest', () => {
    expect(inbox).toMatch(/rowPriorityId\(e\.priority\) && <View style=\{\{ marginRight: 8 \}\}><PriorityBars level=\{barsFor\(e\.priority!\)\} \/>/);
    expect(rowPriorityId(5)).toBeNull();
    expect(rowPriorityId(9)).toBe('urgent');
    expect(rowPriorityId(2)).toBe('low');
  });
});

describe("the phone inbox's title", () => {
  it('is Inbox with a team or without, as on the desktop', () => {
    expect(inbox).toMatch(/<TopBar title="Inbox"/);
    expect(inbox).not.toMatch(/'Threads'/);
  });
});

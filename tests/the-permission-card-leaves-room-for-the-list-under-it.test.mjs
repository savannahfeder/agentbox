// THE PERMISSION CARD LEAVES ROOM FOR THE LIST UNDER IT (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 35, and rechecked 2026-11-03: a permission
// card sits across the foot of every screen, and the inbox and Chats lists
// ended under it, so the last rows (Launch week, Maya C.) could not be reached
// and a tap on them hit the card. The card now says how tall it is, and the
// lists leave that much room to scroll their last rows above it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

describe('the permission card and the lists under it', () => {
  it('the card reports its height, and nothing once it is gone or put aside', () => {
    const card = read('mobile/src/ui/Approvals.tsx');
    expect(card).toMatch(/onLayout=\{\(e\) => c\.setApprovalRoom\(/);
    expect(card).toMatch(/useEffect\(\(\) => \{ if \(!shown\) c\.setApprovalRoom\(0\); \}, \[shown\]\)/);
  });
  it('the inbox list, its board and Chats leave that room', () => {
    expect(read('mobile/src/app/index.tsx')).toMatch(/paddingBottom: Math\.max\(picked \? 120 : 96, c\.approvalRoom \+ 16\)/);
    expect(read('mobile/src/app/index.tsx')).toMatch(/paddingBottom: Math\.max\(88 \+ foot, room \+ 16\)/);
    expect(read('mobile/src/ui/Teammates.tsx')).toMatch(/paddingBottom: Math\.max\(40, c\.approvalRoom \+ 16\)/);
  });
  it('a thread, a teammate and a group lift their reply box and buttons above it (round 2 of the 2026-11-03 testers, issues 11 and 12)', () => {
    expect(read('mobile/src/app/thread/[product]/[id].tsx')).toMatch(/<KeyboardAvoidingView style=\{\{ flex: 1, paddingBottom: c\.approvalRoom \? Math\.max\(0, c\.approvalRoom \+ 6 - footRoom\(inset\)\) : 0 \}\}/);
    expect(read('mobile/src/app/teammate/[id].tsx')).toMatch(/<KeyboardAvoidingView style=\{\{ flex: 1, paddingBottom: c\.approvalRoom \}\}/);
  });
});

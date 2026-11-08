// LEAVING THE AI NOTICE WITHOUT ANSWERING LETS THE REPLY BOX GO.
//
// A send that needs the yes before words go to Claude Code or Codex opens the
// notice and waits for Allow or Not now. Swiping back, or anything else that
// left the screen, answered neither, so the send waited for ever and the reply
// box stayed on "Sending…". Found by a mock App Store reviewer on the app
// review board (2026-11-08). Now leaving the screen counts as no for what was
// waiting, without recording a no: the next send asks again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');

describe('the cloud state', () => {
  const cloud = read('state/cloud.tsx');
  it('can let go of the sends waiting on the notice, as a no, without keeping an answer', () => {
    const leave = cloud.slice(cloud.indexOf('const leaveNotice = useCallback'), cloud.indexOf('const askNotice'));
    expect(leave).toMatch(/for \(const go of noticeWaiters\.current\.splice\(0\)\) go\(false\)/);
    expect(leave).not.toMatch(/persist\.write|setNotice/);
    expect(cloud).toMatch(/leaveNotice,/);
  });
});

describe('the notice screen', () => {
  it('lets go of them when it leaves the screen, answered or not', () => {
    const notice = read('app/ai-notice.tsx');
    expect(notice).toMatch(/useEffect\(\(\) => \(\) => leave\.current\(\), \[\]\)/);
    expect(notice).toMatch(/leave\.current = c\.leaveNotice/);
  });
});

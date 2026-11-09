// THE PHONE APP SENDS YOUR FIRST THREAD ONCE YOU SAY YES (w-e4d49a1539).
//
// Three synthetic users on the phone app's preview all lost their first send
// (phone-workday-1, 2026-11-01), and reproducing it found two faults:
// - the permission card is drawn over every screen, the notice "Where your
//   messages go" included, so it covered Continue and a tap there opened the
//   card's thread instead;
// - a send that needed the notice threw "Not sent yet. Your agent needs your
//   yes first." and was dropped, so after Continue the box read "Not sent: Not
//   sent yet…" and Send had to be pressed again.
// Now the card stays off the notice, and the send waits for the answer: a yes
// sends it, a no says nothing went. The screens are React Native, so this
// reads the sources, as the other phone tests do.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../mobile/src/${p}`, import.meta.url), 'utf8');

describe('the permission card', () => {
  it('is not drawn over the notice', () => {
    const cards = read('ui/Approvals.tsx');
    expect(cards).toMatch(/usePathname/);
    expect(cards).toMatch(/FIRST_RUN_SCREENS = new Set\(\[[^\]]*'\/ai-notice'/);
    expect(cards).toMatch(/if \(FIRST_RUN_SCREENS\.has\(pathname\)\) return null;/);
  });
});

describe('a send that needs the notice', () => {
  const cloud = read('state/cloud.tsx');

  it('waits for the answer instead of being dropped', () => {
    expect(cloud).not.toMatch(/Not sent yet\. Your agent needs your yes first/);
    expect(cloud).toMatch(/await askNotice\(\)/);
  });

  it('is answered by the notice itself, yes or no', () => {
    expect(cloud).toMatch(/noticeWaiters\.current/);
    expect(cloud).toMatch(/const answerNotice = useCallback\(\(yes: boolean\) => \{[\s\S]*?noticeWaiters\.current/);
  });

  it('says nothing went when the answer is no', () => {
    expect(cloud).toMatch(/Nothing went to an agent/);
  });

  it('is the same for a message to a teammate', () => {
    expect(cloud.match(/await askNotice\(\)/g)).toHaveLength(2);
  });
});

// Logged three times in the same workday: the toast read "Started in" and
// stopped, because the form never said which project the thread went to.
describe('the toast after a new thread', async () => {
  const { planFor } = await import('../mobile/src/lib/actions');
  it('names the project it started in', () => {
    expect(planFor({ kind: 'new', product: 'dev/agentbox', text: 'Fix it', to: 'Agentbox' }, null, Date.now()).toast).toMatch(/^Started in Agentbox/);
  });
  it('is told the project by the form', () => {
    expect(read('ui/NewThreadForm.tsx')).toMatch(/c\.send\(\{ kind: 'new', product, to: projectName,/);
  });
});

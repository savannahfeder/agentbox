// THE PHONE PREVIEW TESTERS USE TELLS THE SAME STORY EVERYWHERE (w-e4d49a1539).
//
// Three of the 2026-11-02 workday's reports were the preview's made-up threads,
// not the app: the finished daily report opened empty because its copy carried
// no conversation (issue 5), and Launch lead said it was on "Cut the launch film"
// while the thread said Nothing running (issues 12 and 19), because the preview's
// run was live for ten minutes and testers work for thirty. Synthetic testers
// log what they see, so the preview has to agree with itself.
import { describe, it, expect } from 'vitest';
import { previewRows } from '../mobile/src/lib/preview';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { threadOf } from '../mobile/src/lib/thread';

const NOW = Date.parse('2026-11-03T20:00:00Z');

describe('the preview', () => {
  const rows = previewRows(NOW);
  const slug = (project) => phoneSlug(rows.projects[0].device, project);

  it('a finished daily report opens on its report', () => {
    const view = phoneView(rows, NOW);
    const t = threadOf(rows, view, slug('agentbox'), 'w-r2b3c4d5e6');
    expect(t.outcome?.text ?? '').toMatch(/Two sign-ups failed/);
  });

  it("a teammate's running thread is still running half an hour into a session", () => {
    const later = NOW + 35 * 60_000;
    const view = phoneView(rows, later);
    expect(view.running.some((r) => r.itemId === 'w-t1a2b3c4d5')).toBe(true);
  });
  it('a paused teammate does not answer a message (round 2 of the 2026-11-03 testers, issue 8)', async () => {
    const src = (await import('node:fs')).readFileSync('mobile/src/lib/preview.ts', 'utf8');
    expect(src).toMatch(/if \(!mates\.list\.find\(\(x: any\) => x\.id === value\.to\[0\]\)\?\.paused\) setTimeout\(/);
  });
  it('a resumed teammate goes back to what it was doing, not Idle (round 3, issue 9)', async () => {
    const src = (await import('node:fs')).readFileSync('mobile/src/lib/preview.ts', 'utf8');
    expect(src).toMatch(/now: value\.paused \? 'Paused' : m\.nowBeforePause \?\? null, nowBeforePause: value\.paused \? m\.now : undefined/);
  });
});

// SEND LATER OFFERS MONDAY MORNING ONLY WHEN IT IS NOT TOMORROW.
//
// Two synthetic phone testers on Sunday 2026-11-08 met "Tomorrow morning
// Mon 8:00" over "Monday morning Mon 8:00" in Send later and stopped to work
// out whether they differed. The desktop's composer and reply box drew the
// same pair (composer-rules.ts feeds all four lists). On a Sunday the second
// row now goes, in each of them; on any other day both stay.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { mondayIsTomorrow } from '../renderer/src/threads/composer-rules';
import { replyLaterRows } from '../mobile/src/lib/later';

const at = (y, m, d, h = 15) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const SUNDAY = at(2026, 11, 8);
const SATURDAY = at(2026, 11, 7);
const MONDAY = at(2026, 11, 9);
const root = path.resolve(import.meta.dirname, '..');

describe('Monday morning beside Tomorrow morning', () => {
  it('is the same time on a Sunday, and only then', () => {
    expect(mondayIsTomorrow(SUNDAY)).toBe(true);
    expect(mondayIsTomorrow(SATURDAY)).toBe(false);
    expect(mondayIsTomorrow(MONDAY)).toBe(false);
  });

  it('is left out of the phone reply\'s Send later on a Sunday', () => {
    expect(replyLaterRows(SUNDAY, 0).map((r) => r.label)).toEqual(['Tomorrow morning']);
    expect(replyLaterRows(SATURDAY, 0).map((r) => r.label)).toEqual(['Tomorrow morning', 'Monday morning']);
  });

  it('is gated the same way in every list that draws it', () => {
    for (const f of ['renderer/src/components/ReplyLater.tsx', 'renderer/src/threads/ThreadComposer.tsx', 'mobile/src/ui/NewThreadForm.tsx']) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      expect(text, f).toMatch(/mondayIsTomorrow\(now\)[\s\S]{0,400}Monday morning/);
    }
  });
});

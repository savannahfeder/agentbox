// A REPEATING TASK SAYS IT REPEATS, BEFORE AND AFTER YOU SEND IT (w-31c71743b5, 2026-10-29).
//
// The founder picked the first-run suggestion marked "Every Monday": "it's
// unclear that they're repeating. I clicked the one that happens every Monday
// and it didn't show anywhere that it's happening every Monday." Once picked,
// the box showed only the words, and the run's page showed only the title; the
// schedule was in the summary panel, behind S.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const { repeatsLine } = await import('../renderer/src/format.ts');
const { workingContext } = await import('../renderer/src/one-thing-at-a-time.ts');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const monday = { every: 'week', on: 1, at: '09:00' };

describe('the words for a schedule', () => {
  it('names the day and the time', () => {
    expect(repeatsLine(monday)).toBe('Repeats Mondays at 9:00am');
    expect(repeatsLine({ every: 'day', at: '08:00' })).toBe('Repeats daily at 8:00am');
    expect(repeatsLine({ every: 'weekday', at: '16:30' })).toBe('Repeats weekdays at 4:30pm');
  });
});

describe('in the box, once a repeating suggestion is picked', () => {
  const box = read('renderer/src/threads/ThreadComposer.tsx');
  // A chip beside the others pushed Send onto a second line in a 1440px window.
  it('says the schedule under your words', () => {
    expect(box).toContain('{ideaRule && (');
    expect(box).toContain('<RepeatIcon />{repeatsLine(ideaRule)}.');
  });
  it('with a way to send it once instead', () => {
    expect(box).toContain('<button type="button" onClick={() => setIdea(null)}>Send it once instead</button>');
  });
});

describe('on the run’s page while it works', () => {
  const ask = 'Summarize this week’s AI news in five bullets';
  it('says it repeats, where the ask would be the title again', () => {
    expect(workingContext(ask, `${ask} · Thu, Oct 29`, 'Repeats Mondays at 9:00am')).toBe('Repeats Mondays at 9:00am.');
  });
  it('after the ask, when the ask says more than the title', () => {
    expect(workingContext(ask, 'Weekly AI news', 'Repeats Mondays at 9:00am')).toBe(`You asked: ${ask}. Repeats Mondays at 9:00am.`);
  });
  it('and nothing about repeating on a thread that does not', () => {
    expect(workingContext(ask, 'Weekly AI news', null)).toBe(`You asked: ${ask}.`);
    expect(workingContext(ask, ask, null)).toBeNull();
  });
  it('is handed the rule by the page', () => {
    expect(read('renderer/src/components/Focus.tsx')).toContain('queue={page ? { context: item.problem ?? null, repeats: repeat ? repeatsLine(repeat.rule) : null } : undefined}');
    expect(read('renderer/src/components/ItemThread.tsx')).toContain("context={working && !queue.context ? workingContext(isCause(item) ? '' : item.body ?? item.title ?? '', pageTitle(item), queue.repeats ?? null) : queue.context}");
  });
});

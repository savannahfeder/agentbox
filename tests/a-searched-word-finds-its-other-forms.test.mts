// A SEARCHED WORD FINDS ITS OTHER FORMS.
//
// The owner, 2026-11-13, with a picture of ⌘K for "chrome", asked for better
// matching. Measured then: "opening" did not find "Chrome won't open", because
// every typed word had to start a word whole.
import { describe, it, expect } from 'vitest';
import { splitHits, matches } from '../renderer/src/search.ts';
import { holds, queryOf, stemOf } from '../shared/word-match.mts';
import type { WorkItem } from '../renderer/src/types.ts';

const thread = (id: string, title: string, at: number) => ({
  id, product: 'p', title, status: 'open', labels: [], updatedAt: at, wrote: { title: { ts: at, source: 'founder' } },
}) as unknown as WorkItem;

describe('a word finds its other forms', () => {
  it('"opening" finds "open" and "opened", and "threads" finds "thread"', () => {
    expect(matches(thread('w', "Chrome won't open", 1), ['chrome', 'opening'])).toBe(true);
    expect(matches(thread('w', 'It opened twice', 1), ['opening', 'twice'])).toBe(true);
    expect(holds('one thread per job', queryOf('threads job'))).toBe(true);
  });

  it('does not cut a short word into something else', () => {
    expect(stemOf('notes')).toBe('note');
    expect(stemOf('thing')).toBeNull();
    expect(stemOf('access')).toBeNull();
    expect(matches(thread('w', 'Nothing here', 1), ['notes'])).toBe(false);
  });

  it('still needs an earlier word whole when it has no ending', () => {
    expect(matches(thread('w', 'Read today', 1), ['to', 'read'])).toBe(false);
  });

  it('marks the whole word a stem found', () => {
    const runs = splitHits('Chrome opened twice', ['opening']);
    expect(runs.find((r) => r.hit)?.text).toBe('opened');
  });
});

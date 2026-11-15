// THE SCHEDULE BOX NAMES THE THREAD, NOT THE PROMPT THAT STARTED IT.
//
// Reported 2026-10-02 with a screenshot: pressing Schedule on a thread opened
// the box under the heading "It would be nice if there was a way to create new
// workspaces and then also edit existing workspaces." That is the message the
// thread was started with, its raw `title`. The list beside it calls the same
// thread by its written name (`label`, chosen by `rowTitle`), so the box and the
// row she had just pressed named one thread two different ways. Snooze.tsx read
// `item.title` directly; it now asks `scheduleSubtitle`, which asks `rowTitle`.
import { describe, it, expect } from 'vitest';
import { scheduleSubtitle } from '../renderer/src/list-rules.ts';

const prompt = 'It would be nice if there was a way to create new workspaces and then also edit existing workspaces.';

describe('the heading under Schedule', () => {
  it('is the thread name when the thread has one', () => {
    expect(scheduleSubtitle({ title: prompt, label: 'Create and edit workspaces' })).toBe('Create and edit workspaces');
  });

  it('is the title when the thread was never named', () => {
    expect(scheduleSubtitle({ title: 'Fix the login page' })).toBe('Fix the login page');
  });

  it('is the title when the name is only whitespace', () => {
    expect(scheduleSubtitle({ title: 'Fix the login page', label: '   ' })).toBe('Fix the login page');
  });

  it('is the title when the person renamed the thread after it was named', () => {
    expect(scheduleSubtitle({
      title: 'My own name for it',
      label: 'Create and edit workspaces',
      wrote: { title: { ts: 20, source: 'founder' }, label: { ts: 10 } },
    })).toBe('My own name for it');
  });

  it('counts the items, and names none of them, when several are scheduled at once', () => {
    expect(scheduleSubtitle({ title: prompt, label: 'Create and edit workspaces' }, 3)).toBe('3 items');
  });
});

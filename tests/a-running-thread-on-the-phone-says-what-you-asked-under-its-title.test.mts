// While an agent works on a thread that has no Context yet, the desktop puts
// "You asked: …" under its title, so the page says what it is about before
// the agent has written a word (ItemThread's `workingContext`; its lead-in
// fix landed 2026-11-22). The phone parity round of 2026-11-25 found the
// phone showing nothing there: its page took only the Context.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pageOf } from '../mobile/src/lib/one-page.ts';
import { workingContext } from '../renderer/src/one-thing-at-a-time';

type Item = Parameters<typeof pageOf>[0];
const item = (over: Record<string, unknown>) => ({ product: 'p', id: 'w-1', status: 'claimed', title: 'Email bounce', body: 'Why did the welcome email to ana@ bounce yesterday?', ...over }) as Item;

describe('a running thread on the phone', () => {
  it('says what you asked under its title while nothing else says what it is about', () => {
    const page = pageOf(item({}), [], null, [], false, { running: true, repeats: null });
    expect(page.context).toBe(workingContext('Why did the welcome email to ana@ bounce yesterday?', 'Email bounce', null));
    expect(page.context).toMatch(/^You asked/);
  });

  it('adds when it repeats, as the desktop does', () => {
    const page = pageOf(item({}), [], null, [], false, { running: true, repeats: 'Repeats every day at 9:00' });
    expect(page.context).toMatch(/Repeats every day at 9:00\.$/);
  });

  it('keeps the Context when there is one', () => {
    expect(pageOf(item({ problem: 'You wanted to know why an email bounced.' }), [], null, [], false, { running: true, repeats: null }).context).toBe('You wanted to know why an email bounced.');
  });

  it('says nothing there once the agent has stopped working', () => {
    expect(pageOf(item({}), [], null, [], false).context).toBeNull();
  });

  it('is told by the thread page whether an agent is on it', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/thread/[product]/[id].tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/pageOf\(item, thread\.events, thread\.outcome, thread\.after, earlierOpen, \{ running: !!thread\.running, repeats:/);
  });
});

// A TASK A PERSON SENT OPENS WITH THEIR WORDS, NOT WITH "AN AGENT OPENED THIS".
//
// Composing writes two lines: the app's own birth stamp (source 'system', the
// title and nothing else) and then the person's words. On one Mac the stamp
// read "An agent opened this" over her own message, which the solo app has
// always done. On a team it is false: photographed 2026-09-30 in Theo's real
// window, Maya's task to him opened with "An agent opened this" and then her
// face and her words. On a signed-in Mac the stamp carries the person who sent
// it, so it is dropped when that same person's words come straight after.
import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-09-30T22:34:00-07:00');
const line = (ts, source, patch, extra = {}) => ({ id: 'w-1', ts, source, patch, ...extra });

describe('a task Maya sent Theo', () => {
  const lines = [
    line(T0, 'system', { title: 'Write the Acme renewal email', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }, { by: 'maya' }),
    line(T0 + 2, 'founder', { title: 'Write the Acme renewal email', body: '**Can you send Acme their renewal terms by Thursday?**', assignee: 'theo' }, { by: 'maya' }),
  ];

  it('opens with her words and no agent', () => {
    const events = threadEvents(lines);
    expect(events.map((e) => e.said)).not.toContain('An agent opened this');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ by: 'maya', message: true, field: 'body' });
    expect(events[0].words).toContain('renewal terms by Thursday');
  });
});

describe('on one Mac, with nobody signed in', () => {
  it('reads exactly as it always has', () => {
    const lines = [
      line(T0, 'system', { title: 'Tidy the footer', status: 'open', kind: 'directive' }),
      line(T0 + 2, 'founder', { title: 'Tidy the footer', body: 'Make the footer links one line.' }),
    ];
    expect(threadEvents(lines).map((e) => e.said)).toEqual(['An agent opened this', 'You opened this']);
  });
});

describe('a row an agent filed on a signed-in Mac', () => {
  it('still says an agent opened it', () => {
    const lines = [
      line(T0, 'agent', { title: 'Panel read the landing page', status: 'open', kind: 'question' }, { by: 'maya' }),
      line(T0 + 2, 'agent', { body: '**Pick a headline.**' }, { by: 'maya' }),
    ];
    expect(threadEvents(lines)[0].said).toBe('An agent opened this');
  });
});

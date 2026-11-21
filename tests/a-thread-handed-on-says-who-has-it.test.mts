// A THREAD HANDED ON SAYS WHO HAS IT (2026-11-16).
//
// Two power testers gave a thread to a teammate (More actions, Give it to
// someone else) and both logged it as wrong: the thread then read "Done /
// Customer call prep" with a Reopen button, as if the work had finished. The
// hand-off closes the thread with "Given to <name>." (main/team handOn), and
// the page had nothing to say who had it. Measured on the built renderer: the
// corner drew Reopen and nothing about the teammate. The person chose, from
// pictures, a button with the teammate's initials and name in Reopen's place,
// which opens the task they were given; Reopen moves into the menu.
import { describe, it, expect } from 'vitest';
import { handedTo, handedInitials, taskHandedFrom } from '../renderer/src/threads/page-rules.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadMenu, threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';

const given = { status: 'done', answer: 'Given to Jordan Ellis.' };

describe('whom a thread was handed to', () => {
  it('names them', () => {
    expect(handedTo(given)).toBe('Jordan Ellis');
  });

  it('says nothing while the thread is open again', () => {
    expect(handedTo({ ...given, status: 'open' })).toBeNull();
  });

  it('says nothing for a thread that finished or an answer that merely starts alike', () => {
    expect(handedTo({ status: 'done', answer: 'Looks good, ship it.' })).toBeNull();
    expect(handedTo({ status: 'done', answer: 'Given the copy, ship it.' })).toBeNull();
    expect(handedTo({ status: 'done' })).toBeNull();
  });

  it('keeps the words when the teammate had no name', () => {
    expect(handedTo({ status: 'done', answer: 'Given to a teammate.' })).toBe('a teammate');
  });
});

describe('the initials on the button', () => {
  it('takes the first letter of the first and last names', () => {
    expect(handedInitials('Jordan Ellis')).toBe('JE');
    expect(handedInitials('Ana María Ruiz')).toBe('AR');
  });

  it('takes two letters of a single name', () => {
    expect(handedInitials('Jordan')).toBe('JO');
  });
});

describe('the task the button opens', () => {
  const me = 'me-ana';
  const link = (owner: string, id: string) => `[Customer call prep](https://app.agentbox.ac/t/${owner}/${id})\n\nPlease take this`;
  const task = (id: string, body: string, createdBy = me) => ({ id, body, createdBy, labels: ['given-task'], people: [me, 'p-jordan'], assignee: 'p-jordan', title: 'Customer call prep' });

  it('is the task whose link leads back to this thread', () => {
    const items = [task('t-other', link(me, 'w-elsewhere')), task('t-mine', link(me, 'w-hand0001'))];
    expect(taskHandedFrom(items, 'w-hand0001')?.id).toBe('t-mine');
  });

  it('is none when no task links here', () => {
    expect(taskHandedFrom([task('t-other', link(me, 'w-elsewhere'))], 'w-hand0001')).toBeNull();
  });

  it('is never a task someone else gave with a link to the same id', () => {
    expect(taskHandedFrom([task('t-theirs', link('p-jordan', 'w-hand0001'), 'p-jordan')], 'w-hand0001', me)).toBeNull();
  });
});

describe('the bar of a handed-on thread', () => {
  const bar = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(ThreadMenu, props));

  it('draws their initials and name where Reopen was', () => {
    const html = bar({ onFinish: null, onReopen: () => {}, handedTo: { name: 'Jordan Ellis', initials: 'JE', onOpen: () => {} } });
    expect(html).toMatch(/ts-handed-face[^>]*>JE</);
    expect(html).toMatch(/>Jordan Ellis</);
    expect(html).not.toMatch(/ts-reopen/);
  });

  it('keeps Reopen on a thread that was not handed on', () => {
    expect(bar({ onFinish: null, onReopen: () => {} })).toMatch(/>Reopen</);
  });
});

describe('the menu of a handed-on thread', () => {
  it('holds Reopen', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: false, reopen: true }).map((r) => r.label)).toContain('Reopen');
  });

  it('holds no Reopen otherwise', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: false }).map((r) => r.label)).not.toContain('Reopen');
  });
});

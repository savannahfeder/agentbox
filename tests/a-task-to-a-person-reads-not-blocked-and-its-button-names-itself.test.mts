// A TASK TO A PERSON READS "NOT BLOCKED", AND ITS SEND AS BUTTON NAMES ITSELF.
//
// Seen on the photo stage at 1440x900 (2026-11-01), in the new thread box
// with a person picked and Task pressed: the Blocked By row read
// "BLOCKED BY Nothing", which says a thing is blocking it and that thing is
// nothing. And the Task button's whole accessible name was "Task", the same
// word as the Inbox's TASKS tab behind the box, so a press by name ("click
// Task") landed on the tab.
import { describe, it, expect, beforeAll } from 'vitest';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NOT_BLOCKED, NO_DEADLINE } from '../renderer/src/threads/composer-rules.ts';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const ME = 'p-maya', DEV = 'p-dev';
const team = {
  me: ME, state: { signedIn: true, people: [{ id: ME, name: 'Maya' }, { id: DEV, name: 'Dev' }], cards: [] },
  byId: new Map([[ME, { id: ME, name: 'Maya' }], [DEV, { id: DEV, name: 'Dev' }]]), products: new Map(),
};

beforeAll(() => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
});
const draw = async (sendAs) => {
  const { ThreadComposer } = await import('../renderer/src/threads/ThreadComposer.tsx');
  return renderToStaticMarkup(h(TeamContext.Provider, { value: team }, h(ThreadComposer, {
    products: [{ slug: 'p', name: 'P', dir: '/p', repoPath: '/r' }], items: [], engines: ['claude'],
    onClose() {}, onSent() {}, initial: { to: DEV, sendAs },
    blockChoicesFor: () => [{ id: 'w-9', label: 'Fix the double booking' }],
  })));
};

describe('Blocked By', () => {
  it('reads "Not blocked" at rest', async () => {
    expect(NOT_BLOCKED).toBe('Not blocked');
    const html = await draw('task');
    expect(html).toMatch(/tc-word-text tc-unset">Not blocked</);
    expect(html).not.toMatch(/>Nothing</);
  });
});

describe('Send As', () => {
  it('names its buttons so neither can be taken for the Tasks tab', async () => {
    const html = await draw('task');
    expect(html).toMatch(/aria-label="Send as a task"[^>]*>Task</);
    expect(html).toMatch(/aria-label="Send as a message"[^>]*>Message</);
  });

  it('still shows the one word on each button', async () => {
    const html = await draw('message');
    expect(html).toMatch(/>Task<\/button>/);
    expect(html).toMatch(/>Message<\/button>/);
  });
});

describe('what must not change', () => {
  // Picked out of ten, capitals included (a-teammate-can-be-given-a-task-instead-of-a-message).
  it('Due On still reads No Deadline', async () => {
    expect(NO_DEADLINE).toBe('No Deadline');
  });
});

// A SEND TO A TEAMMATE IS A MESSAGE OR A TO-DO.
//
// Over a picture of Home's box addressed to a person, the founder asked: "I
// don't really understand this whole task creation thing. What's the
// difference between that and a message? ... If I don't understand it, clearly
// users are going to not understand it." Her next two notes called the second
// kind a to-do, and she picked "Rename Task to To-do" over a picture of the
// renamed toggle in the real app. Measured before the change, in the demo team:
// the toggle read Message | Task on Home and in the pop-up, a task to two
// people said "A task goes to one person.", and the toast after Send said
// "Task sent to Priya". Only the words change: a to-do is still the task the
// store gives a person.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const ME = 'p-maya', DEV = 'p-dev', LENA = 'p-lena';
const people = [{ id: ME, name: 'Maya Chen' }, { id: DEV, name: 'Dev Rao' }, { id: LENA, name: 'Lena Ortiz' }];
const team = { me: ME, state: { signedIn: true, people, cards: [] }, byId: new Map(people.map((p) => [p.id, p])), products: new Map() };

beforeAll(() => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
});

const draw = async (props: Record<string, unknown>) => {
  const { ThreadComposer } = await import('../renderer/src/threads/ThreadComposer.tsx');
  return renderToStaticMarkup(h(TeamContext.Provider, { value: team }, h(ThreadComposer, {
    products: [{ slug: 'p', name: 'Ferry', dir: '/p', repoPath: '/r' }], items: [], engines: ['claude'],
    codexModels: [], codexModelDefault: null, onClose() {}, onSent() {},
    blockChoicesFor: () => [{ id: 'w-9', label: 'Fix the double booking' }],
    ...props,
  })));
};

describe('the toggle', () => {
  for (const [where, inline] of [['Home', true], ['the pop-up', false]] as const) {
    it(`reads Message and To-do in ${where}`, async () => {
      const html = await draw({ inline, initial: { to: DEV } });
      expect(html).toMatch(/aria-label="Send as a message"[^>]*>Message<\/button>/);
      expect(html).toMatch(/aria-label="Send as a to-do"[^>]*>To-do<\/button>/);
      expect(html).not.toMatch(/>Task<\/button>/);
      expect(html).not.toMatch(/Send as a task/);
    });
  }

  it('lights To-do when a to-do is being written, and still asks what they should do', async () => {
    const html = await draw({ inline: true, initial: { to: DEV, sendAs: 'task' } });
    expect(html).toMatch(/class="on" aria-pressed="true" aria-label="Send as a to-do"/);
    expect(html).toMatch(/placeholder="What should Dev do\?"/);
  });
});

describe('a to-do for two people', () => {
  it('says a to-do goes to one person', async () => {
    const html = await draw({ inline: true, initial: { to: DEV, also: [LENA], sendAs: 'task' } });
    expect(html).toMatch(/A to-do goes to one person\./);
    expect(html).not.toMatch(/A task goes to one person/);
  });
});

describe('after Send', () => {
  it('the toast says the to-do was sent', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/how\.given \? `To-do sent to \$\{said\}`/);
    expect(app).not.toMatch(/`Task sent to /);
  });
});

describe('what must not change', () => {
  it('a box to an agent says nothing about to-dos', async () => {
    const html = await draw({ inline: true });
    expect(html).not.toMatch(/To-do/);
  });

  it('a to-do is still given to the person as the store\'s task', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/const asTask = sendAs === 'task';/);
    expect(src).toMatch(/await api\.teamGiveTask\(/);
  });

  it('the pop-up keeps its Send As row', async () => {
    const html = await draw({ initial: { to: DEV } });
    expect(html).toMatch(/<span class="tc-label">Send As<\/span>/);
  });
});

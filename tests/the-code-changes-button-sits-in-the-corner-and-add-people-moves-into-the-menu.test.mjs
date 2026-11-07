// THE CODE CHANGES BUTTON SITS IN THE CORNER, AND ADD PEOPLE MOVES INTO THE MENU.
//
// People kept asking for a diff view without knowing there was one: the only
// way in was "View code changes", a row inside the thread's three-dot menu
// (w-c25aae4035). The corner's square Add people button was judged not worth
// its place, so it became a menu row and the corner got a button showing what
// the run changed, "+186 −41", beside Done. Measured by drawing the menu
// before the change: a thread with code had no ts-code button, and the corner
// rendered AddPeople as its own button.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadMenuRows, ThreadMenu } from '../renderer/src/threads/ThreadMenu.tsx';
globalThis.React = React;

const draw = (props) => renderToStaticMarkup(React.createElement(ThreadMenu, { terminal: 'closed', onToggleTerminal: () => {}, onFinish: () => {}, ...props }));
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const figures = React.createElement('span', { className: 'ts-code-figures' }, '+186 −41');
const people = [{ id: 'p-maya', name: 'Maya Chen' }, { id: 'p-jun', name: 'Jun Park' }];

describe('the code changes button in the corner', () => {
  it('draws the figures as a button before Done, named for what it opens', () => {
    const html = draw({ change: figures, codeButton: figures, onViewChange: () => {} });
    expect(html).toContain('class="ts-done ts-code"');
    expect(html).toContain('aria-label="View code changes"');
    expect(html).toContain('+186 −41');
    expect(html.indexOf('ts-code')).toBeLessThan(html.indexOf('>Done<'));
  });

  it('is the one way in from the corner: the menu drops its code row', () => {
    expect(threadMenuRows({ change: false, terminal: 'closed', finish: true }).map((r) => r.id)).not.toContain('code');
    const html = draw({ change: figures, codeButton: figures, onViewChange: () => {} });
    expect(html).not.toContain('>View code changes<');
  });

  it('looks pressed while the change is open beside the thread, and not otherwise', () => {
    expect(draw({ change: figures, codeButton: figures, codeOpen: true })).toContain('aria-pressed="true"');
    expect(draw({ change: figures, codeButton: figures, codeOpen: false })).toContain('aria-pressed="false"');
  });

  // The case that must not match: a run that changed no code.
  it('draws no button when the run changed no code', () => {
    expect(draw({ change: null, codeButton: null })).not.toContain('ts-code');
  });

  it('gets the figures from the thread page, beside Done, on every thread with a change', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/codeButton=\{codeButton\}/);
    expect(focus).toMatch(/const codeButton = figures \?/);
  });
});

describe('Add people in the menu', () => {
  it('is a row, after the terminal, when someone could still be added', () => {
    const rows = threadMenuRows({ change: false, terminal: 'closed', finish: true, people: true, pin: 'unpinned' });
    expect(rows.map((r) => r.id)).toEqual(['terminal', 'people', 'pin', 'done']);
    expect(rows.find((r) => r.id === 'people').label).toBe('Add people');
  });

  it('is offered by the menu when it is handed people and a way to add them', () => {
    const html = draw({ addPeople: { people, conversation: false }, onAddPeople: () => {} });
    expect(html).toContain('class="ts-more"');
    expect(threadMenuRows({ change: false, terminal: 'closed', finish: true, people: true }).map((r) => r.label)).toContain('Add people');
  });

  // The case that must not match: nobody left to add.
  it('is not a row when nobody can be added', () => {
    expect(threadMenuRows({ change: false, terminal: 'closed', finish: true }).map((r) => r.id)).not.toContain('people');
  });

  it('is no longer a button of its own in the corner, and the line under the title leaves it to the menu', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    const corner = focus.match(/createPortal\(<span className="ts-top">[\s\S]*?cornerHeaderTarget\)/)[0];
    expect(corner).toContain('<ConversationAside item={item} />');
    expect(corner).not.toContain('onAddPeople');
    expect(focus).toMatch(/onAddPeople=\{cornerHeaderTarget \? undefined : onAddPeople\}/);
  });

  it('still answers ⌘K and the reply box, which ask for the picker by event', () => {
    expect(read('renderer/src/threads/ThreadMenu.tsx')).toMatch(/addEventListener\('zero:add-people'/);
  });
});

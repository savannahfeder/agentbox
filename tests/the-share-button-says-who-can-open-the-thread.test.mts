// THE SHARE BUTTON SAYS WHO CAN OPEN THE THREAD, AND IS THE ONE DOOR TO PEOPLE (w-f774d40729).
//
// The founder, on the demo team: "I find this Share button here, this Add
// People button, rather confusing because I don't know how it differs from
// Share. When I hit it, nothing happened visibly to me. The shared didn't say
// Theo." Measured in the browser copy on the demo team (1512x945, dark): the
// corner had Share beside Done, and the dots menu still had Add people, with
// the same person-and-plus mark. Picking Theo there flashed "Theo is on this
// thread now" for two seconds and changed nothing, because the thread was
// already open to everyone at Ferry, and nothing on the page said so. The
// Share button read "Share" before and after.
//
// So the button wears who can open the thread, the way the hand-over button
// wears who has it, and Add people leaves every thread of your own: Share is
// the door to people there.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { shareFace } from '../renderer/src/threads/share-rules.ts';
import { ThreadMenu, threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { peopleToAdd } from '../renderer/src/threads/page-rules.ts';
import { threadCommands } from '../renderer/src/thread-commands.ts';

const ME = { id: 'p-jamie', name: 'Jamie Park', email: 'jamie@ferry.test', avatarUrl: null };
const THEO = { id: 'p-theo', name: 'Theo Brandt', email: 'theo@ferry.test', avatarUrl: 'data:image/jpeg;base64,AAAA' };
const PRIYA = { id: 'p-priya', name: 'Priya Raman', email: 'priya@ferry.test', avatarUrl: null };
const LENA = { id: 'p-lena', name: 'Lena Ortiz', email: 'lena@ferry.test', avatarUrl: null };
const DEV = { id: 'p-dev', name: 'Dev Rao', email: 'dev@ferry.test', avatarUrl: null };
const people = [THEO, PRIYA, LENA, DEV];
const face = (seen: 'team' | 'people' | 'private', chosen: string[] = [], teamName: string | null = 'Ferry') => shareFace({ seen, chosen, people, me: ME.id, teamName });

describe('what the Share button says', () => {
  it('names everyone at the team on a thread the whole team can open', () => {
    expect(face('team')).toEqual({ mark: 'team', words: 'Everyone at Ferry', people: [] });
  });

  it('says your team where the team has no name yet', () => {
    expect(face('team', [], '  ').words).toBe('Your team');
    expect(face('team', [], null).words).toBe('Your team');
  });

  it('names the one person who can open it, with their face, as the hand-over button does', () => {
    expect(face('people', [THEO.id])).toEqual({ mark: 'people', words: 'Theo Brandt', people: [THEO] });
  });

  it('names two by their first names', () => {
    expect(face('people', [THEO.id, PRIYA.id])).toMatchObject({ words: 'Theo and Priya', people: [THEO, PRIYA] });
  });

  it('counts three or more, and shows at most three faces', () => {
    expect(face('people', [THEO.id, PRIYA.id, LENA.id])).toMatchObject({ words: '3 people', people: [THEO, PRIYA, LENA] });
    expect(face('people', [THEO.id, PRIYA.id, LENA.id, DEV.id])).toMatchObject({ words: '4 people', people: [THEO, PRIYA, LENA] });
  });

  it('leaves you out of the people it names', () => {
    expect(face('people', [ME.id, LENA.id])).toMatchObject({ words: 'Lena Ortiz', people: [LENA] });
  });

  it('says Share while only you can open it', () => {
    expect(face('private')).toEqual({ mark: 'share', words: 'Share', people: [] });
    expect(face('people', [ME.id])).toEqual({ mark: 'share', words: 'Share', people: [] });
    expect(face('people', [])).toEqual({ mark: 'share', words: 'Share', people: [] });
  });

  it('does not name people a thread named before it went private', () => {
    expect(face('private', [THEO.id])).toEqual({ mark: 'share', words: 'Share', people: [] });
  });

  it('counts someone who is no longer on the team without drawing a face for them', () => {
    expect(face('people', ['p-gone'])).toEqual({ mark: 'people', words: '1 person', people: [] });
    expect(face('people', ['p-gone', THEO.id])).toMatchObject({ words: '2 people', people: [THEO] });
  });

  it('names a person once however often they were chosen', () => {
    expect(face('people', [THEO.id, THEO.id])).toMatchObject({ words: 'Theo Brandt', people: [THEO] });
  });
});

describe('the button in the corner', () => {
  const corner = (seen: 'team' | 'people' | 'private', chosen: string[] = []) => renderToStaticMarkup(React.createElement(ThreadMenu, {
    change: null, terminal: null, onFinish: () => {},
    giveTo: [{ id: THEO.id, name: THEO.name }], onGive: () => {},
    share: { link: 'https://app.agentbox.ac/t/p-jamie/w-1', people, seen, seenWord: 'Ferry', teamName: 'Ferry', chosen, face: face(seen, chosen) },
  }));
  const button = (html: string) => /<button[^>]*ts-share[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1] ?? '';

  it('says who can open it, before Done', () => {
    const html = corner('team');
    expect(button(html)).toContain('>Everyone at Ferry<');
    expect(html.indexOf('ts-share')).toBeLessThan(html.indexOf('data-hint="done"'));
  });

  it('wears the face and name of the one person it is shared with', () => {
    const b = button(corner('people', [THEO.id]));
    expect(b).toContain('>Theo Brandt<');
    expect(b).toContain(`src="${THEO.avatarUrl}"`);
    expect(b).not.toContain('>Share<');
  });

  it('draws a face for each person it names', () => {
    expect(button(corner('people', [THEO.id, PRIYA.id])).match(/tm-av/g)).toHaveLength(2);
  });

  it('is Share with the add mark while only you can open it', () => {
    const b = button(corner('private'));
    expect(b).toContain('>Share<');
    expect(b).not.toContain('tm-av');
  });

  it('says so to a screen reader', () => {
    expect(corner('people', [THEO.id])).toMatch(/aria-label="Share, Theo Brandt can open it"/);
    expect(corner('private')).toMatch(/aria-label="Share"/);
  });
});

// Measured at 390 wide: with Share in the bar the dots sat at 407 to 451, off the screen.
describe('on a phone', () => {
  const corner = (seen: 'team' | 'people', chosen: string[] = []) => {
    const was = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = { documentElement: { dataset: { door: 'phone' } } };
    try {
      return renderToStaticMarkup(React.createElement(ThreadMenu, {
        change: null, terminal: null, onFinish: () => {}, giveTo: [{ id: THEO.id, name: THEO.name }], onGive: () => {},
        share: { link: null, people, seen, seenWord: 'Ferry', teamName: 'Ferry', chosen, face: face(seen, chosen) },
      }));
    } finally { (globalThis as { document?: unknown }).document = was; }
  };

  it('draws no Share button in the bar', () => {
    expect(corner('team')).not.toContain('ts-share');
    expect(corner('team')).toContain('aria-label="More actions"');
  });

  it('puts Share first in the menu, saying who can open it', () => {
    const rows = threadMenuRows({ change: false, terminal: null, finish: true, share: true, give: true, shareSays: 'Theo Brandt' });
    expect(rows[0]).toMatchObject({ id: 'share', label: 'Ask, hand over or share…', detail: 'Theo Brandt' });
  });

  it('says nothing beside the row while only you can open it', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true, share: true, give: true })[0]).not.toHaveProperty('detail');
  });
});

describe('the menu beside the Share button', () => {
  const base = { change: false, terminal: 'closed' as const, finish: true, later: 'key' as const };

  it('offers no Add people, no Share and no Ask or hand over while the button is there', () => {
    const ids = threadMenuRows({ ...base, share: true, shareButton: true, people: true, give: true }).map((r) => r.id);
    expect(ids).not.toContain('people');
    expect(ids).not.toContain('share');
    expect(ids).not.toContain('give');
  });

  it('puts Share first where there is no button, and still no Add people', () => {
    const rows = threadMenuRows({ ...base, share: true, people: true });
    expect(rows[0]).toMatchObject({ id: 'share', label: 'Share…' });
    expect(rows.map((r) => r.id)).not.toContain('people');
  });

  it('keeps Add people where nothing can be shared', () => {
    expect(threadMenuRows({ ...base, people: true }).map((r) => r.id)).toContain('people');
  });
});

describe('Add people elsewhere', () => {
  const company = [ME, THEO, PRIYA];

  it('offers nobody on a thread of your own, where Share is the door', () => {
    expect(peopleToAdd({ item: { createdBy: ME.id, visibility: 'team', visibleTo: [] }, me: ME.id, company })).toEqual([]);
    expect(peopleToAdd({ item: { visibility: 'private' }, me: ME.id, company })).toEqual([]);
  });

  it('still offers the rest of the team on a teammate\'s thread', () => {
    expect(peopleToAdd({ item: { createdBy: PRIYA.id, visibleTo: [] }, me: ME.id, company }).map((p) => p.id)).toContain(THEO.id);
  });

  it('is found in the command bar as sharing with chosen people', () => {
    const rows = threadCommands({ seen: 'team', teammates: true });
    expect(rows.find((r) => r.id === 'add-people')).toBeUndefined();
    expect(rows.find((r) => r.id === 'see-people')?.keywords).toMatch(/\badd people\b/);
  });
});

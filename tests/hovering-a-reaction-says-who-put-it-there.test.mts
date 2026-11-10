// HOVERING A REACTION SAYS WHO PUT IT THERE (w-157236085f).
//
// Pointing at the 👀 1 chip under a message showed a tooltip reading "1", and
// on a chip of yours "You and 0 others": the count again, never a name. So
// nobody could tell who had reacted. Measured by rendering the chips and
// reading their title: it held only the number.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { Reactions, whoReacted } from '../renderer/src/team/ChatActions.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const ME = 'p-me', MAYA = 'p-maya', DEV = 'p-dev', GONE = 'p-gone';
const names = { [ME]: 'Sam Rivera', [MAYA]: 'Maya Chen', [DEV]: 'Dev Patel' };
const nameOf = (id) => names[id] ?? null;

describe('the words a reaction chip shows on hover', () => {
  it('names the one person on it', () => {
    expect(whoReacted('👀', [MAYA], ME, nameOf)).toBe('Maya Chen reacted with 👀');
  });

  it('says You for your own, alone or with others', () => {
    expect(whoReacted('👀', [ME], ME, nameOf)).toBe('You reacted with 👀');
    expect(whoReacted('👀', [MAYA, ME], ME, nameOf)).toBe('Maya Chen and you reacted with 👀');
    expect(whoReacted('👀', [ME, MAYA], ME, nameOf)).toBe('You and Maya Chen reacted with 👀');
  });

  it('lists three or more with commas and a last and', () => {
    expect(whoReacted('🙏', [MAYA, DEV, ME], ME, nameOf)).toBe('Maya Chen, Dev Patel and you reacted with 🙏');
  });

  it('says A teammate for someone it has no name for, rather than an id', () => {
    const said = whoReacted('👀', [GONE], ME, nameOf);
    expect(said).toBe('A teammate reacted with 👀');
    expect(said).not.toContain(GONE);
  });

  it('reads the press with no person on it, the one-person app’s, as yours', () => {
    expect(whoReacted('👀', ['you'], null, () => null)).toBe('You reacted with 👀');
  });
});

describe('the chips carry those words', () => {
  const team = {
    state: {}, me: ME,
    byId: new Map(Object.entries(names).map(([id, name]) => [id, { id, name, email: '', avatarUrl: null }])),
    products: new Map(),
  };

  it('in a thread, from the team’s names', () => {
    const html = renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
      React.createElement(Thread, {
        events: [{ at: 1, who: 'you', by: MAYA, text: 'Findings.', uid: 'l-one' }],
        chat: true, name: 'Claude Code', landOn: 'w-1', onWhole: () => {},
        md: (t) => React.createElement('p', null, t),
        onReact: () => {}, reactions: { 'l-one': { '👀': [MAYA], '🙏': [MAYA, ME] } },
      })));
    expect(html).toContain('title="Maya Chen reacted with 👀"');
    expect(html).toContain('title="Maya Chen and you reacted with 🙏"');
  });

  it('in a room, from the names it is handed', () => {
    const html = renderToStaticMarkup(React.createElement(Reactions, {
      on: { '👀': [DEV] }, me: ME, onReact: () => {}, nameOf: (id) => (id === DEV ? 'Dev Patel' : null),
    }));
    expect(html).toContain('title="Dev Patel reacted with 👀"');
  });
});

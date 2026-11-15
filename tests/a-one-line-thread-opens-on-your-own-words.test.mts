// A ONE-LINE THREAD OPENS ON YOUR OWN WORDS.
//
// Found in the 3-hour cloud test, 2026-10-22. A thread typed as one line is
// saved as a title with no body, and for the fifteen seconds to a minute
// before the app writes the row a short name, opening it showed a bare "You
// opened this" with nothing under it: the only copy of what you had asked for
// was in the header.
//
// `withTitleSaid` carried the title into the opening only when the row had a
// short name that DIFFERED from its title, which is the case it was written
// for (the header shows the name, so the title is said in the thread). A row
// with no name yet failed that test and the opening stayed wordless.
//
// The four cases, which are the four things that must not break each other: no
// name yet, a name that differs, a body that already holds the title, and a
// thread an agent filed (which still says an agent opened it).

import { describe, it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-10-22T11:04:00Z');
const TITLE = 'Have a look at why the usage bar in the corner reads nothing';
const line = (ts, source, patch) => ({ id: 'w-1a2b3c4d5e', ts, source, patch });

// The two lines sending a one-line thread writes (store.composeItem).
const typedAsOneLine = [
  line(T0, 'system', { title: TITLE, status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
  line(T0 + 40, 'founder', { title: TITLE }),
];

const opening = (lines) => threadEvents(lines)[0];

describe('a one-line thread with no name yet', () => {
  it('opens on what you typed', () => {
    expect(opening(typedAsOneLine)).toMatchObject({ who: 'you', said: 'You opened this', words: TITLE, message: true });
  });

  it('says it once, not twice', () => {
    const words = threadEvents(typedAsOneLine).filter((e) => e.words?.includes(TITLE));
    expect(words).toHaveLength(1);
  });
});

describe('a one-line thread the app has since named', () => {
  it('still opens on what you typed', () => {
    const named = [...typedAsOneLine, line(T0 + 17_000, 'agent', { label: 'Corner usage bar reads nothing' })];
    expect(opening(named)).toMatchObject({ who: 'you', said: 'You opened this', words: TITLE });
  });
});

describe('a thread whose body already holds its title', () => {
  it('does not repeat it above the body', () => {
    const withBody = [
      line(T0, 'system', { title: TITLE, status: 'open', labels: ['founder'] }),
      line(T0 + 40, 'founder', { title: TITLE, body: `${TITLE}\n\nIt has read nothing since Tuesday.` }),
      line(T0 + 17_000, 'agent', { label: 'Corner usage bar reads nothing' }),
    ];
    expect(opening(withBody).words).toBe(`${TITLE}\n\nIt has read nothing since Tuesday.`);
  });
});

describe('a thread an agent filed', () => {
  it('still says an agent opened it', () => {
    const theirs = [
      line(T0, 'agent', { title: TITLE, status: 'open', kind: 'bug' }),
      line(T0 + 17_000, 'agent', { label: 'Corner usage bar reads nothing' }),
    ];
    expect(opening(theirs).said).toBe('An agent opened this');
  });
});

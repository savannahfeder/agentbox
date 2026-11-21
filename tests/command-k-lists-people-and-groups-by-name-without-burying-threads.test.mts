// COMMAND K LISTS PEOPLE AND GROUPS BY NAME, WITHOUT BURYING THE THREADS.
//
// Typing "demo" in ⌘K put four AI teammates, Video producer, Coach, Loom lead
// and Collaboration tester, under People and groups above the threads named
// Demo. None has "demo" in its name: teammates were matched on any letters in
// their name, role or whole job description, and every person or group found
// led the threads however weakly it matched. "If I'm looking for a teammate, I
// can just type their name and it should come up." Measured by drawing the
// Palette over four teammates with those names and jobs that mention demos:
// it listed the same four. The same drawing listed "Coach" and "Sofia, Dev"
// twice when typed, once as a command row and once under People and groups.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Palette, paletteOrder } from '../renderer/src/components/Palette';
import { chatsFound } from '../renderer/src/team/chats-found';
import { nameRank } from '../renderer/src/palette-pick';

const noop = () => {};
const mates = [
  { id: 't1', name: 'Video producer', role: 'Video producer', job: 'Cut the demo videos and the launch films.' },
  { id: 't2', name: 'Coach', role: 'Coach', job: 'Run practice demo calls with the person.' },
  { id: 't3', name: 'Loom lead', role: 'Loom lead', job: 'Record a Loom demo for each lead.' },
  { id: 't4', name: 'Collaboration tester', role: 'Collaboration tester', job: 'Open the demo copy and test teams.' },
  { id: 't5', name: 'Maya', role: 'Chief of staff', job: 'Keeps the week moving.' },
];
const groups = [
  { key: 'room:r1', name: 'Lumen', faces: [], last: '', at: 1, unread: false, pinned: true, team: true },
  { key: 'room:r2', name: 'Sofia, Dev', faces: [{ name: 'Sofia Marquez', url: null }, { name: 'Dev Patel', url: null }], last: '', at: 2, unread: false, pinned: false },
];
const persons = [{ id: 'p-so', name: 'Sofia Marquez' }, { id: 'p-dv', name: 'Dev Patel' }];
const find = (query: string) => chatsFound({ groups, teammates: mates, persons, query });
const names = (query: string) => find(query).map((r) => r.label);

describe('a person, group or AI teammate is found by its name', () => {
  it('the reported case: "demo" finds none of the teammates whose jobs say demo', () => {
    expect(find('demo')).toEqual([]);
  });

  it('by the start of its name, a later word of it, or its whole name typed', () => {
    expect(names('coa')).toEqual(['Coach']);
    expect(names('video pro')).toEqual(['Video producer']);
    expect(names('lead')).toEqual(['Loom lead']);
    expect(names('sofia mar')).toEqual(['Sofia Marquez']);
    expect(names('marquez')).toEqual(['Sofia Marquez']);
    expect(names('lumen')).toEqual(['Lumen']);
  });

  it('a chat by the people its name is made of', () => {
    expect(names('dev')).toEqual(['Dev Patel', 'Sofia, Dev']);
  });

  it('never by letters inside a word, its role, or its job', () => {
    expect(names('ach')).toEqual([]);
    expect(names('ideo')).toEqual([]);
    expect(names('umen')).toEqual([]);
    expect(names('chief')).toEqual([]);
    expect(names('practice')).toEqual([]);
    expect(names('maya')).toEqual(['Maya']);
  });

  it('the one whose name begins with the words first', () => {
    const designer = { id: 't9', name: 'Lead designer', role: null, job: null };
    expect(chatsFound({ groups: [], teammates: [...mates, designer], persons: [], query: 'lead' }).map((r) => r.label)).toEqual(['Lead designer', 'Loom lead']);
  });

  it('nothing for nothing typed', () => {
    expect(find('')).toEqual([]);
    expect(find('  ')).toEqual([]);
  });
});

describe('how well the words name a row', () => {
  it('its whole name, then its start, then a later word, then inside a word, then not at all', () => {
    expect(nameRank('coach', 'Coach')).toBe(0);
    expect(nameRank('coa', 'Coach')).toBe(1);
    expect(nameRank('sofia', 'Sofia’s onboarding screens')).toBe(1);
    expect(nameRank('lead', 'Loom lead')).toBe(2);
    expect(nameRank('screens sofia', 'Sofia’s onboarding screens')).toBe(2);
    expect(nameRank('ach', 'Coach')).toBe(3);
    expect(nameRank('demo', 'Coach')).toBe(4);
    expect(nameRank('', 'Coach')).toBe(4);
  });
});

const row = (id: string, label: string) => ({ id, label, run: noop });
const chat = (kind: string, key: string, label: string) => row(`chat-${kind}-${key}`, label);
const command = row('wait', 'Mark done');
const order = (commands, people, threads, query: string, phone = false) => {
  const { rows, labels } = paletteOrder(commands, [...people, ...threads], phone, query, people.length);
  return { ids: rows.map((r) => r.id), labels: [...labels.entries()] };
};

describe('where people and groups go', () => {
  it('ahead of the threads when the words begin a name', () => {
    const got = order([command], [chat('teammate', 't2', 'Coach')], [row('thread-1', 'Coaching notes for the launch')], 'coach');
    expect(got.ids).toEqual(['chat-teammate-t2', 'thread-1', 'wait']);
    expect(got.labels).toEqual([[0, 'People and groups'], [1, 'Threads'], [2, 'Commands']]);
  });

  it('after the threads when a thread is named better', () => {
    const got = order([command], [chat('teammate', 't3', 'Loom lead')], [row('thread-1', 'Lead list for outreach')], 'lead');
    expect(got.ids).toEqual(['thread-1', 'chat-teammate-t3', 'wait']);
    expect(got.labels).toEqual([[0, 'Threads'], [1, 'People and groups'], [2, 'Commands']]);
  });

  it('after the threads when both only have the words as a later word', () => {
    const got = order([], [chat('teammate', 't3', 'Loom lead')], [row('thread-1', 'Outreach lead list')], 'lead');
    expect(got.ids).toEqual(['thread-1', 'chat-teammate-t3']);
  });

  it('ahead when both names begin with the words, and ahead of threads found only inside', () => {
    expect(order([], [chat('person', 'p-so', 'Sofia Marquez')], [row('thread-1', 'Sofia’s onboarding screens')], 'sofia').ids)
      .toEqual(['chat-person-p-so', 'thread-1']);
    expect(order([], [chat('person', 'p-so', 'Sofia Marquez')], [row('thread-1', 'Pricing page copy')], 'marquez').ids)
      .toEqual(['chat-person-p-so', 'thread-1']);
  });

  it('after a thread whose title is exactly the words', () => {
    expect(order([], [chat('teammate', 't9', 'Coaching team')], [row('thread-1', 'Coaching')], 'coaching').ids)
      .toEqual(['thread-1', 'chat-teammate-t9']);
  });

  it('keeps See all under the threads it counts', () => {
    const got = order([], [chat('teammate', 't3', 'Loom lead')], [row('thread-1', 'Lead list'), row('all-threads', 'See all 9 threads')], 'lead');
    expect(got.ids).toEqual(['thread-1', 'all-threads', 'chat-teammate-t3']);
    expect(got.labels).toEqual([[0, 'Threads'], [2, 'People and groups']]);
  });

  it('on a phone too', () => {
    const got = order([command], [chat('teammate', 't3', 'Loom lead')], [row('thread-1', 'Lead list for outreach')], 'lead', true);
    expect(got.ids).toEqual(['thread-1', 'chat-teammate-t3', 'wait']);
    expect(got.labels).toEqual([[0, 'Threads'], [1, 'People and groups'], [2, 'Commands']]);
  });
});

describe('each is one row', () => {
  it('a teammate or group found by name is not also a command row', () => {
    expect(order([row('teammate-t2', 'Coach'), command], [chat('teammate', 't2', 'Coach')], [], 'coach').ids)
      .toEqual(['chat-teammate-t2', 'wait']);
    expect(order([row('group-room:r2', 'Sofia, Dev'), command], [chat('group', 'room:r2', 'Sofia, Dev')], [], 'sofia').ids)
      .toEqual(['chat-group-room:r2', 'wait']);
  });

  it('keeps its other commands, and the rows of those not found', () => {
    const got = order([row('teammate-pause-t2', 'Pause Coach'), row('teammate-t1', 'Video producer')], [chat('teammate', 't2', 'Coach')], [], 'coach');
    expect(got.ids).toEqual(['chat-teammate-t2', 'teammate-pause-t2', 'teammate-t1']);
  });
});

describe('the box itself', () => {
  const threads = [
    { id: 'thread-a', label: 'Demo copy of the app', run: noop },
    { id: 'thread-b', label: 'Demo files ride to the cloud', run: noop },
  ];
  // As App.tsx builds it.
  const findChats = (q: string) => chatsFound({ groups, teammates: mates, persons, query: q }).map((f) => row(`chat-${f.kind}-${f.key}`, f.label));
  const draw = (typed: string) => renderToStaticMarkup(createElement(Palette, {
    products: [], supervisorPaused: false, look: 'dark', order: [],
    onSetLook: noop, onOpenFilter: noop, onClearFilter: noop, onView: noop, onPause: noop, onResume: noop,
    onRankFirst: noop, onNewProject: noop, onNewThread: noop, onStanding: noop, onSettings: noop,
    onShortcuts: noop, keyHints: false, onSetKeyHints: noop, onFirstRun: noop, onTutorial: noop, onImportAgents: noop,
    onDemo: noop, onClose: noop, roomsOn: true, groups, onGroups: noop, onPickGroup: noop,
    teammates: mates, onTeammates: noop, findThreads: (q: string) => threads.filter((t) => t.label.toLowerCase().includes(q.toLowerCase())), findChats, typed,
  }));
  const drawn = (typed: string) => [...draw(typed).matchAll(/<div class="palette-section">([^<]*)<\/div>|<span class="palette-label">([^<]*)<\/span>/g)]
    .map((m) => m[1] ?? m[2]);

  it('typing "demo" lists the demo copy, then the threads, and no teammate', () => {
    expect(drawn('demo')).toEqual(['Open a demo copy', 'Threads', 'Demo copy of the app', 'Demo files ride to the cloud']);
  });

  it('typing a teammate\'s name lists it once, under People and groups', () => {
    expect(drawn('coach').filter((l) => l === 'Coach')).toEqual(['Coach']);
    expect(drawn('coach').slice(0, 2)).toEqual(['People and groups', 'Coach']);
  });

  it('is handed every person on the team by the app', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/chatsFound\(\{[^}]*persons:/);
  });
});

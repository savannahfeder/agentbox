// A ROOM WALL SHOWS EACH PERSON AS THEY CHOSE (w-3d0fa23ffb, 2026-10-20).
//
// The wall is a card per person: face, "First L." (unless they turned on their
// full name), level, the short name of what they are working on, how many
// agents are running. What a card may say is the person's choice, and a
// private thread is never named. Codex's first review found the gap this
// pins: turning off "what I'm working on" had to hold for teammates too, who
// could otherwise read the name off the team's thread cards.
//
// Measured with plain objects: the name rule, every "what I'm working on"
// setting from a teammate's and a stranger's view, a private thread, two Macs
// added together, a Mac gone quiet, the order of the wall, and the row my own
// Mac publishes.
import { describe, it, expect } from 'vitest';
import { displayNameOf, wallCards, myPresence } from '../shared/room-cards.mjs';

const NOW = Date.parse('2026-10-22T15:00:00-07:00');
const MIN = 60_000;
const MAYA = 'p-maya', THEO = 'p-theo', JUN = 'p-jun', ME = 'p-me';

const prof = (person_id, display_name, extra = {}) => ({ person_id, display_name, avatar_url: null, show_working: 'team', show_agents: true, show_level: true, show_status: true, status_text: null, status_until: null, ...extra });
const pres = (person_id, extra = {}) => ({ person_id, device: 'aaaaaaaaaaaa', gone: false, agents_running: 2, working_on: null, working_private: false, working_at: new Date(NOW - 5 * MIN).toISOString(), hours_total: 100, hours_week: 10, week_start: '2026-10-19', hours_today: 2, day: '2026-10-22', streak_days: 3, active_days: ['2026-10-20', '2026-10-21', '2026-10-22'], hours_by_month: [], updated_at: new Date(NOW - MIN).toISOString(), ...extra });
const card = (personId, title, extra = {}) => ({ personId, threadId: `t-${title}`, title, state: 'running', visible: true, updatedAt: NOW - 3 * MIN, ...extra });

describe('names', () => {
  it('first name and the first letter of the last', () => {
    expect(displayNameOf('Maya Costa')).toBe('Maya C.');
    expect(displayNameOf('Maya van der Berg')).toBe('Maya B.');
  });
  it('the full name when the person chose it', () => {
    expect(displayNameOf('Maya Costa', { full: true })).toBe('Maya Costa');
  });
  it('one word stays one word, and nothing stays nothing', () => {
    expect(displayNameOf('Maya')).toBe('Maya');
    expect(displayNameOf('  ')).toBe('');
    expect(displayNameOf(null)).toBe('');
  });
  it('an email is never a name', () => {
    expect(displayNameOf('maya@northwind.test')).toBe('maya');
  });
});

describe('what I am working on', () => {
  const base = { members: [MAYA, JUN, ME], meId: ME, now: NOW };

  it('team: my teammates see the name off my running thread card, strangers read Private thread', () => {
    const input = { ...base, profiles: [prof(MAYA, 'Maya C.')], presence: [pres(MAYA)], teamCards: [card(MAYA, 'Cloud launch video')] };
    expect(wallCards({ ...input, teammates: [MAYA] }).find((c) => c.id === MAYA).workingOn).toBe('Cloud launch video');
    expect(wallCards({ ...input, teammates: [] }).find((c) => c.id === MAYA)).toMatchObject({ workingOn: null, workingPrivate: true });
  });

  it('everyone: the name rides on my presence, so everyone in the room sees it', () => {
    const w = wallCards({ ...base, teammates: [], profiles: [prof(MAYA, 'Maya C.', { show_working: 'everyone' })], presence: [pres(MAYA, { working_on: 'Cloud launch video' })], teamCards: [] });
    expect(w.find((c) => c.id === MAYA).workingOn).toBe('Cloud launch video');
  });

  it('none: nobody sees a name, teammates included, even with a running card; it reads Private thread', () => {
    const w = wallCards({ ...base, teammates: [MAYA], profiles: [prof(MAYA, 'Maya C.', { show_working: 'none' })], presence: [pres(MAYA, { working_on: 'should not show' })], teamCards: [card(MAYA, 'Cloud launch video')] });
    expect(w.find((c) => c.id === MAYA)).toMatchObject({ workingOn: null, workingPrivate: true });
  });

  it('nothing running is no line at all, whatever the setting', () => {
    const w = wallCards({ ...base, teammates: [MAYA], profiles: [prof(MAYA, 'Maya C.', { show_working: 'none' })], presence: [pres(MAYA, { agents_running: 0 })], teamCards: [] });
    expect(w.find((c) => c.id === MAYA)).toMatchObject({ workingOn: null, workingPrivate: false });
  });

  it('a private thread says so and is never named', () => {
    const w = wallCards({ ...base, teammates: [MAYA], profiles: [prof(MAYA, 'Maya C.')], presence: [pres(MAYA, { working_private: true })], teamCards: [] });
    expect(w.find((c) => c.id === MAYA)).toMatchObject({ workingOn: null, workingPrivate: true });
  });

  it('a done card is not what they are working on now: running with no shared card reads Private thread', () => {
    const w = wallCards({ ...base, teammates: [MAYA], profiles: [prof(MAYA, 'Maya C.')], presence: [pres(MAYA)], teamCards: [card(MAYA, 'Old thing', { state: 'done' })] });
    expect(w.find((c) => c.id === MAYA)).toMatchObject({ workingOn: null, workingPrivate: true });
  });
});

describe('two Macs, and a Mac gone quiet', () => {
  it('agents and hours add up across a person’s Macs', () => {
    const w = wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.')],
      presence: [pres(MAYA, { device: 'aaaaaaaaaaaa', agents_running: 3, hours_total: 1000, hours_week: 10 }), pres(MAYA, { device: 'bbbbbbbbbbbb', agents_running: 1, hours_total: 240, hours_week: 5 })] });
    expect(w[0]).toMatchObject({ agents: 4, hoursTotal: 1240, hoursWeek: 15, level: 43 });
  });

  it('a Mac silent for 15 minutes counts no running agents, but its hours stay', () => {
    const w = wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.')],
      presence: [pres(MAYA, { agents_running: 3, hours_total: 50, updated_at: new Date(NOW - 16 * MIN).toISOString() })] });
    expect(w[0]).toMatchObject({ agents: 0, hoursTotal: 50 });
  });

  it('last week’s numbers do not count as this week’s', () => {
    const w = wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.')],
      presence: [pres(MAYA, { hours_week: 30, week_start: '2026-10-12', hours_today: 4, day: '2026-10-16' })] });
    expect(w[0]).toMatchObject({ hoursWeek: 0, hoursToday: 0 });
  });

  it('the months for their chart add up across Macs, oldest first', () => {
    const w = wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.')],
      presence: [pres(MAYA, { device: 'aaaaaaaaaaaa', hours_by_month: [{ month: '2026-09', hours: 10 }, { month: '2026-10', hours: 5 }] }),
        pres(MAYA, { device: 'bbbbbbbbbbbb', hours_by_month: [{ month: '2026-10', hours: 2 }, { month: '2026-08', hours: 1 }] })] });
    expect(w[0].byMonth).toEqual([{ month: '2026-08', hours: 1 }, { month: '2026-09', hours: 10 }, { month: '2026-10', hours: 7 }]);
  });

  it('a card says whether they are on my team', () => {
    const w = wallCards({ members: [MAYA, JUN], meId: ME, now: NOW, teammates: [MAYA], teamCards: [], profiles: [prof(MAYA, 'Maya C.'), prof(JUN, 'Jun O.')], presence: [] });
    expect(w.map((c) => [c.name, c.teammate])).toEqual([['Jun O.', false], ['Maya C.', true]]);
  });

  it('days in a row join up across Macs', () => {
    const w = wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.')],
      presence: [pres(MAYA, { device: 'aaaaaaaaaaaa', active_days: ['2026-10-20', '2026-10-22'] }), pres(MAYA, { device: 'bbbbbbbbbbbb', active_days: ['2026-10-21'] })] });
    expect(w[0].streak).toBe(3);
  });
});

describe('what a card shows', () => {
  it('a card says whether its person shares their activity, on unless they turned it off', () => {
    const w = wallCards({ members: [MAYA, JUN], meId: ME, now: NOW, teammates: [], teamCards: [], presence: [],
      profiles: [prof(MAYA, 'Maya C.'), prof(JUN, 'Jun O.', { show_activity: false })] });
    expect(w.map((c) => [c.name, c.showActivity])).toEqual([['Jun O.', false], ['Maya C.', true]]);
  });

  it('switches off blank their field', () => {
    const w = wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [],
      profiles: [prof(MAYA, 'Maya C.', { show_agents: false, show_level: false, show_status: false, status_text: 'Heads down', status_until: null })], presence: [pres(MAYA)] });
    expect(w[0]).toMatchObject({ agents: null, level: null, status: null });
  });
  it('a status that has run out is not shown', () => {
    const w = wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [],
      profiles: [prof(MAYA, 'Maya C.', { status_text: 'Out at 4', status_until: new Date(NOW - MIN).toISOString() })], presence: [pres(MAYA)] });
    expect(w[0].status).toBeNull();
  });
  it('someone who never turned Rooms on (no profile) is not on the wall', () => {
    expect(wallCards({ members: [MAYA, THEO], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.')], presence: [] }).map((c) => c.id)).toEqual([MAYA]);
  });
  it('a profile with no presence yet is on the wall, not running', () => {
    expect(wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.')], presence: [] })[0]).toMatchObject({ agents: 0, level: 1 });
  });
  it('my own card names my own thread, whatever it shows others', () => {
    const w = wallCards({ members: [ME], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(ME, 'Sam R.', { show_working: 'none' })],
      presence: [pres(ME, { working_private: true })], mine: { workingOn: 'Pricing page copy', workingPrivate: false } });
    expect(w[0]).toMatchObject({ me: true, workingOn: 'Pricing page copy', workingPrivate: false });
    expect(wallCards({ members: [ME], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(ME, 'Sam R.')], presence: [pres(ME, { working_private: true })] })[0].workingPrivate).toBe(true);
  });

  it('me, while invisible, is not on my own wall', () => {
    const w = wallCards({ members: [MAYA, ME], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.'), prof(ME, 'Sam R.', { invisible_until: new Date(NOW + 60 * MIN).toISOString() })], presence: [] });
    expect(w.map((c) => c.id)).toEqual([MAYA]);
  });
  it('the wall keeps one order, by name, so cards never jump', () => {
    const w = wallCards({ members: [THEO, MAYA, ME, JUN], meId: ME, now: NOW, teammates: [], teamCards: [],
      profiles: [prof(THEO, 'Theo B.'), prof(MAYA, 'Maya C.'), prof(ME, 'Sam R.'), prof(JUN, 'Jun O.')], presence: [pres(THEO, { agents_running: 9 })] });
    expect(w.map((c) => c.name)).toEqual(['Jun O.', 'Maya C.', 'Sam R.', 'Theo B.']);
    expect(w.find((c) => c.id === ME).me).toBe(true);
  });
  it('a card is only for someone in the room', () => {
    expect(wallCards({ members: [MAYA], meId: ME, now: NOW, teammates: [], teamCards: [], profiles: [prof(MAYA, 'Maya C.'), prof(JUN, 'Jun O.')], presence: [] }).map((c) => c.id)).toEqual([MAYA]);
  });
});

describe('the row my Mac publishes', () => {
  const products = [
    { slug: 'northwind', name: 'Northwind', team: { projectId: 'nw', teamId: 't1', people: [], sharedBy: ME } },
    { slug: 'mine', name: 'My Workspace', personal: true },
  ];
  const items = [
    { id: 'w-a', product: 'northwind', label: 'Cloud launch video', title: 'make the cloud launch video', createdAt: NOW - 60 * MIN },
    { id: 'w-b', product: 'northwind', label: 'Secret pricing', title: 'x', visibility: 'private', createdAt: NOW - 60 * MIN },
    { id: 'w-c', product: 'mine', label: 'Dentist', title: 'x', createdAt: NOW - 60 * MIN },
    { id: 'w-d', product: 'northwind', label: 'Only for Theo', title: 'x', visibility: 'people', visibleTo: [THEO], createdAt: NOW - 60 * MIN },
  ];
  const summary = { total: 1240, week: 15, weekStart: '2026-10-19', today: 2, day: '2026-10-22', streak: 3, activeDays: ['2026-10-22'], byMonth: [] };
  const run = (itemId, startedAt) => ({ itemId, product: items.find((i) => i.id === itemId).product, startedAt });

  it('the newest running thread, named only when everyone may see it', () => {
    const running = [run('w-a', NOW - 10 * MIN)];
    expect(myPresence({ running, items, products, summary, now: NOW, showWorking: 'everyone' })).toMatchObject({ agents_running: 1, working_on: 'Cloud launch video', working_private: false });
    expect(myPresence({ running, items, products, summary, now: NOW, showWorking: 'team' })).toMatchObject({ working_on: null, working_private: false });
    expect(myPresence({ running, items, products, summary, now: NOW, showWorking: 'none' })).toMatchObject({ working_on: null, working_private: false });
  });

  it('a private thread, a personal project, or one shown to chosen people, is private', () => {
    for (const id of ['w-b', 'w-c', 'w-d']) {
      expect(myPresence({ running: [run(id, NOW - MIN)], items, products, summary, now: NOW, showWorking: 'everyone' }), id).toMatchObject({ working_on: null, working_private: true });
    }
  });

  it('the one that started last wins', () => {
    const running = [run('w-b', NOW - MIN), run('w-a', NOW - 30 * MIN)];
    expect(myPresence({ running, items, products, summary, now: NOW, showWorking: 'everyone' })).toMatchObject({ agents_running: 2, working_private: true });
  });

  it('nothing running is nothing named, and the hours still go up', () => {
    expect(myPresence({ running: [], items, products, summary, now: NOW, showWorking: 'everyone' })).toMatchObject({ agents_running: 0, working_on: null, working_private: false, hours_total: 1240, hours_week: 15, week_start: '2026-10-19', streak_days: 3 });
  });

  it('a long name is cut to fit', () => {
    const long = [{ ...items[0], label: 'x'.repeat(90) }];
    expect(myPresence({ running: [run('w-a', NOW)], items: long, products, summary, now: NOW, showWorking: 'everyone' }).working_on).toHaveLength(64);
  });
});

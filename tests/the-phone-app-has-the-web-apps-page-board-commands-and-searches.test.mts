// THE PHONE APP HAS THE WEB APP'S THREAD PAGE, TEAM BOARD, COMMANDS AND SEARCHES.
//
// Read side by side on 2026-10-30, and asked for that day: six things were on
// the web app and not on the iPhone app. A thread drew its whole conversation
// where the web app draws one answer on a page. With a team on there was no
// Everything else. The magnifier found threads and ran no command. A permission
// card could not be put aside. A file in a group message read as its link's
// raw text. Settings had no search. The rules are the web app's; these pin the
// phone's use of them, on threads and groups in the shape the computer sends.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { askUnderAnswer, pageOf } from '../mobile/src/lib/one-page';
import { cardsDrawn, cardsShown, myItems, phoneMembers, threadCardOf } from '../mobile/src/lib/everything';
import { commandsFor, phoneCommands } from '../mobile/src/lib/palette';
import { bodyParts, pictureType } from '../mobile/src/lib/groups';
import { searchSettings } from '../renderer/src/settings-search';

const read = (p) => fs.readFileSync(p, 'utf8');
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const said = (at, who, text) => ({ at, who, text });
const item = (more = {}) => ({ id: 'w-1', product: 'p', title: 'Plan the launch', status: 'blocked', labels: ['founder'], ...more });

describe('a thread as one page', () => {
  const six = [said(1, 'you', 'Ask'), said(2, 'them', 'One'), said(3, 'you', 'Two'), said(4, 'them', 'Three'), said(5, 'you', 'Four')];
  const outcome = (text, field = 'result') => ({ at: 9, text, field });
  it('heads with its name and Context, and leads with the newest answer under its bold line', () => {
    const p = pageOf(item({ problem: 'Why this thread exists.' }), six, outcome('**It is ready.**\n\nHere is why.'), [], false);
    expect(p).toMatchObject({ title: 'Plan the launch', context: 'Why this thread exists.', answer: { at: 9, headline: 'It is ready.', rest: 'Here is why.' }, toggle: 'Show 5 earlier messages' });
  });
  it('does not draw a bold line that only repeats the name', () => {
    expect(pageOf(item(), six, outcome('**Plan the launch**\n\nDone.'), [], false).answer.headline).toBeNull();
  });
  it('opens the fold into the whole conversation', () => {
    const p = pageOf(item(), six, outcome('Done.'), [], true);
    expect(p.answer).toBeNull();
    expect(p.from).toBe(0);
    expect(p.toggle).toBe('Hide earlier messages');
  });
  it('draws the conversation whole when only a message or two would be folded', () => {
    const p = pageOf(item(), [said(1, 'you', 'Ask')], outcome('Done.'), [], false);
    expect(p.answer).toBeNull();
    expect(p.toggle).toBeNull();
  });
  it('with no answer yet draws the conversation, with nothing to fold', () => {
    expect(pageOf(item(), [said(1, 'you', 'Ask')], null, [], false)).toMatchObject({ answer: null, toggle: null, from: 0 });
  });
  it('answered since, starts from that answer so the question stays in view', () => {
    const events = [said(1, 'you', 'A'), said(2, 'them', 'B'), said(3, 'you', 'C'), said(4, 'them', 'D'), said(5, 'you', 'E'), said(6, 'them', 'Which one?'), said(7, 'you', 'This one')];
    const p = pageOf(item(), events, null, [], false);
    expect(p.answer).toBeNull();
    expect(p.from).toBe(5);
  });
  it('keeps the app\'s own note under the answer, never in its place', () => {
    const p = pageOf(item({ wrote: { note: { source: 'system' } } }), six.concat(said(6, 'them', 'The real answer')), outcome('Shipped to main as abc.', 'note'), [], false);
    expect(p.answer.rest).toBe('The real answer');
    expect(p.appNote).toBe('Shipped to main as abc.');
  });
  it('the choices drop a heading that only repeats the bold line, and keep any other', () => {
    expect(askUnderAnswer('It is ready.', 'It is ready.')).toBe('');
    expect(askUnderAnswer('Which one?', 'It is ready.')).toBe('Which one?');
    expect(askUnderAnswer('Which one?', null)).toBe('Which one?');
  });
  it('the screen walks Needs you, folds the choices and opens at the top', () => {
    const src = read('mobile/src/app/thread/[product]/[id].tsx');
    expect(src).toMatch(/spotIn\(c\.tabs\.inbox/);
    expect(src).toMatch(/label="Next thread"/);
    expect(src).toMatch(/foldedChoices=/);
    expect(src).toMatch(/resting\.current = !page\.answer && !thread\.outcome && page\.from === 0/);
    expect(read('mobile/src/ui/ThreadParts.tsx')).toMatch(/accessibilityLabel="Fold the choices"/);
  });
});

describe('Everything else', () => {
  const card = (id, name, more = {}) => ({ id, name, me: false, avatarUrl: null, agents: 0, level: null, workingOn: null, workingPrivate: false, status: null, ...more });
  const team = { id: 'r-team', name: 'Team', kind: 'room', teamId: 't', lastAt: 5, unread: 2, people: [{ id: 'me', name: 'Ada', avatarUrl: null }, { id: 'p-2', name: 'Sam', avatarUrl: null }], wall: [card('me', 'Ada', { me: true, agents: 2 }), card('p-2', 'Sam', { agents: 1, workingOn: 'A thing' })] };
  const dm = { id: 'r-dm', name: 'Sam', kind: 'group', teamId: null, lastAt: 7, unread: 0, wall: [card('me', 'Ada', { me: true }), card('p-2', 'Sam')] };
  const other = { id: 'r-launch', name: 'Launch', kind: 'room', teamId: null, lastAt: 9, unread: 1, wall: [] };
  const mate = { id: 't-a', name: 'Chief', letter: 'C', role: null, now: null, status: 'active', paused: false, running: null, waiting: [] };
  it('cards are you, the team, each person, each teammate and your other chats', () => {
    const members = phoneMembers({ meId: 'me', rooms: [team, dm, other], messages: { 'r-team': [{ body: 'Hi' }] }, mates: [mate], store: store() });
    expect(members.map((m) => m.key)).toEqual(['me', 'room:r-team', 'person:p-2', 'mate:t-a', 'room:r-launch']);
    expect(members[0]).toMatchObject({ name: 'You', faceName: 'Ada', agents: 2 });
    expect(members[1]).toMatchObject({ team: true, unread: true });
  });
  it('a teammate counts the agents on its own runs, not on yours', () => {
    const items = [{ id: 'w-1', labels: ['teammate:t-a'], title: 'Its run' }, { id: 'w-2', labels: [], title: 'Mine' }, { id: 'w-3', labels: ['teammate:t-a'], title: 'Idle' }];
    const members = phoneMembers({ meId: 'me', rooms: [], messages: {}, mates: [mate], items, running: [{ itemId: 'w-1' }, { itemId: 'w-2' }], store: store() });
    expect(members.find((m) => m.key === 'mate:t-a').agents).toBe(1);
    expect(members[0]).toMatchObject({ agents: 1, now: 'Mine' });
  });
  it('with no team group the people on your team are still cards', () => {
    const members = phoneMembers({ meId: 'me', rooms: [], messages: {}, teamPeople: [{ id: 'me', name: 'Ada' }, { id: 'p-9', name: null, email: 'kai@example.test' }], store: store() });
    expect(members.map((m) => m.name)).toEqual(['You', 'kai@example.test']);
  });
  it('your own board leaves your teammates\' runs to their cards', () => {
    expect(myItems([{ id: 'a', labels: ['teammate:t-a'] }, { id: 'b', labels: ['founder'] }, { id: 'c' }]).map((i) => i.id)).toEqual(['b', 'c']);
  });
  it('one row of two cards, with the line that shows the rest, and the lit card kept in view', () => {
    expect(cardsShown(2, false)).toEqual({ count: 2, line: null });
    expect(cardsShown(5, false)).toEqual({ count: 2, line: 'Show 3 more' });
    expect(cardsShown(5, true)).toEqual({ count: 5, line: 'Show fewer' });
    const m = ['a', 'b', 'c', 'd'].map((key) => ({ key }));
    expect(cardsDrawn(m, 'd', false).map((x) => x.key)).toEqual(['a', 'd']);
    expect(cardsDrawn(m, 'a', false).map((x) => x.key)).toEqual(['a', 'b']);
  });
  it('a shared thread reads as a card, and a private one keeps its words out', () => {
    expect(threadCardOf({ person_id: 'p', thread_id: 't', visible: false, title: null, state: 'running', updated_at: '2026-10-30T00:00:00Z' })).toMatchObject({ personId: 'p', threadId: 't', visible: false, title: null, state: 'running' });
  });
  it('the page draws it under the tabs, and the board is yours', () => {
    const src = read('mobile/src/app/index.tsx');
    expect(src).toMatch(/<EverythingPlace mine=/);
    expect(src).toMatch(/items: myItems\(c\.view\.items\)/);
    expect(src).toMatch(/col\.state !== 'waiting'/);
  });
});

describe('the magnifier runs commands', () => {
  const all = phoneCommands({ team: true, mates: [{ id: 't-a', name: 'Chief of staff' }], groups: [{ id: 'r', name: 'Launch week' }], looks: [{ id: 'dark', name: 'Dark' }], pages: [{ id: 'team', label: 'Team' }] });
  it('offers the phone\'s places, teammates, groups, looks and Settings pages', () => {
    expect(all.map((c) => c.label)).toEqual(expect.arrayContaining(['New thread', 'Needs you', 'Everything else', 'Chats', 'In progress', 'View and filters', 'New teammate', 'Chief of staff', 'Launch week', 'Dark', 'Team']));
  });
  it('offers no team places, teammate or group with no team', () => {
    const none = phoneCommands({ team: false }).map((c) => c.id);
    expect(none).toEqual(expect.arrayContaining(['new', 'inbox', 'progress']));
    expect(none).not.toContain('everything');
    expect(none).not.toContain('chats');
    expect(none).not.toContain('new-mate');
  });
  it('finds by its words, and a word nothing has finds nothing', () => {
    expect(commandsFor('', all)).toHaveLength(all.length);
    expect(commandsFor('later', all)[0].label).toBe('Later');
    expect(commandsFor('chief', all).map((c) => c.label)).toEqual(['Chief of staff']);
    expect(commandsFor('zzz', all)).toEqual([]);
  });
  it('lists threads first, then See all, then the commands', () => {
    const src = read('mobile/src/app/search.tsx');
    expect(src).toMatch(/found\.slice\(0, THREADS_SHOWN\)/);
    expect(src).toMatch(/See all \$\{found\.length\} threads/);
    expect(src).toMatch(/<Label>Commands<\/Label>/);
  });
});

describe('a permission card put aside', () => {
  it('leaves the screen with Minimize and comes back from Review in the top bar', () => {
    const card = read('mobile/src/ui/Approvals.tsx');
    expect(card).toMatch(/c\.setMinimizedApproval\(a\.id\)/);
    expect(card).toMatch(/c\.minimizedApproval === card\.id\) return null/);
    expect(read('mobile/src/ui/parts.tsx')).toMatch(/Review \(\$\{view\.approvals\.length\}\)/);
  });
});

describe('files in a group message', () => {
  it('are drawn in order with the words around them', () => {
    expect(bodyParts('Look ![The frame](attachments/f-1.png)\n\nnotes in [cut.pdf](attachments/f-2.pdf).')).toEqual([
      { kind: 'words', text: 'Look' },
      { kind: 'picture', name: 'f-1.png', alt: 'The frame' },
      { kind: 'words', text: 'notes in' },
      { kind: 'file', name: 'f-2.pdf', label: 'cut.pdf' },
    ]);
    expect(bodyParts('[cut.pdf](attachments/f-2.pdf) is the one')).toEqual([{ kind: 'file', name: 'f-2.pdf', label: 'cut.pdf' }, { kind: 'words', text: 'is the one' }]);
    expect(bodyParts('Is it done?')).toEqual([{ kind: 'words', text: 'Is it done?' }]);
  });
  it('a plain message, a web link and a path out of the folder stay words', () => {
    expect(bodyParts('Just words')).toEqual([{ kind: 'words', text: 'Just words' }]);
    expect(bodyParts('See [the site](https://example.test)')).toEqual([{ kind: 'words', text: 'See [the site](https://example.test)' }]);
    expect(bodyParts('[x](attachments/../secret)')).toEqual([{ kind: 'words', text: '[x](attachments/../secret)' }]);
  });
  it('a picture draws by its own type', () => {
    expect(pictureType('a.JPG')).toBe('image/jpeg');
    expect(pictureType('a.webp')).toBe('image/webp');
  });
  it('are fetched through the phone site\'s own file door', () => {
    expect(read('mobile/src/state/groups.tsx')).toMatch(/groups\.door\(\{ op: 'file', args: \[roomId, name\] \}\)/);
  });
});

describe('Settings search', () => {
  const pages = ['general', 'appearance', 'claude', 'projects'];
  it('reads the desktop\'s index, only over the pages the phone has', () => {
    expect(searchSettings('sign out', { pages }).map((h) => h.page)).toContain('general');
    expect(searchSettings('sign out', { pages: ['appearance'] })).toEqual([]);
    expect(searchSettings('', { pages })).toEqual([]);
  });
  it('finds a project by name, and matches only at the start of a word', () => {
    expect(searchSettings('launch', { pages, projects: [{ slug: 'film', name: 'Launch film' }] })[0]).toMatchObject({ page: 'project:film', label: 'Launch film' });
    expect(searchSettings('aunch', { pages, projects: [{ slug: 'film', name: 'Launch film' }] })).toEqual([]);
  });
  it('is an icon that opens across the Back row', () => {
    const src = read('mobile/src/app/settings/index.tsx');
    expect(src).toMatch(/label="Search settings"/);
    expect(src).toMatch(/searchSettings\(q,/);
    expect(read('mobile/src/ui/SettingsParts.tsx')).toMatch(/\{head \?\? \(/);
  });
});

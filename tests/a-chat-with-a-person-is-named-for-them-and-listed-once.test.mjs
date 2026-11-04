// A CHAT WITH A PERSON IS NAMED FOR THEM, AND EACH PERSON IS LISTED ONCE.
//
// Seen by Sofia and Dev. Chats > People read "Dev, Maya, Maya", both Mayas
// opening the same chat: groupChoices kept every conversation, so a room chat
// with Maya and her direct record were two rows. Dev's chat with Sofia was
// titled "Copy link button onboarding", the label the row namer wrote from its
// first message, because a direct conversation's name took any label first.
// "Message Dev" opened a box saying "Reply to Agent, Dev's", the plain agent
// name standing in for Dev. And a team member with no name of their own showed
// as "Seat", nobody anyone knew. Measured by calling each rule with the shapes
// those rows had.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { groupChoices } from '../renderer/src/team/rooms/GroupList.tsx';
import { directConversations } from '../renderer/src/team/rooms/conversations.ts';
import { conversationName } from '../renderer/src/threads/page-rules.ts';
import { replyName } from '../renderer/src/reply-keys.ts';
import { nameIsAPersons, teamPeopleShown } from '../shared/team-rules.mjs';

const chat = (key, people, at, name = 'x') => ({ key, kind: key.startsWith('room') ? 'group' : 'direct', id: key, name, people, faces: people.map((p) => ({ name: p, url: null })), last: '', at, unread: false });

describe('the People list', () => {
  it('lists Maya once, the newest chat with her', () => {
    const rows = groupChoices([chat('room:a', ['Maya'], 10), chat('direct:b', ['Maya'], 20), chat('direct:c', ['Dev'], 5)]);
    expect(rows.map((r) => r.name)).toEqual(['Maya', 'Dev']);
    expect(rows[0].key).toBe('direct:b');
  });
  it('a chat with Maya and Dev is not the chat with Maya', () => {
    const rows = groupChoices([chat('room:a', ['Maya'], 10), chat('room:b', ['Maya', 'Dev'], 20)]);
    expect(rows).toHaveLength(2);
  });
  it('two named groups are never folded into one', () => {
    const named = (key) => ({ ...chat(key, [], 1, 'Launch'), kind: 'room', faces: [] });
    expect(groupChoices([named('room:x'), named('room:y')])).toHaveLength(2);
  });
});

describe('the name of a chat with a person', () => {
  const people = new Map([['dev', { id: 'dev', name: 'Dev' }], ['sofia', { id: 'sofia', name: 'Sofia' }]]);
  const products = [{ slug: 'dm-dev', team: { direct: true, people: ['sofia', 'dev'] } }];
  const row = (label, source) => ({
    id: 'w-1', product: 'dm-dev', status: 'open', title: 'Copy link button onboarding', createdBy: 'sofia', people: ['sofia', 'dev'], updatedAt: 1,
    ...(label ? { label, wrote: { label: { ts: 1, source } } } : {}),
  });
  const name = (item) => directConversations({ items: [item], products, me: 'sofia', people, waiting: new Set() })[0].name;

  it('is the person, over a label the namer wrote', () => {
    expect(name(row('Copy link button onboarding', 'agent'))).toBe('Dev');
    expect(conversationName(row('Copy link button onboarding', 'agent'), products[0], 'sofia', (id) => people.get(id).name)).toBe('Dev');
  });
  it('is a name a person gave it, when they renamed it', () => {
    expect(name(row('Seat picker', 'founder'))).toBe('Seat picker');
    expect(conversationName(row('Seat picker', 'founder'), products[0], 'sofia', (id) => people.get(id).name)).toBe(null);
  });
  it('is the person when nothing named it', () => {
    expect(name(row())).toBe('Dev');
  });
  it('whose label is a person\'s is told apart from the namer\'s', () => {
    expect(nameIsAPersons({ label: 'Seat picker', wrote: { label: { ts: 1, source: 'founder' } } })).toBe(true);
    expect(nameIsAPersons({ label: 'Copy link', wrote: { label: { ts: 1, source: 'agent' } } })).toBe(false);
    expect(nameIsAPersons({})).toBe(false);
  });
  it('the thread\'s bar uses the same rule', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toMatch(/talkFull && !nameIsAPersons\(item\)/);
  });
});

describe('the reply box in a chat with a person', () => {
  const nameOf = (id) => ({ dev: 'Dev', maya: 'Maya' })[id];
  it('names the person when the plain agent wrote last', () => {
    expect(replyName({ talk: { chat: [{ by: 'dev', voice: { name: 'Agent' } }] } }, 'sofia', nameOf)).toBe(null);
  });
  it('still names an agent with a name of its own', () => {
    expect(replyName({ talk: { chat: [{ by: 'maya', voice: { name: 'Chief of staff' } }] } }, 'sofia', nameOf)).toBe('Chief of staff, Maya\'s');
  });
});

describe('the team as it is shown', () => {
  it('a member with no name is shown by their email', () => {
    const [p] = teamPeopleShown([{ id: 's', email: 'watcher@lumen.test', name: '' }]);
    expect(p.name).toBe('watcher@lumen.test');
  });
  it('a member whose name is only what the cloud made from their email is shown by the email', () => {
    // The sign-up trigger fills a missing name with the part before the @.
    const [p] = teamPeopleShown([{ id: 's', email: 'seat@lumen.test', name: 'seat' }]);
    expect(p.name).toBe('seat@lumen.test');
  });
  it('a member with a name keeps it', () => {
    expect(teamPeopleShown([{ id: 'm', email: 'maya@lumen.test', name: 'Maya' }])[0].name).toBe('Maya');
  });
  it('the same person twice is listed once', () => {
    expect(teamPeopleShown([{ id: 'm', email: 'maya@lumen.test', name: 'Maya' }, { id: 'm', email: 'maya@lumen.test', name: 'Maya' }])).toHaveLength(1);
  });
  it('the team is read through it', () => {
    const team = fs.readFileSync(new URL('../main/team/index.mjs', import.meta.url), 'utf8');
    expect(team.match(/teamPeopleShown\(await backend\.teamPeople/g) ?? []).toHaveLength(1);
    expect(team).toMatch(/backend\.teamPeople\(state\.team\.id\)\.then\(teamPeopleShown\)/);
  });
});

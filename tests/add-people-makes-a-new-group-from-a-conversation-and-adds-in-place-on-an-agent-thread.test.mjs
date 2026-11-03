// Agent threads had no Add people at all: someone wrote "Dev, please do it" in a
// thread Dev was not on, looked for Add people, and gave up. They have it now, and
// the person joins the thread's chosen people.
//
// A conversation with people is different, by the owner's decision. A first go at
// this added the person to the existing record, so they read all the history. That
// was taken back: Add people there opens New thread with everyone in To, which
// makes a separate group and leaves the conversation as it was.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import * as projects from '../main/team/projects.mjs';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mjs';
import { threadCommands } from '../renderer/src/thread-commands';
import { peopleToAdd, addPeopleToAgentThread, whatAddPeopleDoes } from '../renderer/src/threads/page-rules';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const company = [{ id: 'me', name: 'Me' }, { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const conversation = { team: { direct: true, people: ['me', 'a'], sharedBy: 'me' } };
const agentProject = { team: { direct: false, people: [], sharedBy: 'me' } };

describe('on a conversation', () => {
  it('opens New thread with everyone already in it in To', () => {
    expect(whatAddPeopleDoes({ product: conversation, item: {}, me: 'me', company })).toEqual({ opens: { to: 'a', also: [] } });
  });
  it('carries the whole group across, and the person who started the record', () => {
    const product = { team: { direct: true, people: ['me', 'a'], sharedBy: 'b' } };
    const { opens } = whatAddPeopleDoes({ product, item: {}, me: 'me', company });
    expect([opens.to, ...opens.also].sort()).toEqual(['a', 'b']);
  });
  it('never edits the conversation, even when handed a person', () => {
    const does = whatAddPeopleDoes({ product: conversation, item: {}, person: 'b', me: 'me', company });
    expect(does).toEqual({ opens: { to: 'a', also: [] } });
    expect(does).not.toHaveProperty('edits');
  });
  it('does nothing when the whole company is already in it', () => {
    const product = { team: { direct: true, people: ['me', 'a', 'b', 'c'], sharedBy: 'me' } };
    expect(whatAddPeopleDoes({ product, item: {}, me: 'me', company })).toBeNull();
  });
});

describe('nothing can add a person to an existing conversation', () => {
  it('the record has no way to gain them', () => {
    expect(projects).not.toHaveProperty('addPeopleToRecord');
  });
  it('sync does not write who joined into the record', () => {
    expect(read('main/team/sync.mjs')).not.toContain('peopleJoined');
    expect(read('main/team/index.mjs')).not.toContain('peopleJoined');
  });
  it('the window has no door for it', () => {
    expect(REQUEST_CHANNELS).not.toHaveProperty('teamAddPeople');
    expect(read('main/team/index.mjs')).not.toContain('addToConversation');
    expect(read('main/ipc.mjs')).not.toContain('zero:team-add-people');
  });
  it('neither cloud has one, and the database does not allow it', () => {
    const cloud = createMemoryCloud();
    const backend = memoryBackend(cloud, signUpMemory(cloud, { id: 'maya', email: 'maya@x.test', name: 'maya' }));
    expect(backend).not.toHaveProperty('addPeople');
    expect(read('main/team/supabase-backend.mjs')).not.toContain('async addPeople(');
    expect(fs.readdirSync(new URL('../cloud/supabase/migrations/', import.meta.url)).filter((f) => f.includes('anyone_in_a_conversation'))).toEqual([]);
  });
  it('the menu does not warn about history, because nobody reads it', () => {
    expect(read('renderer/src/team/TeamFocus.tsx')).not.toContain('They will see everything said here.');
  });
  it('the rule is written where the control is', () => {
    expect(read('renderer/src/team/TeamFocus.tsx')).toContain('IT ADDS NOBODY TO THIS CONVERSATION');
  });
});

describe('on an agent thread', () => {
  it('saves the person on the thread, in place', () => {
    expect(whatAddPeopleDoes({ product: agentProject, item: { visibility: 'people', visibleTo: ['a'] }, person: 'b', me: 'me', company }))
      .toEqual({ edits: { visibility: 'people', visibleTo: ['a', 'b'] } });
  });
  it('opens no New thread', () => {
    expect(whatAddPeopleDoes({ product: agentProject, item: {}, person: 'b', me: 'me', company })).not.toHaveProperty('opens');
  });
  it('does nothing until a person is picked', () => {
    expect(whatAddPeopleDoes({ product: agentProject, item: {}, me: 'me', company })).toBeNull();
  });
  it('offers everyone not already chosen', () => {
    expect(peopleToAdd({ item: { visibility: 'people', visibleTo: ['a'] }, me: 'me', company }).map((p) => p.id)).toEqual(['b', 'c']);
  });
  it('offers nothing when everyone is chosen, or nobody is signed in', () => {
    expect(peopleToAdd({ item: { visibleTo: ['a', 'b', 'c'] }, me: 'me', company })).toEqual([]);
    expect(peopleToAdd({ item: {}, me: null, company })).toEqual([]);
  });
  it('private or chosen becomes chosen, with the new person', () => {
    expect(addPeopleToAgentThread({ visibility: 'private', visibleTo: [] }, 'a')).toEqual({ visibility: 'people', visibleTo: ['a'] });
    expect(addPeopleToAgentThread({ visibility: 'people', visibleTo: ['b'] }, 'a')).toEqual({ visibility: 'people', visibleTo: ['b', 'a'] });
  });
  it('a thread the team sees stays seen by the team', () => {
    expect(addPeopleToAgentThread({ visibility: 'team', visibleTo: [] }, 'a')).toEqual({ visibility: 'team', visibleTo: ['a'] });
  });
  it('adding twice does not list them twice', () => {
    expect(addPeopleToAgentThread({ visibility: 'people', visibleTo: ['a'] }, 'a').visibleTo).toEqual(['a']);
  });
});

describe('command K says which it is', () => {
  const hint = (addPeople) => threadCommands({ addPeople }).find((c) => c.id === 'add-people')?.hint;
  it('on a conversation, a new one', () => {
    expect(hint(true)).toBe('a new conversation with them');
  });
  it('on an agent thread, this one', () => {
    expect(hint('thread')).toBe('puts them on this thread');
  });
  it('not offered when there is nobody to add', () => {
    expect(hint(false)).toBeUndefined();
  });
});

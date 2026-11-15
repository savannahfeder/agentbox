// A THREAD ABOUT WORK IS NAMED FOR THE WORK, WITH ITS PEOPLE AS THE AUDIENCE.
//
// Sofia: the header read "ONBOARDING DIRECTION A IMPLEMENTATION" over a
// film, the chat list called the same thing "Dev, Maya", and the inbox row named
// the first topic. A thread started with a subject now wears the subject, says
// "with Dev, Maya" beside it, and is never the row that "the conversation with
// Dev and Maya" means: not on the messages page, not for the card's "Continues
// your conversation". Read off the pure rules the header, the row and the card use.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { conversationName, conversationWith, workAudience } from '../renderer/src/threads/page-rules.ts';
import { directConversations } from '../renderer/src/team/rooms/conversations.ts';

const ME = 'p-sofia', DEV = 'p-dev', MAYA = 'p-maya';
const DIRECT = { slug: 'direct-1', name: 'Direct', team: { projectId: 'c1', teamId: 't', people: [DEV, MAYA], sharedBy: ME, direct: true } };
const PROJECT = { slug: 'lumen', name: 'Lumen', team: { projectId: 'c2', teamId: 't', people: [], sharedBy: ME } };
const names = { [DEV]: 'Dev', [MAYA]: 'Maya' };
const nameOf = (id) => names[id] ?? 'Someone';
const row = (over) => ({ id: 'w-1', product: DIRECT.slug, title: 'Morning', labels: ['founder'], people: [ME, DEV, MAYA], createdBy: ME, updatedAt: 1, status: 'open', ...over });
const talk = row({ id: 'w-talk', updatedAt: 1 });
const film = row({ id: 'w-film', title: 'Launch film shot list', labels: ['founder', 'work-thread'], updatedAt: 5 });

describe('the header of a thread about work', () => {
  it('says who it is with, after its name', () => {
    expect(workAudience(film, DIRECT, ME, nameOf)).toBe('with Dev, Maya');
  });
  it('one person reads the same way', () => {
    const pair = { ...DIRECT, team: { ...DIRECT.team, people: [DEV] } };
    expect(workAudience({ ...film, people: [ME, DEV] }, pair, ME, nameOf)).toBe('with Dev');
  });
  it('the conversation itself has none: it is already named for its people', () => {
    expect(workAudience(talk, DIRECT, ME, nameOf)).toBe(null);
  });
  it('an agent thread has none', () => {
    expect(workAudience({ ...film, product: PROJECT.slug }, PROJECT, ME, nameOf)).toBe(null);
  });
  it('the header draws it, and names the thread for its work', () => {
    const focus = fs.readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toMatch(/workAudience\(item,/);
    expect(focus).toMatch(/const named = direct && !givenTask && !audience/);
  });
});

// On screen the conversation's page still wore its first message, "Morning both",
// as its title: the old record's "Onboarding direction A implementation" again.
describe('the conversation itself is named for its people', () => {
  it('on its page', () => {
    expect(conversationName(talk, DIRECT, ME, nameOf)).toBe('Dev, Maya');
    const item = fs.readFileSync(new URL('../renderer/src/components/ItemThread.tsx', import.meta.url), 'utf8');
    expect(item).toMatch(/title=\{talkName \?\? pageTitle\(item\)\}/);
  });
  it('not a thread about work, a renamed one, or a task', () => {
    expect(conversationName(film, DIRECT, ME, nameOf)).toBe(null);
    expect(conversationName({ ...talk, label: 'Weekly' }, DIRECT, ME, nameOf)).toBe(null);
    expect(conversationName({ ...talk, labels: ['given-task'] }, DIRECT, ME, nameOf)).toBe(null);
    expect(conversationName({ ...talk, product: PROJECT.slug }, PROJECT, ME, nameOf)).toBe(null);
  });
});

describe('the conversation with these people is never the thread', () => {
  it('is the talk row though the thread is newer', () => {
    expect(conversationWith([DEV, MAYA], { products: [DIRECT], items: [talk, film], me: ME })?.id).toBe('w-talk');
  });
  it('is nothing when there are only threads', () => {
    expect(conversationWith([DEV, MAYA], { products: [DIRECT], items: [film], me: ME })).toBe(null);
  });
  it('the messages page lists the talk, not the thread', () => {
    const list = directConversations({ items: [talk, film], products: [DIRECT], me: ME, people: new Map(), waiting: new Set() });
    expect(list.map((c) => c.id)).toEqual(['w-talk']);
  });
});

describe('the inbox row of a thread about work', () => {
  it('leads with the work, not the people', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toMatch(/name=\{item\.label \|\| \(isWorkThread\(item\) \? item\.title : null\)\}/);
  });
});

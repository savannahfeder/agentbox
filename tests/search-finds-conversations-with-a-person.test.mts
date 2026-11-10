// Reported 2026-10-07: typing a person's name returned agent mentions and
// zero conversations with them. These fixtures reproduce a chat whose text
// never names its participants, plus two historical messages hidden behind
// the latest reply. No real messages or identities are used.
import { describe, expect, it } from 'vitest';
import { searchThreads, threadSearchDetails } from '../renderer/src/threads/search.ts';

const person = (id, name) => ({ id, name, email: '', avatarUrl: null });
const people = [person('self', 'Alex'), person('maya', 'Maya Rowan'), person('lee', 'Lee Chen')];
const project = (slug, members, sharedBy = 'self') => ({ slug, name: 'Direct', team: { direct: true, people: members, sharedBy } });
const products = [project('pair', ['maya']), project('group', ['maya', 'lee']), project('other', ['lee']), { slug: 'work', name: 'Northwind' }];
const context = { products, people, me: 'self' };
const row = (id, product, title, extra = {}) => ({ id, product, productName: products.find(p => p.slug === product).name, title, body: 'Hello there.', status: 'open', updatedAt: 1, ...extra });
const chat = row('chat', 'pair', 'A quick hello', { status: 'done', people: ['self', 'maya'], talk: {
  chat: [{ by: 'maya', text: 'The cobalt launch is ready.', ts: 1 }, { by: 'self', text: 'Thanks.', ts: 2 }],
  threads: { root: { by: 'maya', text: 'Shipping checklist', replies: [{ by: 'self', text: 'The violet invoice is paid.', ts: 3 }] } },
} });
const group = row('group', 'group', 'Lunch plans');
const other = row('other', 'other', 'Catch up');
const mention = row('mention', 'work', 'Maya Rowan gave feedback', { updatedAt: 100 });
const plain = row('plain', 'work', 'Update the website');
const items = [mention, plain, other, group, chat];
const ids = query => searchThreads(items, query, context).map(h => h.item.id);

describe('search by the person in a conversation', () => {
  it('puts the pair and group ahead of agent mentions, including closed chats', () => {
    expect(ids('Maya')).toEqual(['group', 'chat', 'mention']);
  });
  it('accepts an unfinished name, a surname and a full name', () => {
    for (const query of ['may', 'ROWAN', 'Maya Row']) expect(ids(query)).toContain('chat');
  });
  it('does not match the middle of a name or unrelated conversations', () => {
    expect(ids('aya')).toEqual([]);
    expect(ids('Maya')).not.toContain('other');
  });
  it('finds the creator when the other person started the conversation', () => {
    const c = { ...context, products: [project('pair', ['self'], 'maya')] };
    expect(searchThreads([chat], 'Maya', c).map(h => h.item.id)).toEqual(['chat']);
  });
  it('finds older chat messages and threaded replies and shows their matching words', () => {
    for (const phrase of ['cobalt launch', 'violet invoice', 'shipping checklist']) {
      const hits = searchThreads(items, phrase, context);
      expect(hits.map(h => h.item.id)).toEqual(['chat']);
      expect(hits[0].summary.toLowerCase()).toContain(phrase);
    }
  });
  it('combines a participant name with message text without inventing a phrase across them', () => {
    expect(ids('Maya cobalt')).toEqual(['chat']);
    expect(ids('"Rowan cobalt"')).toEqual([]);
  });
  it('keeps the original subject searchable', () => {
    expect(ids('quick hello')).toEqual(['chat']);
    expect(searchThreads(items, 'quick hello', context)[0].summary).toContain('quick hello');
  });
  it('refreshes participant names when the people snapshot changes', () => {
    const changed = { ...context, people: [people[0], person('maya', 'Robin Vale'), people[2]] };
    expect(searchThreads([chat], 'Robin', changed).map(h => h.item.id)).toEqual(['chat']);
    expect(searchThreads([chat], 'Maya', changed)).toEqual([]);
  });
  it('does not invent a quoted phrase across messages or participants', () => {
    expect(ids('"ready Thanks"')).toEqual([]);
    expect(ids('"Rowan Lee"')).toEqual([]);
  });
  it('never searches names of people who are not in the conversation', () => {
    expect(searchThreads([chat], 'Lee', context)).toEqual([]);
    expect(searchThreads([plain], 'Maya', context)).toEqual([]);
  });
  it('keeps chats and agent threads together, including completed chats in a blank search', () => {
    expect(new Set(ids(''))).toEqual(new Set(items.map(item => item.id)));
  });
  it('provides each conversation participant for the same photos used in the inbox', () => {
    expect(threadSearchDetails(chat, context)).toEqual({ title: 'Maya Rowan', kind: 'chat', people: ['maya'] });
    expect(threadSearchDetails(group, context).title).toBe('Maya Rowan, Lee Chen');
    expect(threadSearchDetails(mention, context).kind).toBe('agent');
    expect(threadSearchDetails(group, context).people).toEqual(['maya', 'lee']);
    expect(threadSearchDetails(mention, context).people).toEqual([]);
  });
  it('leaves ordinary single-person searches working and returns original objects', () => {
    const hits = searchThreads([plain], 'website', { products: [], people: [], me: null });
    expect(hits[0].item).toBe(plain);
    expect(hits[0].summary).toBe('Hello there.');
  });
});

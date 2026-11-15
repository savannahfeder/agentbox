// "Hand to an agent" prefilled the conversation's FIRST message, whichever one was
// pressed: seen four times by one person, who each time selected it all and retyped;
// one thread then came out titled "Dev asked:". And it always started a new agent,
// so two agents built the same page while that person carried the answer between
// them. It now carries the pressed message, who wrote it and its files, and if an
// agent is already on the work it offers sending there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { handOffStart, agentOnThisWork, handedFromLabel } from '../renderer/src/threads/composer-rules';

describe('what the card opens with', () => {
  const start = (over) => handOffStart({ product: 'd', id: 'w', message: { uid: 'm2', text: 'Ship option B', by: 'maya' }, nameOf: (id) => ({ maya: 'Maya' })[id] ?? null, dir: '/x/d', ...over });
  it('the pressed message, signed', () => {
    const s = start();
    expect(s.body).toBe('Maya wrote: Ship option B\n\n');
    expect(s.to).toBe('agent');
    expect(s.handFrom).toEqual({ product: 'd', id: 'w', message: 'm2' });
  });
  it('another message gets another start', () => {
    expect(start({ message: { uid: 'm1', text: 'Which option?', by: 'maya' } }).body).toContain('Which option?');
  });
  it('nobody known: the words alone', () => expect(start({ message: { uid: 'm', text: 'Hi', by: 'x' } }).body).toBe('Hi\n\n'));
  it('its files come along and leave the words', () => {
    const s = start({ message: { uid: 'm', by: 'maya', text: 'Deck here\n\n[deck.pdf](attachments/a-deck.pdf)\n![one.png](attachments/b-one.png)' } });
    expect(s.body).toBe('Maya wrote: Deck here\n\n');
    expect(s.attachments).toEqual([
      { name: 'deck.pdf', srcPath: '/x/d/attachments/a-deck.pdf', image: false },
      { name: 'one.png', srcPath: '/x/d/attachments/b-one.png', image: true },
    ]);
  });
  it('a link to the web is not a file', () => {
    const s = start({ message: { uid: 'm', by: 'maya', text: 'See [the page](https://x.test/a)' } });
    expect(s.attachments).toEqual([]);
    expect(s.body).toContain('[the page](https://x.test/a)');
  });
  it('the title is not "Dev asked:"', () => {
    expect(start().body.split('\n')[0]).not.toMatch(/asked:$/);
  });
});

describe('an agent already on this work', () => {
  const label = handedFromLabel('d', 'w');
  const row = (over) => ({ product: 'p', id: 'a', status: 'in-progress', labels: [label], ...over });
  it('finds the live one that was handed from this conversation', () => {
    expect(agentOnThisWork([row()], { product: 'd', id: 'w' })?.id).toBe('a');
  });
  it('the newest of several', () => {
    expect(agentOnThisWork([row({ id: 'old', updatedAt: 1 }), row({ id: 'new', updatedAt: 2 })], { product: 'd', id: 'w' })?.id).toBe('new');
  });
  it('must NOT offer a finished one, or one from another conversation', () => {
    expect(agentOnThisWork([row({ status: 'done' })], { product: 'd', id: 'w' })).toBeNull();
    expect(agentOnThisWork([row({ labels: [handedFromLabel('d', 'other')] })], { product: 'd', id: 'w' })).toBeNull();
    expect(agentOnThisWork([row({ labels: [] })], { product: 'd', id: 'w' })).toBeNull();
  });
  it('the card offers it and files the label', () => {
    const src = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
    expect(src).toContain('agentOnThisWork(');
    expect(src).toContain('handedFromLabel(');
  });
});

describe('the press reaches the handler with the message', () => {
  it('the chat passes the message it was pressed on', () => {
    expect(fs.readFileSync(new URL('../renderer/src/components/Thread.tsx', import.meta.url), 'utf8')).toMatch(/onHandToAgent\(e\)/);
    expect(fs.readFileSync(new URL('../renderer/src/team/ThreadPanel.tsx', import.meta.url), 'utf8')).toMatch(/onHandToAgent\(e\)/);
  });
});

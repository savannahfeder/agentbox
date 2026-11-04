// A task nearly went to Jordan: the New thread box opens on whoever was picked
// last, so a job meant for an agent read "Message Jordan" (seen by three people,
// three times in ten minutes by one). Auto or a coding agent still sticks; a person
// or AI teammate does not. "@" in the box did nothing, though it works everywhere
// else, and "Send as" looked like plain text.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { readLastRecipient, writeLastRecipient } from '../renderer/src/threads/recipient';
import { atWordAt, atOffers, withoutAtWord, dueChoices } from '../renderer/src/threads/composer-rules';

const fake = (start) => { const m = new Map(start ? [['zero.lastThreadRecipient', JSON.stringify(start)]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const people = [{ id: 'jordan', name: 'Jordan' }, { id: 'maya', name: 'Maya Chen' }];
const mates = [{ id: 'sup', name: 'Support lead' }];

describe('what the card opens on', () => {
  it('a person picked last is not kept', () => {
    const s = fake();
    writeLastRecipient({ to: 'jordan', mate: null, auto: false }, s);
    expect(readLastRecipient(people, mates, true, s).to).toBe('agent');
  });
  it('a teammate picked last is not kept', () => {
    const s = fake();
    writeLastRecipient({ to: 'agent', mate: 'sup', auto: false }, s);
    expect(readLastRecipient(people, mates, true, s).mate).toBeNull();
  });
  it('a person already saved by an older build is not honoured', () => {
    expect(readLastRecipient(people, mates, true, fake({ to: 'jordan', mate: null, auto: false })).to).toBe('agent');
    expect(readLastRecipient(people, mates, true, fake({ to: 'agent', mate: 'sup', auto: false })).mate).toBeNull();
  });
  it('picking a person does not forget Auto or the agent', () => {
    const s = fake({ to: 'agent', mate: null, auto: false });
    writeLastRecipient({ to: 'jordan', mate: null, auto: false }, s);
    expect(readLastRecipient(people, mates, true, s)).toEqual({ to: 'agent', mate: null, auto: false });
  });
  it('Auto and a coding agent stick', () => {
    const s = fake();
    writeLastRecipient({ to: 'agent', mate: null, auto: true }, s);
    expect(readLastRecipient(people, mates, true, s).auto).toBe(true);
    writeLastRecipient({ to: 'agent', mate: null, auto: false }, s);
    expect(readLastRecipient(people, mates, true, s).auto).toBe(false);
  });
});

describe('@ in the box', () => {
  it('finds the word being typed at the caret', () => {
    expect(atWordAt('@', 1)).toEqual({ from: 0, word: '' });
    expect(atWordAt('hello @ma', 9)).toEqual({ from: 6, word: 'ma' });
    expect(atWordAt('hello @maya chen', 11)).toEqual({ from: 6, word: 'maya' });
  });
  it('must NOT open inside an address or after the word is finished', () => {
    expect(atWordAt('me@lumen.test', 13)).toBeNull();
    expect(atWordAt('hello @maya ', 12)).toBeNull();
    expect(atWordAt('no at sign', 10)).toBeNull();
  });
  it('offers people then teammates', () => {
    expect(atOffers('', people, mates).map((o) => o.id)).toEqual(['jordan', 'maya', 'sup']);
    expect(atOffers('ma', people, mates).map((o) => o.id)).toEqual(['maya']);
    expect(atOffers('sup', people, mates)[0]).toMatchObject({ id: 'sup', kind: 'mate' });
    expect(atOffers('chen', people, mates).map((o) => o.id)).toEqual(['maya']);
    expect(atOffers('zz', people, mates)).toEqual([]);
  });
  it('a pick takes the @word out and keeps the rest', () => {
    expect(withoutAtWord('please @ma look', { from: 7, word: 'ma' })).toEqual({ text: 'please look', caret: 7 });
    expect(withoutAtWord('@ma', { from: 0, word: 'ma' })).toEqual({ text: '', caret: 0 });
  });
  it('the card draws it', () => {
    expect(fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8')).toContain('atOffers(');
  });
});

describe('Send as can be seen', () => {
  const src = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
  it('both choices are drawn, not one word behind a menu', () => {
    expect(src).toContain('tc-seg');
    expect(src).not.toContain('sendAsMenu');
  });
});

describe('the deadline picker names the day', () => {
  const fri = new Date(2026, 9, 30, 12);
  it('today, tomorrow and later days carry weekday, date and month', () => {
    const labels = dueChoices(fri).map((c) => c.label);
    expect(labels[1]).toBe('Today, Fri 30 Oct');
    expect(labels[2]).toBe('Tomorrow, Sat 31 Oct');
    expect(labels[5]).toBe('Tue 3 Nov');
  });
  it('still offers no deadline first, and seven days', () => {
    const c = dueChoices(fri);
    expect(c[0].key).toBeNull();
    expect(c).toHaveLength(8);
  });
});

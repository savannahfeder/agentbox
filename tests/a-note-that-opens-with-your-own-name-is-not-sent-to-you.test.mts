// A NOTE THAT OPENS WITH YOUR OWN NAME IS NOT SENT TO YOU (2026-11-12).
//
// A tester signed her note on her own agent's spec the way she signs
// everything, "Lena: let's add a light/dark switch", pressed the button, and
// the note card read "Sent to you", twice. Measured in her copy's store: the
// note was kept with her own id as the one person it names, so it read as
// addressed to her, was never offered to her agent, and said so. A note names
// the people it is for; its writer is not one of them.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { noteGoesTo } from '../shared/artifact-marks.mts';
import { noteSendWords, whereANoteGoes } from '../renderer/src/artifact-pins.ts';

const people = [{ id: 'u-lena', name: 'Lena Fischer' }, { id: 'u-theo', name: 'Theo Okafor' }];
const nameOf = (id) => people.find((p) => p.id === id)?.name.split(' ')[0] ?? 'A teammate';
const mine = { people, me: 'u-lena', agentMade: true, toAgent: true, owner: 'u-lena', threadOwner: 'u-lena', talking: [] };

describe('who a kept note is for', () => {
  it('is the agent, when the only person it names is its writer', () => {
    expect(noteGoesTo({ text: "Lena: let's add a light/dark switch", by: 'u-lena' }, people)).toEqual({ to: 'agent' });
    expect(noteGoesTo({ text: "Lena: let's add a switch", by: 'u-lena', mentions: ['u-lena'] }, people)).toEqual({ to: 'agent' });
  });
  it('is the teammate it names, signed or not', () => {
    expect(noteGoesTo({ text: 'Lena: can you check this, Theo?', by: 'u-lena', mentions: ['u-lena', 'u-theo'] }, people)).toEqual({ to: 'person', person: 'u-theo' });
    expect(noteGoesTo({ text: '@Theo is the token checked here?', by: 'u-lena' }, people)).toEqual({ to: 'person', person: 'u-theo' });
  });
  it('is still you, when a teammate wrote it to you', () => {
    expect(noteGoesTo({ text: 'Lena, keep the Pay button readable', by: 'u-theo' }, people)).toEqual({ to: 'person', person: 'u-lena' });
    expect(noteGoesTo({ text: 'Keep the Pay button readable', by: 'u-theo', mentions: ['u-lena'] }, people)).toEqual({ to: 'person', person: 'u-lena' });
  });
  it('reads a note with no writer as it always did', () => {
    expect(noteGoesTo({ text: 'Lena, keep the Pay button readable' }, people)).toEqual({ to: 'person', person: 'u-lena' });
  });
});

describe('the box, before it is sent', () => {
  it('on your own agent\'s file a signed note is a note for your agent', () => {
    expect(whereANoteGoes({ ...mine, text: "Lena: let's add a switch" })).toEqual({ to: 'agent', now: false });
    expect(noteSendWords({ ...mine, nameOf, text: "Lena: let's add a switch" })).toBe('Note for your agent');
  });
  it('on a teammate\'s file a signed note goes to the teammate', () => {
    const theirs = { ...mine, toAgent: false, owner: null, threadOwner: 'u-theo' };
    expect(whereANoteGoes({ ...theirs, text: 'Lena: the form calls DELETE too' })).toEqual({ to: 'person', person: 'u-theo' });
  });
});

describe('the review', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
  it('keeps the writer out of the people a new note names', () => {
    expect(view).toContain('const others = people.filter((p) => p.id !== me);');
    expect(view).toContain('const to = addressedTo(typed, others);');
    expect(view).not.toMatch(/const to = addressedTo\(typed, people\);/);
  });
  it('never says a note you wrote was sent to you', () => {
    const held = view.slice(view.indexOf('const heldFor ='), view.indexOf('const answeredBy ='));
    expect(held).toContain("goes.to === 'person' && goes.person !== n.by");
  });
});

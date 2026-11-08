// AN ANSWERED ASK CAN STILL BE GIVEN.
//
// What broke: a cloud thread asked for an ElevenLabs key, the person replied in
// words instead, then decided to add the key after all. The card read
// "Answered below." with nothing to press, and the reply box took the key only
// while the ask was the newest unanswered one. Measured by drawing the card in
// each state and reading what it offers.
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NEED, needsIn, lateReply } from '../shared/cloud-needs.mjs';

const { NeedCard, NeedPlace, NeedOlder } = await import('../renderer/src/components/NeedCard.tsx');
const needs = needsIn([
  `${NEED} key ELEVENLABS_API_KEY | ElevenLabs API key, from elevenlabs.io/app/settings/api-keys`,
  `${NEED} sign-in sentry | to read the errors`,
  `${NEED} file ~/Movies/launch.mov | to cut it`,
  `${NEED} code npm | to publish`,
].join('\n'));
const base = { itemId: 'w-1', saved: [], given: [], live: true, needs, saveKeys: async () => null, sendFile: async () => null, sendCode: async () => null, onComputer: () => {}, openLink: () => {} };
const draw = (n, o = {}, older = false) => renderToStaticMarkup(h(NeedPlace.Provider, { value: { ...base, ...o } },
  h(NeedOlder.Provider, { value: older }, h(NeedCard, { source: JSON.stringify(needs[n]), fallback: null }))));

describe('a key or sign-in answered in words', () => {
  it('offers to add it now', () => {
    expect(draw(0, { live: false })).toContain('>Add it now<');
    expect(draw(1, { live: false })).toContain('>Connect it now<');
  });
  it('offers it on an older copy too', () => {
    expect(draw(0, {}, true)).toContain('>Add it now<');
  });
  it('still opens no field until pressed', () => {
    expect(draw(0, { live: false })).not.toContain('<input');
  });
  it('offers nothing once the key is saved', () => {
    const html = draw(0, { live: false, saved: ['ELEVENLABS_API_KEY'] });
    expect(html).toContain('saved');
    expect(html).not.toContain('Add it now');
  });
  it('the open ask is unchanged: fields, no late offer', () => {
    const html = draw(0);
    expect(html).toContain('<input');
    expect(html).not.toContain('Add it now');
  });
});

describe('a file answered in words', () => {
  it('offers to send it now', () => {
    expect(draw(2, { live: false })).toContain('>Send it now<');
  });
});

describe('a one-time code answered in words', () => {
  it('offers nothing: the code has run out', () => {
    const html = draw(3, { live: false });
    expect(html).toContain('Answered below.');
    expect(html).not.toContain('it now');
  });
});

describe('what the thread is told when a key comes late', () => {
  it('says it was saved after all, and not to carry on with the old ask', () => {
    expect(lateReply([needs[0]])).toBe('I saved the ElevenLabs API key after all, so you can use it now.');
    expect(lateReply([needs[1]])).toBe('I connected Sentry after all, so you can use it now.');
    expect(lateReply([needs[0]])).not.toMatch(/Carry on/);
  });
});

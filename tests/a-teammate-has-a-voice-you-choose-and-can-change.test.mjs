// A TEAMMATE HAS A VOICE YOU CHOOSE AND CAN CHANGE.
//
// The owner: "They don't have different writing styles." A voice existed in the
// store, picked from the teammate's id, and nothing on screen showed it or let
// anyone change it. Two teammates were measured reading differently on the same
// prompt with real `claude -p` runs (quoted in the commit message). Now making one
// offers real styles with a sample line, its own words are allowed, a starter
// comes with one that suits it, and it stays editable.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { STARTERS, VOICES, voiceOf } from '../shared/teammates.mjs';
import { teamSetup } from '../mcp/core/teammates.mjs';

const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
const fn = (name) => page.slice(page.indexOf(`function ${name}(`), page.indexOf('\nfunction ', page.indexOf(`function ${name}(`) + 10));

describe('the styles on offer', () => {
  it('are the plain ones, each with a label, what it tells the agent, and a sample line', () => {
    expect(VOICES.map((v) => v.id)).toEqual(['blunt', 'warm', 'dry', 'careful', 'curious']);
    for (const v of VOICES) {
      expect(v.label).toBeTruthy();
      expect(v.says.length).toBeGreaterThan(20);
      expect(v.sample.length).toBeGreaterThan(10);
    }
  });

  it('show one situation said five ways, each its own and short enough for a chat', () => {
    expect(new Set(VOICES.map((v) => v.sample)).size).toBe(VOICES.length);
    for (const v of VOICES) {
      expect(v.sample).toMatch(/deploy/i);
      expect(v.sample.length).toBeLessThan(120);
      expect(v.sample).not.toMatch(/[—:]/);
    }
  });

  it('give every starter a real voice that suits it, and not all the same', () => {
    const ids = VOICES.map((v) => v.id);
    for (const s of STARTERS) expect(ids).toContain(s.voice);
    expect(new Set(STARTERS.map((s) => s.voice)).size).toBeGreaterThan(2);
  });
});

describe('a voice of its own words', () => {
  it('wins over the id, and shows no sample nobody wrote', () => {
    const v = voiceOf({ id: 't-abc123', voice: 'dry', voiceText: 'Like a ship captain. Short orders.' });
    expect(v).toMatchObject({ id: 'own', says: 'Like a ship captain. Short orders.' });
    expect(v.sample).toBeFalsy();
  });

  it('falls back when its words are empty', () => {
    expect(voiceOf({ id: 't-abc123', voice: 'dry', voiceText: '  ' }).id).toBe('dry');
    expect(voiceOf({ id: 't-abc123', voice: 'dry', voiceText: null }).id).toBe('dry');
  });
});

describe('on a real team', () => {
  let t; let mates;
  beforeEach(async () => { t = await aTeamWithAgents(); mates = t.maya.store.teammates; });
  afterEach(() => { delete process.env.ZERO_ITEM; return t.stop(); });

  it('a starter keeps the voice that suits it', () => {
    const made = mates.describe({ starter: 'quality', product: t.product.id });
    expect(made.teammate.voice).toBe('blunt');
  });

  it('what you pick when you make one wins over the starter\'s', () => {
    expect(mates.describe({ starter: 'quality', product: t.product.id, voice: 'warm' }).teammate.voice).toBe('warm');
  });

  it('your own words are kept when you make one', () => {
    const made = mates.describe({ text: 'Answer clinics', product: t.product.id, voiceText: 'Like a kind nurse.' });
    expect(voiceOf(made.teammate).says).toBe('Like a kind nurse.');
  });

  it('with nothing picked, a new one from words has no chosen voice, and is told to choose', () => {
    const made = mates.describe({ text: 'Answer clinics', product: t.product.id });
    expect(made.teammate.voice ?? null).toBeNull();
    const brief = mates.briefFor({ id: 'w-run', product: t.product.id, labels: ['founder', `teammate:${made.teammate.id}`, 'hop:0'] });
    expect(brief).toMatch(/Choose how you write/);
  });

  it('one you chose a voice for is not told to choose', () => {
    const made = mates.describe({ text: 'Answer clinics', product: t.product.id, voice: 'warm' });
    const brief = mates.briefFor({ id: 'w-run', product: t.product.id, labels: ['founder', `teammate:${made.teammate.id}`, 'hop:0'] });
    expect(brief).not.toMatch(/Choose how you write/);
  });

  it('can be changed afterwards, and a style clears your words', () => {
    const t1 = mates.create({ name: 'Support lead', job: 'Clinics.' });
    expect(voiceOf(mates.update(t1.id, { voiceText: 'Like a kind nurse.' })).says).toBe('Like a kind nurse.');
    const after = mates.update(t1.id, { voice: 'dry', voiceText: null });
    expect(voiceOf(after).id).toBe('dry');
  });

  it('refuses a style nobody defined, and keeps what it had', () => {
    const t1 = mates.create({ name: 'Support lead', job: 'Clinics.', voice: 'warm' });
    expect(voiceOf(mates.update(t1.id, { voice: 'pirate' })).id).toBe('warm');
  });

  it('a draft can set its own voice with team_setup, in a style or its own words', () => {
    const made = mates.describe({ text: 'Answer clinics', product: t.product.id });
    const run = t.maya.store.composeItem(t.product.id, { title: 'Set up', body: 'x', labels: [`teammate:${made.teammate.id}`] });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = t.product.id;
    teamSetup({ voice: 'careful' });
    expect(voiceOf(mates.get(made.teammate.id)).id).toBe('careful');
    teamSetup({ voiceWords: 'Like a kind nurse.' });
    expect(voiceOf(mates.get(made.teammate.id)).says).toBe('Like a kind nurse.');
    expect(() => teamSetup({ voice: 'pirate' })).toThrow(/blunt/);
  });
});

describe('on screen', () => {
  it('making one offers the styles with the sample line of the one picked', () => {
    expect(fn('NewTeammate')).toMatch(/<VoicePick /);
    expect(fn('NewTeammate')).toMatch(/call\('describe', \{ \.\.\.args, \.\.\.voice/);
    expect(fn('VoicePick')).toMatch(/VOICES\.map/);
    expect(fn('VoicePick')).toMatch(/\.sample/);
    expect(fn('VoicePick')).toMatch(/Your own/);
  });

  it('its About sheet shows the voice it has and changes it', () => {
    expect(fn('Details')).toMatch(/<dt>How it writes<\/dt>[\s\S]*<VoicePick [^\n]*voiceOf\(t\)|<VoicePick [^\n]*t\.voice/);
    expect(fn('Details')).toMatch(/keep\(/);
  });
});

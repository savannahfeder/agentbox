// A CLOUD RUN ASKS FOR WHAT ONLY THE PERSON CAN GIVE: A SIGN-IN, A KEY, A FILE OR A CODE.
//
// What broke (2026-11-03): cloud threads stalled on things the cloud machine
// could not get by itself. Only keys could be asked for, on a bare paste box
// that read as untrustworthy: "this problem is not only about tokens. There are
// all sorts of things the cloud regularly needs and needs to get from the user."
// A run now ends on one marked line per need, of four kinds, and the thread
// draws each as a card. Measured on the lines a run writes and on which waiting
// threads a saved sign-in frees.
import { describe, it, expect } from 'vitest';
import { needsIn, isNeedLine, keysOf, needsWord, connectedReply, threadsKeysFree, serviceById, SERVICES, NEED } from '../shared/cloud-needs.mts';
import { KEY_ASK } from '../shared/cloud-keys.mts';
import { handsBack } from '../shared/cloud-hand-back.mts';
import { keyNameRefused } from '../shared/cloud-key-names.mts';

const SIGN_IN = `${NEED} sign-in supabase | to apply the new storage rules to the Northwind database`;
const FILE = `${NEED} file ~/Movies/launch-film-original.mov | the cut is made from the original`;
const CODE = `${NEED} code npm | the one-time password for npm publish`;
const KEY = `${NEED} key SENTRY_AUTH_TOKEN | a Sentry auth token, from sentry.io/settings/account/api/auth-tokens`;

describe('the lines a run asks on', () => {
  it('reads each kind, with what it is for', () => {
    expect(needsIn(`**I need a few things.**\n\n${SIGN_IN}\n${FILE}\n${CODE}\n${KEY}\n\n## Options\n1. Do it from my computer`)).toEqual([
      { kind: 'sign-in', service: serviceById('supabase'), why: 'to apply the new storage rules to the Northwind database' },
      { kind: 'file', path: '~/Movies/launch-film-original.mov', why: 'the cut is made from the original' },
      { kind: 'code', about: 'npm', why: 'the one-time password for npm publish' },
      { kind: 'key', name: 'SENTRY_AUTH_TOKEN', what: 'a Sentry auth token, from sentry.io/settings/account/api/auth-tokens' },
    ]);
  });

  it.each([
    ['in backticks', `\`${SIGN_IN}\``],
    ['with a capital service', `${NEED} sign-in Supabase | to apply the rules`],
    ['indented', `   ${SIGN_IN}`],
  ])('reads a sign-in %s', (_, line) => {
    expect(needsIn(line)[0]).toMatchObject({ kind: 'sign-in', service: { id: 'supabase' } });
  });

  it('reads a line with nothing after the bar, and each need once', () => {
    expect(needsIn(`${NEED} sign-in vercel\n${NEED} sign-in vercel | again`)).toEqual([{ kind: 'sign-in', service: serviceById('vercel'), why: '' }]);
  });

  it('still reads the older key line', () => {
    expect(needsIn(`${KEY_ASK} VERCEL_TOKEN a Vercel token`)).toEqual([{ kind: 'key', name: 'VERCEL_TOKEN', what: 'a Vercel token' }]);
  });

  it.each([
    ['a service not on the list', `${NEED} sign-in myspace | to post`],
    ['a key in small letters', `${NEED} key sentry_token | a token`],
    ['a file that is not a full path', `${NEED} file launch.mov | the film`],
    ['a kind there is no card for', `${NEED} phone | call me`],
    ['the line inside a sentence', `I will end with ${SIGN_IN}`],
    ['the hand-back line', 'AGENTBOX-NEEDS-THE-COMPUTER: Xcode'],
  ])('takes nothing from %s', (_, line) => {
    expect(needsIn(line)).toEqual([]);
    expect(isNeedLine(line)).toBe(false);
  });

  it('never moves the thread to the computer', () => {
    for (const line of [SIGN_IN, FILE, CODE, KEY]) expect(handsBack(line)).toBe(false);
  });
});

describe('the services', () => {
  it('name only variables a key may be saved under', () => {
    for (const s of SERVICES) for (const k of s.keys) expect(keyNameRefused(k.name), `${s.id} ${k.name}`).toBeNull();
  });
  it('each have a page to make a token on', () => {
    for (const s of SERVICES) expect(s.tokenUrl).toMatch(/^https:\/\//);
  });
});

describe('what a need saves, and what the row says', () => {
  it('saves every variable of a sign-in, the one of a key, and nothing for a file or a code', () => {
    const [signIn, file, code, key] = needsIn(`${NEED} sign-in aws\n${FILE}\n${CODE}\n${KEY}`);
    expect(keysOf(signIn)).toEqual(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']);
    expect(keysOf(file)).toEqual([]);
    expect(keysOf(code)).toEqual([]);
    expect(keysOf(key)).toEqual(['SENTRY_AUTH_TOKEN']);
  });
  it.each([[SIGN_IN, 'Needs Supabase'], [FILE, 'Needs a file'], [CODE, 'Needs a code'], [KEY, 'Needs a key'], ['Done.', null]])('says %s as %s', (line, word) => {
    expect(needsWord(needsIn(line))).toBe(word);
  });
  // Round ten: "Needs Vercel" for a thread waiting on three things.
  it('says how many when there are several', () => {
    expect(needsWord(needsIn(`${SIGN_IN}\n${FILE}\n${CODE}`))).toBe('Needs 3 things');
  });
});

describe('a saved sign-in', () => {
  const row = (id, result, { status = 'open', askedAt = 10, answeredAt = null } = {}) => ({
    id, product: 'web', status, result, wrote: { result: { ts: askedAt }, ...(answeredAt ? { answer: { ts: answeredAt } } : {}) },
  });

  it('frees every open thread waiting on it, with a reply in words', () => {
    expect(threadsKeysFree([row('w-1', SIGN_IN), row('w-2', `**Hm.**\n\n${SIGN_IN}`), row('w-3', 'Done.')], ['SUPABASE_ACCESS_TOKEN'])).toEqual([
      { product: 'web', id: 'w-1', answer: 'I connected Supabase. Carry on.' },
      { product: 'web', id: 'w-2', answer: 'I connected Supabase. Carry on.' },
    ]);
  });

  it('waits for every variable of a sign-in, and for every need of the thread', () => {
    const aws = `${NEED} sign-in aws | to upload`;
    expect(threadsKeysFree([row('w-1', aws)], ['AWS_ACCESS_KEY_ID'])).toEqual([]);
    expect(threadsKeysFree([row('w-1', `${aws}\n${KEY}`)], ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])).toEqual([]);
    expect(threadsKeysFree([row('w-1', `${aws}\n${KEY}`)], ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'SENTRY_AUTH_TOKEN'])[0].answer)
      .toBe('I connected AWS and saved the Sentry auth token. Carry on.');
  });

  it('frees no thread that also waits on a file or a code, which only a reply gives', () => {
    expect(threadsKeysFree([row('w-1', `${SIGN_IN}\n${FILE}`), row('w-2', `${SIGN_IN}\n${CODE}`)], ['SUPABASE_ACCESS_TOKEN'])).toEqual([]);
  });

  it('frees no thread that is closed, running or answered since it asked', () => {
    expect(threadsKeysFree([row('w-1', SIGN_IN, { status: 'done' }), row('w-2', SIGN_IN, { status: 'claimed' }), row('w-3', SIGN_IN, { answeredAt: 20 })], ['SUPABASE_ACCESS_TOKEN'])).toEqual([]);
  });

  it('says what was connected and saved', () => {
    expect(connectedReply(needsIn(`${NEED} sign-in vercel\n${NEED} sign-in github`))).toBe('I connected Vercel and GitHub. Carry on.');
  });
});

describe('the thread', async () => {
  const { needsAsBlocks, NEED_BLOCK } = await import('../renderer/src/key-asks.ts');

  it('draws each need line as a card block carrying the need, and leaves the rest as written', () => {
    const out = needsAsBlocks(`**I need two things.**\n\n${SIGN_IN}\n${FILE}\n\nAfter.`);
    const blocks = [...out.matchAll(new RegExp('```' + NEED_BLOCK + '\\n(.*)\\n```', 'g'))].map((m) => JSON.parse(m[1]));
    expect(blocks.map((b) => b.kind)).toEqual(['sign-in', 'file']);
    expect(out.startsWith('**I need two things.**')).toBe(true);
    expect(out.trimEnd().endsWith('After.')).toBe(true);
    expect(needsAsBlocks('Nothing asked.')).toBe('Nothing asked.');
  });
});

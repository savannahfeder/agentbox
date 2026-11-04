// A CLOUD RUN MISSING A KEY ASKS FOR IT ON THE THREAD.
//
// What broke (2026-11-03): a cloud thread that needed the Supabase sign-in
// offered "Set up the storage rules from my computer, then ship" and stalled,
// never asking for the key itself. A run told it can ask now ends on one
// marked line per key, and the thread draws each as a field to paste into.
// Measured on the lines a run writes: each is read once, wherever the agent
// put it, and nothing else is taken for one.
import { describe, it, expect } from 'vitest';
import { keyAsks, isKeyAsk, KEY_ASK, savedReply as sharedSavedReply } from '../shared/cloud-keys.mjs';
import { threadsKeysFree } from '../shared/cloud-needs.mjs';
import { handsBack } from '../shared/cloud-hand-back.mjs';
import { keyAsksAsBlocks, keyBlock, savedReply, keyFromReply, keySavedWords, isNewestAnswer, keyLooksWrong, KEY_BLOCK } from '../renderer/src/key-asks.ts';
import { plainText, searchText } from '../renderer/src/format.ts';

const ASK = `${KEY_ASK} SUPABASE_ACCESS_TOKEN your Supabase access token, from supabase.com/dashboard/account/tokens`;

describe('the line a run asks on', () => {
  it('is read with its name and what it is', () => {
    expect(keyAsks(`**Paste your token.**\n\nMore words.\n\n${ASK}\n\n## Options\n1. Do it from my computer`)).toEqual([
      { name: 'SUPABASE_ACCESS_TOKEN', what: 'your Supabase access token, from supabase.com/dashboard/account/tokens' },
    ]);
  });

  it.each([
    ['in backticks', `\`${KEY_ASK} VERCEL_TOKEN a Vercel token\``],
    ['after a dash', `${KEY_ASK} VERCEL_TOKEN — a Vercel token`],
    ['after a colon', `${KEY_ASK} VERCEL_TOKEN: a Vercel token`],
    ['indented', `   ${KEY_ASK} VERCEL_TOKEN a Vercel token`],
  ])('is read %s', (_, line) => {
    expect(keyAsks(line)).toEqual([{ name: 'VERCEL_TOKEN', what: 'a Vercel token' }]);
  });

  it('is read once per key, in order, and with nothing said about it', () => {
    const text = [`${KEY_ASK} AWS_ACCESS_KEY_ID`, `${KEY_ASK} AWS_SECRET_ACCESS_KEY the secret`, `${KEY_ASK} AWS_ACCESS_KEY_ID again`].join('\n');
    expect(keyAsks(text)).toEqual([{ name: 'AWS_ACCESS_KEY_ID', what: '' }, { name: 'AWS_SECRET_ACCESS_KEY', what: 'the secret' }]);
  });

  it.each([
    ['in the middle of a sentence', `I will end with ${KEY_ASK} VERCEL_TOKEN if needed`],
    ['with a name in small letters', `${KEY_ASK} vercel_token`],
    ['with no name', `${KEY_ASK}`],
    ['as the hand-back line', 'AGENTBOX-NEEDS-THE-COMPUTER: your AWS sign-in'],
  ])('is not taken from a line %s', (_, line) => {
    expect(keyAsks(line)).toEqual([]);
    expect(isKeyAsk(line)).toBe(false);
  });

  it('never moves the thread to the computer', () => {
    expect(handsBack(ASK)).toBe(false);
  });
});

// Round one of the power test: two threads asked for the same Supabase key;
// saving it on the first carried that one on, and the second sat on its ask
// saying Saved with nothing to press.
describe('saving a key', () => {
  const row = (id, result, { status = 'open', askedAt = 10, answeredAt = null } = {}) => ({
    id, product: 'web', status, result,
    wrote: { result: { ts: askedAt }, ...(answeredAt ? { answer: { ts: answeredAt } } : {}) },
  });
  const supa = `**Paste it.**\n\n${ASK}`;
  const aws = `${KEY_ASK} AWS_ACCESS_KEY_ID the id\n${KEY_ASK} AWS_SECRET_ACCESS_KEY the secret`;

  it('carries on every open thread waiting on it, each with the reply that names its keys', () => {
    expect(threadsKeysFree([row('w-1', supa), row('w-2', supa), row('w-3', 'Done.')], ['SUPABASE_ACCESS_TOKEN'])).toEqual([
      { product: 'web', id: 'w-1', answer: 'I saved the Supabase access token. Carry on.' },
      { product: 'web', id: 'w-2', answer: 'I saved the Supabase access token. Carry on.' },
    ]);
  });

  it('waits until every key a thread asked for is saved', () => {
    expect(threadsKeysFree([row('w-1', aws)], ['AWS_ACCESS_KEY_ID'])).toEqual([]);
    expect(threadsKeysFree([row('w-1', aws)], ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])[0].answer).toBe('I saved the id and the secret. Carry on.');
    expect(threadsKeysFree([row('w-1', `${KEY_ASK} AWS_ACCESS_KEY_ID\n${KEY_ASK} AWS_SECRET_ACCESS_KEY`)], ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])[0].answer).toBe('I saved AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY. Carry on.');
  });

  it('leaves a thread that is closed, running, or already answered since it asked', () => {
    const saved = ['SUPABASE_ACCESS_TOKEN'];
    expect(threadsKeysFree([row('w-1', supa, { status: 'done' }), row('w-2', supa, { status: 'claimed' }), row('w-3', supa, { answeredAt: 20 })], saved)).toEqual([]);
    expect(threadsKeysFree([row('w-4', supa, { answeredAt: 5 })], saved)).toHaveLength(1);
  });

  it('says the same words the thread does', () => {
    expect(sharedSavedReply(['A_KEY', 'B_KEY', 'C_KEY'])).toBe(savedReply(['A_KEY', 'B_KEY', 'C_KEY']));
    expect(savedReply(['A_KEY', 'B_KEY', 'C_KEY'])).toBe('I saved A_KEY, B_KEY and C_KEY. Carry on.');
  });
});

describe('the thread', () => {
  it('draws each ask as a block it turns into a field, and leaves the rest as written', () => {
    const text = `**Paste it.**\n\n${ASK}\n\nAfter.`;
    const out = keyAsksAsBlocks(text);
    expect(out).toContain(`\`\`\`${KEY_BLOCK}\nSUPABASE_ACCESS_TOKEN\nyour Supabase access token, from supabase.com/dashboard/account/tokens\n\`\`\``);
    expect(out.startsWith('**Paste it.**\n\n')).toBe(true);
    expect(out.trimEnd().endsWith('After.')).toBe(true);
    expect(keyAsksAsBlocks('No asks here.')).toBe('No asks here.');
  });

  it('reads the block back as the name and what it is', () => {
    expect(keyBlock('SUPABASE_ACCESS_TOKEN\nyour token\n')).toEqual({ name: 'SUPABASE_ACCESS_TOKEN', what: 'your token' });
    expect(keyBlock('EXPO_TOKEN\n')).toEqual({ name: 'EXPO_TOKEN', what: '' });
  });

  it('says what was saved when it carries on', () => {
    expect(savedReply(['SUPABASE_ACCESS_TOKEN'])).toBe('I saved SUPABASE_ACCESS_TOKEN. Carry on.');
    expect(savedReply(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])).toBe('I saved AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY. Carry on.');
    expect(savedReply(['A_KEY', 'B_KEY', 'C_KEY'])).toBe('I saved A_KEY, B_KEY and C_KEY. Carry on.');
  });
});

// Round one: a tester pasted the token into the reply box, where it sat in
// plain text in the thread and in search, and the agent asked again.
describe('a key pasted into the reply box', () => {
  const asks = ['SUPABASE_ACCESS_TOKEN'];
  it.each([
    ['sbp_0123456789abcdef0123', 'sbp_0123456789abcdef0123'],
    ['  ghp_abcdefghijklmnop123  ', 'ghp_abcdefghijklmnop123'],
    ['sk_live-abc-123-def-456', 'sk_live-abc-123-def-456'],
    // Round two: "here you go sk_live_..." went out as a chat message.
    ['here you go sk_live_51Habcdef0123456789', 'sk_live_51Habcdef0123456789'],
    ['`sbp_0123456789abcdef0123`', 'sbp_0123456789abcdef0123'],
    ['token: sbp_0123456789abcdef0123.', 'sbp_0123456789abcdef0123'],
  ])('is saved as the one key the thread asked for: %s', (text, value) => {
    expect(keyFromReply(text, asks, [])).toEqual({ name: 'SUPABASE_ACCESS_TOKEN', value, words: false });
  });
  it.each([
    ['words', 'please use the token I saved'],
    ['a link', 'https://supabase.com/dashboard/account/tokens'],
    ['too short', 'abc_123'],
    ['letters only', 'abcdefghijklmnopqrstuvwxyz'],
    ['two keys', 'sbp_0123456789abcdef0123 sbp_9876543210fedcba9876'],
    ['a file path in words', 'use src/lib/rate-limit.ts please'],
  ])('is sent as a reply when it is %s', (_, text) => {
    expect(keyFromReply(text, asks, [])).toBeNull();
  });
  // Round six: in a long sentence, a key marked as the asked one is kept and the rest is sent without it.
  it('is kept out of a sentence when it is marked as the asked key, and the words still go', () => {
    expect(keyFromReply('no key on me right now, skip the deploy step and just write the github action yaml for sbp_0123456789abcdef0123', asks, []))
      .toEqual({ name: 'SUPABASE_ACCESS_TOKEN', value: 'sbp_0123456789abcdef0123', words: true });
  });
  it('is sent as a reply when the key is saved already, or two are asked for and it cannot tell which', () => {
    expect(keyFromReply('sbp_0123456789abcdef0123', asks, ['SUPABASE_ACCESS_TOKEN'])).toBeNull();
    expect(keyFromReply('AKIAIOSFODNN7EXAMPLE', ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], [])).toBeNull(); // public-check: allow (AWS's own documented example ID)
    expect(keyFromReply('sbp_0123456789abcdef0123', [], [])).toBeNull();
  });
});

// Round one: saving said only "Sent -> Backend", not that the key was kept.
describe('what saving says', () => {
  const said = (name, o) => keySavedWords(name, { thread: 'w-1', ...o });
  it('names the key in plain words when the agent gave some', () => {
    expect(said('Supabase access token', { asks: ['SUPABASE_ACCESS_TOKEN'], saved: ['SUPABASE_ACCESS_TOKEN'], freed: ['w-1'] })).toBe('Supabase access token saved. This thread carries on.');
    expect(said('Supabase access token', { asks: [], saved: [], freed: [], cloudOff: true })).toBe('Supabase access token saved. Threads use it once the cloud is on.');
  });
  it('says the key was saved and who carries on', () => {
    expect(said('SUPABASE_ACCESS_TOKEN', { asks: ['SUPABASE_ACCESS_TOKEN'], saved: ['SUPABASE_ACCESS_TOKEN'], freed: ['w-1'] })).toBe('SUPABASE_ACCESS_TOKEN saved. This thread carries on.');
    expect(said('SUPABASE_ACCESS_TOKEN', { asks: ['SUPABASE_ACCESS_TOKEN'], saved: ['SUPABASE_ACCESS_TOKEN'], freed: ['w-1', 'w-2'] })).toBe('SUPABASE_ACCESS_TOKEN saved. This thread and 1 other carry on.');
    expect(said('SUPABASE_ACCESS_TOKEN', { asks: ['SUPABASE_ACCESS_TOKEN'], saved: ['SUPABASE_ACCESS_TOKEN'], freed: ['w-2', 'w-3'] })).toBe('SUPABASE_ACCESS_TOKEN saved. 2 waiting threads carry on.');
    expect(said('SUPABASE_ACCESS_TOKEN', { asks: ['SUPABASE_ACCESS_TOKEN'], saved: ['SUPABASE_ACCESS_TOKEN'], freed: [] })).toBe('SUPABASE_ACCESS_TOKEN saved.');
  });
  it('says how many are left when the thread asked for more than one', () => {
    expect(said('AWS_ACCESS_KEY_ID', { asks: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], saved: ['AWS_ACCESS_KEY_ID'], freed: [] })).toBe('AWS_ACCESS_KEY_ID saved. One more key to go.');
  });
});

// Round two: an older ask drew a second live box. Round three: the newest one,
// drawn with its Options taken off, no longer matched and drew no box at all.
describe('which ask takes a key', () => {
  const result = `**Paste it.**\n\n${ASK}\n\n## Options\n1. Do it from my computer`;
  it('is the newest answer, drawn with or without its Options', () => {
    expect(isNewestAnswer(result, result)).toBe(true);
    expect(isNewestAnswer(`**Paste it.**\n\n${ASK}`, result)).toBe(true);
    expect(isNewestAnswer(`## Gist\n\n**Paste it.**\n\n${ASK}\n`, `## Gist\n\n**Paste it.**\n\n${ASK}\n\n## Options\n1. Do it from my computer`)).toBe(true);
    // Round four: drawn from the run's log, which drops the blank lines.
    expect(isNewestAnswer(`**Paste it.**\n${ASK}\n## Options\n1. Do it from my computer`, result)).toBe(true);
    // Round five: drawn with its bold first line apart from the rest.
    expect(isNewestAnswer(`${ASK}\n`, result)).toBe(true);
  });
  it('is not an older answer, nor any answer on a thread with none', () => {
    expect(isNewestAnswer(`**Paste it.**\n\n${ASK}`, 'Used your saved key. Done.')).toBe(false);
    expect(isNewestAnswer(result, null)).toBe(false);
  });
});

// Rounds two and three: a Stripe publishable key was kept as the secret key,
// and a Stripe key as the Sentry token, for every later thread.
describe('a key pasted under the wrong name', () => {
  it.each([
    ['SENTRY_AUTH_TOKEN', 'sk_live_51Habcdef0123456789', 'a Stripe secret key'],
    ['STRIPE_SECRET_KEY', 'pk_live_51Habcdef0123456789', 'a Stripe publishable key'],
    ['VERCEL_TOKEN', 'sbp_0123456789abcdef0123', 'a Supabase access token'],
    ['AWS_SECRET_ACCESS_KEY', 'AKIAIOSFODNN7EXAMPLE', 'an AWS access key ID'], // public-check: allow (AWS's own documented example ID)
    ['STRIPE_SECRET_KEY', 'sk-ant-api03-abcdef', 'an Anthropic key'],
    // Round four: a project's anon or service role key, as the account token.
    ['SUPABASE_ACCESS_TOKEN', 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig', 'a Supabase project key (anon or service role)'],
  ])('is warned about under %s: %s', (name, value, what) => {
    expect(keyLooksWrong(name, value)).toBe(`That looks like ${what}, not ${name}. Press Save again to keep it anyway.`);
  });
  it('names the key the way the agent did, when it said', () => {
    expect(keyLooksWrong('STRIPE_SECRET_KEY', 'pk_live_51Habcdef0123456789', 'your Stripe secret key, from dashboard.stripe.com/apikeys'))
      .toBe('That looks like a Stripe publishable key, not the Stripe secret key. Press Save again to keep it anyway.');
  });
  it('lets a JSON web token through under any other name', () => {
    expect(keyLooksWrong('SOME_SERVICE_TOKEN', 'eyJhbGciOiJIUzI1NiJ9.eyJ4IjoxfQ.sig')).toBeNull();
  });
  it.each([
    ['STRIPE_SECRET_KEY', 'sk_test_51Habcdef0123456789'],
    ['STRIPE_PUBLISHABLE_KEY', 'pk_test_51Habcdef0123456789'],
    ['SUPABASE_ACCESS_TOKEN', 'sbp_0123456789abcdef0123'],
    ['AWS_ACCESS_KEY_ID', 'AKIAIOSFODNN7EXAMPLE'], // public-check: allow (AWS's own documented example ID)
    ['VERCEL_TOKEN', 'q1w2e3r4t5y6u7i8o9p0'],
  ])('is not warned about when it fits, or has no known shape: %s', (name, value) => {
    expect(keyLooksWrong(name, value)).toBeNull();
  });
});

// Round three: search showed "Used your saved STRIPESECRETKEY" and the raw ask tag.
describe('what search and the list read', () => {
  it('keeps the underscores inside a key name and still drops emphasis', () => {
    expect(plainText('Used your saved STRIPE_SECRET_KEY for _this_ one')).toBe('Used your saved STRIPE_SECRET_KEY for this one');
    expect(searchText('__bold__ and snake_case_word')).toBe('bold and snake_case_word');
  });
  it('reads a key ask as what it asks for', () => {
    expect(plainText(`**Paste it.**\n\n${ASK}`)).toBe('Paste it. your Supabase access token, from supabase.com/dashboard/account/tokens');
    expect(searchText(`${KEY_ASK} EXPO_TOKEN`)).toBe('EXPO_TOKEN');
  });
});

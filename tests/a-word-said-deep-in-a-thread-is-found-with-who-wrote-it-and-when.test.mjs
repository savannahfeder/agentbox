// SEARCH FOUND THREADS ONLY.
//
// The finding, 2026-10-30: "Search finds threads only, no documents, no
// matching line. Dev's status post sits in a group chat that search doesn't
// find." The thread search read a thread's title and its latest words, so a
// line said earlier in a thread, or in a conversation with a person, could not
// be found at all. This measures the new finder on the lines inside threads:
// the matching line, who wrote it and when, and the id the thread opens at.
import { describe, it, expect } from 'vitest';
import { createFinder, messagesOf } from '../main/everything-found.mjs';

const say = (uid, ts, by, patch, source = 'founder') => ({ id: 'w-1', uid, ts, by, source, patch });

function finderOver(threads) {
  return createFinder({
    listThreads: () => threads.map((t) => ({ key: t.key, kind: t.kind ?? 'thread', product: 'p', id: t.key, version: t.version ?? 1, updatedAt: 1 })),
    loadThread: async (t) => ({ lines: threads.find((x) => x.key === t.key).lines }),
  });
}

describe('a line deep inside a thread', () => {
  const lines = [
    say('u1', 1000, 'p-maya', { body: 'Plan the launch week for the clinics.' }),
    say('u2', 2000, null, { result: 'Drafted the plan. The booking API ships Thursday.' }, 'agent'),
    say('u3', 3000, 'p-dev', { answer: 'Status: Render account is live and the deploy finished at noon.' }),
    ...Array.from({ length: 200 }, (_, i) => say(`f${i}`, 4000 + i, 'p-maya', { answer: `filler message number ${i}` })),
  ];

  it('is found, with the line, who wrote it, when, and the id to open at', async () => {
    const got = await finderOver([{ key: 't1', lines }]).search('render account');
    expect(got.lines).toHaveLength(1);
    expect(got.lines[0]).toMatchObject({ kind: 'thread', id: 't1', uid: 'u3', by: 'p-dev', at: 3000, source: 'founder' });
    expect(got.lines[0].text).toContain('Render account is live');
  });

  it('says the agent wrote it when the agent did', async () => {
    const got = await finderOver([{ key: 't1', lines }]).search('booking api');
    expect(got.lines[0]).toMatchObject({ uid: 'u2', source: 'agent', by: null });
  });

  it('needs every word, each at the start of a word', async () => {
    const find = finderOver([{ key: 't1', lines }]);
    expect((await find.search('render deploy')).lines).toHaveLength(1);
    expect((await find.search('render invoice')).lines).toHaveLength(0);
    // "deploy" is inside "redeployed", not the start of a word.
    const inside = finderOver([{ key: 't2', lines: [say('x', 1, 'p-dev', { answer: 'We redeployed it.' })] }]);
    expect((await inside.search('deploy')).lines).toHaveLength(0);
    expect((await inside.search('redeploy')).lines).toHaveLength(1);
  });

  it('is found in a conversation with a person, and says so', async () => {
    const chat = [say('c1', 500, 'p-sofia', { answer: 'The amber empty state is ready for review.' })];
    const got = await finderOver([{ key: 'chat1', kind: 'chat', lines: chat }]).search('amber');
    expect(got.lines[0]).toMatchObject({ kind: 'chat', uid: 'c1', by: 'p-sofia' });
  });

  it('is found in a comment a teammate left on the thread', async () => {
    const lines2 = [say('k1', 700, 'p-dev', { comment: { text: 'Please check the invoice totals.' } }, 'system')];
    const got = await finderOver([{ key: 't3', lines: lines2 }]).search('invoice totals');
    expect(got.lines[0]).toMatchObject({ uid: 'k1', by: 'p-dev', comment: true });
  });

  it('shows the newest first and no more than were asked for', async () => {
    const many = Array.from({ length: 30 }, (_, i) => say(`m${i}`, 10 + i, 'p-dev', { answer: `deploy note ${i}` }));
    const got = await finderOver([{ key: 't4', lines: many }]).search('deploy', { lines: 4 });
    expect(got.lines.map((l) => l.uid)).toEqual(['m29', 'm28', 'm27', 'm26']);
    expect(got.total.lines).toBe(30);
  });

  it('cuts a long message around the match', async () => {
    const long = say('L', 1, 'p-dev', { answer: `${'word '.repeat(80)}needle here ${'tail '.repeat(80)}` });
    const got = await finderOver([{ key: 't5', lines: [long] }]).search('needle');
    expect(got.lines[0].text.length).toBeLessThan(200);
    expect(got.lines[0].text).toContain('needle here');
  });

  it('does not find a message its author deleted, and finds the edited words', () => {
    const lines3 = [
      say('e1', 1, 'p-dev', { answer: 'old secret words' }),
      say('e2', 2, 'p-dev', { answer: 'to be deleted' }),
      { id: 'w-1', uid: 'x1', ts: 3, by: 'p-dev', source: 'founder', patch: { edit: { on: 'e1', text: 'new public words' } } },
      { id: 'w-1', uid: 'x2', ts: 4, by: 'p-dev', source: 'founder', patch: { edit: { on: 'e2', gone: true } } },
    ];
    const texts = messagesOf(lines3).map((m) => m.text);
    expect(texts).toEqual(['new public words']);
  });

  it('reads a link as its label, so an address is neither matched nor shown', async () => {
    const link = [say('k', 1, 'p-dev', { answer: 'Posted [the status post](attachments/d12d2c5a1d13-status-post.md) today.' })];
    const find = finderOver([{ key: 'tl', lines: link }]);
    const got = await find.search('status post');
    expect(got.lines[0].text).toBe('Posted the status post today.');
    expect((await find.search('attachments')).lines).toHaveLength(0);
  });

  it('leaves out a heartbeat, a claim and a rewrite of the row description', () => {
    const lines4 = [
      say('a', 1, 'p-dev', { body: 'the ask' }),
      { id: 'w-1', ts: 2, heartbeat: true, patch: { note: 'tick' } },
      { id: 'w-1', ts: 3, claim: { holder: 'x' }, patch: { note: 'claimed' } },
      say('b', 4, null, { body: 'rewritten description by a worker' }, 'agent'),
    ];
    expect(messagesOf(lines4).map((m) => m.text)).toEqual(['the ask']);
  });
});

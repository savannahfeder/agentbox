// A REPLY TYPED WHILE A SIGN-IN CARD WAITED NEVER REACHED THE AGENT.
//
// Reported 2026-11-09 with pictures (w-3ca0d19aba): a thread showed "Sign in
// to Expo" and "Asking 9m", and the reply under it said "Waiting for its
// current step" the whole time. Several threads with sign-in cards sat in
// Needs you after a reply. Pressing "Not now" on the card freed every one.
//
// Why: the agent's step was the sign_in tool, which waits on the card and is
// called again every 50 seconds, so the turn never ended and the reply queued
// behind it was never taken. "Not now" ended the wait. Measured here by
// driving submitReply into a running session with a card open, and the
// sign_in wait against a real store: the reply now answers the card, and the
// wait comes back at once telling the agent its message is next.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cleanSignInAnswer, openSignIn } from '../shared/sign-in-ask.mts';
import { submitReply } from '../main/live-replies.mts';
import { Supervisor } from '../main/supervisor.mts';

const LINK = 'https://expo.dev/login/device';

describe('a reply sent into a running agent', () => {
  const setup = (session: Record<string, unknown> = {}) => {
    const order: string[] = [];
    const ended: string[] = [];
    const s = { product: 'p', child: { steer: async (text: string) => { order.push('steer'); return text; } }, ...session };
    const supervisor = {
      sessions: new Map([['w', s]]),
      _handledAnswers: new Set<string>(), _answerKey: (i: { answer?: string }) => String(i.answer), _saveState() {},
      redeliverAnswer() {}, deliverMidflightReply() {},
      nextReplyBrief: (_p: string, _i: string, a: string) => a,
      endSignInWait: (product: string, id: string) => { order.push('end'); ended.push(`${product}/${id}`); },
    };
    return { supervisor, order, ended };
  };
  const send = (supervisor: Parameters<typeof submitReply>[0], extra = {}) =>
    submitReply(supervisor, { product: 'p', id: 'w', answer: 'I signed in, carry on', ...extra }, () => ({ answer: 'I signed in, carry on' }));

  it('ends the sign-in wait before the reply is put in line', async () => {
    const { supervisor, order, ended } = setup();
    await send(supervisor);
    expect(ended).toEqual(['p/w']);
    expect(order).toEqual(['end', 'steer']);
  });

  it('leaves the card alone when no run is there to take the reply', async () => {
    const { supervisor, ended } = setup();
    supervisor.sessions.clear();
    await send(supervisor);
    expect(ended).toEqual([]);
  });

  it('leaves the card alone for a reply set for later', async () => {
    const { supervisor, ended } = setup();
    await send(supervisor, { later: true });
    expect(ended).toEqual([]);
  });

  it('leaves the card alone between turns, when nothing is waiting on it', async () => {
    const { supervisor, ended } = setup({ between: true });
    await send(supervisor);
    expect(ended).toEqual([]);
  });

  it('leaves the card alone for a teammate, whose word is not the card\'s answer', async () => {
    const { supervisor, ended } = setup();
    await send(supervisor, { from: 'A teammate' });
    expect(ended).toEqual([]);
  });
});

describe('the app answering the card for the reply', () => {
  const store = (item: Record<string, unknown> | null) => {
    const answered: unknown[] = [];
    return {
      answered,
      readItem: () => item,
      answerSignIn: (slug: string, id: string, a: unknown, o: unknown) => { answered.push([slug, id, a, o]); },
    };
  };

  it('answers the open card as replied', () => {
    const s = store({ id: 'w', status: 'open', signIn: { id: 's-abcdef12', service: 'Expo', url: LINK, at: 1 } });
    Supervisor.prototype.endSignInWait.call({ store: s } as unknown as Supervisor, 'p', 'w');
    expect(s.answered).toEqual([['p', 'w', { id: 's-abcdef12', said: 'replied' }, { source: 'founder' }]]);
  });

  it('does nothing when no card is open, or the open one is already answered', () => {
    const none = store({ id: 'w', status: 'open' });
    Supervisor.prototype.endSignInWait.call({ store: none } as unknown as Supervisor, 'p', 'w');
    expect(none.answered).toEqual([]);
    const answered = store({ id: 'w', status: 'open', signIn: { id: 's-abcdef12', service: 'Expo', url: LINK, at: 1 }, signInAnswer: { id: 's-abcdef12', said: 'skipped', at: 2 } });
    Supervisor.prototype.endSignInWait.call({ store: answered } as unknown as Supervisor, 'p', 'w');
    expect(answered.answered).toEqual([]);
  });

  it('never stops the reply when the card cannot be read', () => {
    const broken = { readItem: () => { throw new Error('disk gone'); }, answerSignIn: () => {} };
    expect(() => Supervisor.prototype.endSignInWait.call({ store: broken } as unknown as Supervisor, 'p', 'w')).not.toThrow();
  });

  it('keeps replied as an answer the card can hold', () => {
    expect(cleanSignInAnswer({ id: 's-abcdef12', said: 'replied', at: 3 })).toEqual({ id: 's-abcdef12', said: 'replied', at: 3 });
    expect(openSignIn({ signIn: { id: 's-abcdef12', service: 'Expo', url: LINK, at: 1 }, signInAnswer: { id: 's-abcdef12', said: 'replied', at: 3 } })).toBeNull();
  });
});

describe('the agent waiting on the card', () => {
  let product: { id: string; dir: string };
  let work: typeof import('../mcp/core/work.mts');
  let disk: typeof import('../main/store/work-items.mts');
  beforeEach(async () => {
    const home = (await import('../main/store/home.mts')).appHome();
    process.env.STORE_ACCOUNT_ID = 'acct-sign-in-reply';
    fs.mkdirSync(path.join(home, 'accounts', 'acct-sign-in-reply'), { recursive: true });
    (await import('../mcp/core/account.mts')).resolveAccount();
    const made = (await import('../mcp/core/products.mts')).createProduct(`Sign in reply ${Math.random().toString(36).slice(2, 8)}`);
    product = { id: made.id, dir: path.join(home, 'accounts', 'acct-sign-in-reply', made.id) };
    work = await import('../mcp/core/work.mts');
    disk = await import('../main/store/work-items.mts');
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('stops waiting the moment they reply, and is told their message comes next', async () => {
    const { askToSignIn, waitForSignIn } = await import('../mcp/core/sign-in.mts');
    const t = work.createItem(product.id, { title: 'Run the phone test', labels: ['founder'] }, { source: 'system' });
    const ask = askToSignIn(t.id, { service: 'Expo', url: LINK, code: 'NJLM-CWGJ' }, { product: product.id });
    const waiting = waitForSignIn(t.id, ask.id, { product: product.id, waitMs: 10_000, pollMs: 20 });
    disk.updateWorkItem(product.dir, t.id, { signInAnswer: { id: ask.id, said: 'replied', at: Date.now() } }, { source: 'founder' });
    const started = Date.now();
    const out = await waiting;
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(out.status).toBe('replied');
    expect(out.message).toMatch(/message/i);
    expect(out.message).toMatch(/end your turn/i);
    expect(openSignIn(disk.readWorkItem(product.dir, t.id))).toBeNull();
  });
});

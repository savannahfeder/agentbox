// A new teammate asked its three setup questions in the team chat and ended its
// run with "Three questions for you in the chat". That line was all the inbox
// showed. On the real store (Test fix lead, 2026-11-02) the row was closed 78
// seconds after it arrived and the questions were answered in the chat 4.4
// hours later. Anything waiting on you belongs in the inbox, so a teammate's
// open questions are drawn in the thread that asked them, with the same
// answers to tap, and the setup brief no longer points you at the chat.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openQuestionsIn, answerTo } from '../renderer/src/teammates/chat-lines.ts';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';

const ADA = 't-aaaaaaaaaa';
const BO = 't-bbbbbbbbbb';
const RUN = 'w-setup';
const run = (extra = {}) => ({ id: RUN, labels: ['founder', `teammate:${ADA}`, 'hop:0'], ...extra });
const ask = (id, ts, options, extra = {}) => ({ id, kind: 'msg', from: ADA, to: [], text: `Question ${id}?`, ts, options, run: RUN, ...extra });
const mine = (id, text, ts, extra = {}) => ({ id, kind: 'msg', from: 'you', to: [ADA], text, ts, ...extra });
const view = (chat, runs = []) => ({ list: [], chat, runs });

const Q1 = ask('m-q1', 10, ['Red main only', 'Any failing test']);
const Q2 = ask('m-q2', 11, ['Always ship', 'Ask me first']);

describe('the questions a teammate thread shows you', () => {
  it('are the ones it asked in that thread, with answers, that you have not answered', () => {
    expect(openQuestionsIn(view([Q1, Q2]), run()).map((q) => q.id)).toEqual(['m-q1', 'm-q2']);
  });

  it('leave out a message with nothing to tap, and questions asked in another thread or by another teammate', () => {
    const plain = ask('m-plain', 12, undefined);
    const elsewhere = ask('m-else', 13, ['Yes', 'No'], { run: 'w-other' });
    const other = ask('m-bo', 14, ['Yes', 'No'], { from: BO });
    expect(openQuestionsIn(view([Q1, plain, elsewhere, other]), run()).map((q) => q.id)).toEqual(['m-q1']);
  });

  it('drop a question you answered in the chat, and keep the one you left out', () => {
    const v = view([Q1, Q2, mine('m-a', 'x', 20, { answers: { 'm-q1': 'Any failing test' } })]);
    expect(openQuestionsIn(v, run()).map((q) => q.id)).toEqual(['m-q2']);
  });

  it('drop every question once you replied in the thread itself, and the chat reads them as answered', () => {
    const v = view([Q1, Q2], [{ id: `${RUN}:answered`, kind: 'run', verb: 'answered', teammate: ADA, item: RUN, product: 'p', title: 't', text: 'Any failing test, always ship', ts: 30 }]);
    expect(openQuestionsIn(v, run())).toEqual([]);
    expect(answerTo(v, Q1)).toBe('Any failing test, always ship');
  });

  it('keep a question asked after your last reply in the thread', () => {
    const later = ask('m-q3', 40, ['Yes', 'No']);
    const v = view([Q1, later], [{ id: `${RUN}:answered`, kind: 'run', verb: 'answered', teammate: ADA, item: RUN, product: 'p', title: 't', text: 'Sure', ts: 30 }]);
    expect(openQuestionsIn(v, run()).map((q) => q.id)).toEqual(['m-q3']);
  });

  it('are none on a thread no teammate runs', () => {
    expect(openQuestionsIn(view([Q1]), { id: RUN, labels: ['founder'] })).toEqual([]);
    expect(openQuestionsIn(null, run())).toEqual([]);
  });
});

describe('the inbox draws them', () => {
  const app = fs.readFileSync(path.join(import.meta.dirname, '../renderer/src/App.tsx'), 'utf8');
  const focus = fs.readFileSync(path.join(import.meta.dirname, '../renderer/src/components/Focus.tsx'), 'utf8');
  it('in the thread, under what the teammate said, with the chat\'s own answers to tap', () => {
    expect(app).toMatch(/<ThreadQuestions\b/);
    expect(focus).toMatch(/\{questions\}/);
  });
});

describe('a new teammate\'s brief', () => {
  let team;
  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    const product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    const dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    team = new Teammates({
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    });
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('ends its asking run on the questions in your inbox, open, and never sends you to the chat', () => {
    const { teammate } = team.describe({ text: 'Someone to fix red tests', greeted: true });
    const brief = team.briefFor({ id: 'w-s', labels: ['founder', `teammate:${teammate.id}`, 'hop:0'] });
    expect(brief).not.toMatch(/finish this run quietly/);
    expect(brief).toMatch(/drawn under it in their inbox/);
    expect(brief).toMatch(/never say they are in the chat/i);
  });
});

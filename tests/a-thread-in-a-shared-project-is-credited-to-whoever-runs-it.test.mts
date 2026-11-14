// 2026-11-11: two synthetic testers on one two-person team, seen 9 times
// between them. Theo shared his "Payments API" project and his agents worked in
// it. On Theo's screen "Lena / Working on" listed his own Stripe runbook; on
// Lena's, "You" listed Theo's runbook, CSV and auth audit, which were also
// listed under Theo. "I cannot tell who did what after returning."
//
// Two causes, one rule missing from both. A shared project's rows are synced
// into both stores: cardsFor on Lena's Mac published Theo's rows as Lena's
// cards, and teamToday filed every row in the viewer's store under You.
// Measured by running cardsFor for each Mac and teamToday on each side over the
// same rows and reading whose card, and whose section, each thread lands in.
// The rule is runnerOf (shared/team-rules.mts): a shared project's thread is
// the person's whose Mac runs it.
import { describe, it, expect } from 'vitest';
import { cardsFor } from '../shared/thread-cards.mts';
import { teamToday } from '../renderer/src/team/today.ts';

const LENA = 'p-lena';
const THEO = 'p-theo';
const NOW = new Date(2026, 10, 11, 15, 0).getTime();
const at = (h: number) => new Date(2026, 10, 11, h, 0).getTime();

const payments = { slug: 'payments-api', name: 'Payments API', dir: '/nowhere', team: { projectId: 'proj-pay', teamId: 't-1', visibility: 'team', people: [LENA, THEO], sharedBy: THEO, direct: false } };
const lenaSite = { slug: 'lena-site', name: 'Lena site', dir: '/nowhere' };

const row = (o: Record<string, unknown>) => ({ product: 'payments-api', status: 'open', labels: [], createdAt: at(8), updatedAt: at(10), ...o }) as { id: string; product: string } & Record<string, unknown>;
const runbook = row({ id: 'w-runbook', title: 'Stripe runbook', createdBy: THEO, progress: 'Read the Stripe docs\nWrote stripe-key-rotation.md', updatedAt: at(11) });
const csv = row({ id: 'w-csv', title: 'Payouts CSV export', createdBy: THEO, status: 'done', updatedAt: at(9), wrote: { status: { ts: at(9), by: THEO } } });
const lenaOwn = row({ id: 'w-lena-own', title: 'Refund webhook', createdBy: LENA, updatedAt: at(12) });
const handed = row({ id: 'w-handed', title: 'Auth audit', createdBy: THEO, runner: LENA, wrote: { runner: { ts: at(9), by: LENA } }, updatedAt: at(13) });
const fromBefore = row({ id: 'w-before', title: 'Ledger schema', updatedAt: at(10) });
const privateRow = { ...row({ id: 'w-private', title: 'Landing copy', createdBy: THEO, updatedAt: at(10) }), product: 'lena-site' };
const waitsOnTheo = row({ id: 'w-waits', title: 'Rotate prod keys', createdBy: LENA, status: 'blocked', blockedBy: ['w-runbook'], updatedAt: at(10) });

const shared = [runbook, csv, lenaOwn, handed, fromBefore, waitsOnTheo];
const cardsOn = (me: string) => cardsFor({
  products: [payments, lenaSite],
  readItems: (p) => (p.slug === 'payments-api' ? shared : [privateRow]) as never,
  now: NOW, since: 0, me,
});
const ids = (cards: { threadId: string }[]) => cards.map((c) => c.threadId).sort();

describe('the cards each Mac publishes for a shared project', () => {
  it("Lena's Mac publishes no card for a thread Theo created and runs", () => {
    expect(ids(cardsOn(LENA))).not.toContain('w-runbook');
    expect(ids(cardsOn(LENA))).not.toContain('w-csv');
  });

  it("Theo's Mac publishes it", () => {
    expect(ids(cardsOn(THEO))).toEqual(expect.arrayContaining(['w-runbook', 'w-csv']));
  });

  it("Lena's own thread in Theo's project is still Lena's card, and not Theo's", () => {
    expect(ids(cardsOn(LENA))).toContain('w-lena-own');
    expect(ids(cardsOn(THEO))).not.toContain('w-lena-own');
  });

  it('a thread handed to Lena that she now runs is her card, not the creator\'s', () => {
    expect(ids(cardsOn(LENA))).toContain('w-handed');
    expect(ids(cardsOn(THEO))).not.toContain('w-handed');
  });

  it('a row with no creator belongs to whoever shared the project', () => {
    expect(ids(cardsOn(THEO))).toContain('w-before');
    expect(ids(cardsOn(LENA))).not.toContain('w-before');
  });

  it('a private project is unchanged: every row in it is this Mac\'s card, whoever is named on it', () => {
    expect(ids(cardsOn(LENA))).toContain('w-private');
  });

  it('every shared thread is published by exactly one Mac', () => {
    const lena = ids(cardsOn(LENA)).filter((id) => id !== 'w-private');
    const theo = ids(cardsOn(THEO)).filter((id) => id !== 'w-private');
    expect(lena.filter((id) => theo.includes(id))).toEqual([]);
    expect([...lena, ...theo].sort()).toEqual(shared.map((r) => r.id).sort());
  });
});

describe("the Everyone feed on each side", () => {
  const card = (personId: string, item: Record<string, unknown>, o: Record<string, unknown> = {}) => ({
    personId, threadId: item.id, visible: true, title: item.title, project: 'Payments API', people: null,
    state: 'running', priority: null, problem: null, progress: item.progress ?? null, solution: null,
    blockedBy: [], blocks: [], updatedAt: item.updatedAt, ...o,
  });
  const dayFor = (me: string, other: { id: string; name: string }, cards: Record<string, unknown>[]) => teamToday({
    range: 'today', now: NOW, me, items: [...shared, privateRow] as never, products: [payments, lenaSite] as never,
    cards: cards as never, decisions: [], needs: [], people: [other], mates: [], mateOf: () => null,
  });
  const section = (day: ReturnType<typeof dayFor>, key: string, list: 'working' | 'finished' | 'blocked') => (day.people.find((p) => p.key === key)?.[list] ?? []).map((l) => l.title);

  const onLena = dayFor(LENA, { id: THEO, name: 'Theo Park' }, [
    card(THEO, runbook), card(THEO, csv, { state: 'done' }), card(THEO, fromBefore),
  ]);
  const onTheo = dayFor(THEO, { id: LENA, name: 'Lena Fischer' }, [card(LENA, lenaOwn), card(LENA, handed)]);

  it("on Lena's screen Theo's runbook is listed once, under Theo, with how far it got", () => {
    const all = onLena.people.flatMap((p) => p.working.map((l) => l.title));
    expect(all.filter((t) => t === 'Stripe runbook')).toHaveLength(1);
    expect(section(onLena, `person:${THEO}`, 'working')).toContain('Stripe runbook');
    const line = onLena.people.find((p) => p.key === `person:${THEO}`)!.working.find((l) => l.title === 'Stripe runbook')!;
    expect(line.says).toBe('Wrote stripe-key-rotation.md');
  });

  it("on Lena's screen You lists none of Theo's threads", () => {
    expect(section(onLena, 'me', 'working')).not.toContain('Stripe runbook');
    expect(section(onLena, 'me', 'working')).not.toContain('Ledger schema');
    expect(section(onLena, 'me', 'finished')).not.toContain('Payouts CSV export');
    expect(section(onLena, `person:${THEO}`, 'finished')).toEqual(['Payouts CSV export']);
  });

  it("on Lena's screen You still lists her own thread, the one handed to her, and her private project", () => {
    expect(section(onLena, 'me', 'working')).toEqual(['Auth audit', 'Refund webhook', 'Landing copy']);
  });

  it("on Lena's screen a thread of hers waiting on Theo's says it waits on Theo", () => {
    const line = onLena.people.find((p) => p.key === 'me')!.blocked.find((l) => l.title === 'Rotate prod keys');
    expect(line?.on).toBe('Theo');
  });

  it('a task Theo gave Lena in their two-person record is still on her list of tasks', () => {
    const chat = { slug: 'direct-theo', name: 'Direct', dir: '/nowhere', team: { projectId: 'd-1', teamId: 't-1', visibility: 'people', people: [LENA, THEO], sharedBy: THEO, direct: true } };
    const task = { ...row({ id: 'w-task', title: 'Check the payout totals', labels: ['given-task'], createdBy: THEO, assignee: LENA, people: [THEO, LENA] }), product: 'direct-theo' };
    const day = teamToday({
      range: 'today', now: NOW, me: LENA, items: [task] as never, products: [chat] as never,
      cards: [], decisions: [], needs: [], people: [{ id: THEO, name: 'Theo Park' }], mates: [], mateOf: () => null,
    });
    expect(day.people.find((p) => p.key === 'me')?.tasks.map((l) => l.item?.id)).toEqual(['w-task']);
  });

  it("on Theo's screen Lena lists only Lena's threads, and You lists his own runbook", () => {
    expect(section(onTheo, `person:${LENA}`, 'working')).toEqual(['Auth audit', 'Refund webhook']);
    expect(section(onTheo, `person:${LENA}`, 'working')).not.toContain('Stripe runbook');
    expect(section(onTheo, 'me', 'working')).toEqual(expect.arrayContaining(['Stripe runbook', 'Ledger schema']));
    expect(section(onTheo, 'me', 'working')).not.toContain('Refund webhook');
    expect(section(onTheo, 'me', 'working')).not.toContain('Auth audit');
  });
});

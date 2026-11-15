// AUTO OFFERS A TEAMMATE IN THE MOMENT, NOT FROM WORDS COUNTED IN HINDSIGHT (w-bb45118b10).
//
// The app offered a teammate when three of your thread titles in a month shared
// two words (`offerFrom`, shared/teammates.mts). It knew nothing about what a
// teammate is for, and the founder kept getting "random bad recommendations".
// Auto already asks the small model one question about every thread sent to it;
// that same call now also says whether this is work a teammate of its own would
// do better (it repeats, it is a long project that learns, it is a role), and
// the thread shows the offer there and then. The thread is never held for it:
// with no teammates, it goes to an agent at once and the offer comes after.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs, { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fake = vi.hoisted(() => ({ spawns: [] as unknown[], reply: [1, ''] as [number, string], queue: [] as [number, string][] }));
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual<typeof import('node:child_process')>();
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    ...actual,
    spawn: (bin: string, args: string[], options: unknown) => {
      fake.spawns.push({ bin, args, options });
      const child = new Emitter() as Emitter & { stdout: Emitter; stderr: Emitter; kill: () => boolean };
      child.stdout = new Emitter();
      child.stderr = new Emitter();
      child.kill = () => true;
      const [code, out] = fake.queue.shift() ?? fake.reply;
      setTimeout(() => { if (out) child.stdout.emit('data', Buffer.from(out)); child.emit('close', code); }, 0);
      return child;
    },
  };
});

const { Supervisor } = await import('../main/supervisor.mts');
const { AUTO_LABEL, NOBODY_WHY, routePrompt, readOffer, routedPatch } = await import('../shared/auto-route.mts');
const { cleanRouted } = await import('../shared/work-items.mts');

const video = { id: 't-video', name: 'Video producer', role: 'Video producer', job: 'Makes the clips.', status: 'active', paused: false, duties: [] };
const chief = { id: 't-chief', name: 'Chief of staff', role: 'Chief of staff', job: 'Hands work on.', status: 'active', paused: false, primary: true, duties: [] };

const dirs: string[] = [];
function build({ items = [] as unknown[], team = [video] as unknown[], teammatesOn = true, declined = [] as string[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'auto-offer-'));
  dirs.push(dir);
  const product = { slug: 'shop', name: 'Shop', dir, repoPath: null };
  const routed: { id: string; patch: Record<string, unknown> }[] = [];
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-discovered-accounts', storeRoot: dir, claudeBin: '/nonexistent/claude', claudeFound: true,
      maxConcurrentSessions: 3, authProfiles: ['default'], autonomousProducts: ['shop'],
      ...(teammatesOn ? { alphaTeammates: true } : {}),
    },
    {
      listItems: () => items, listProducts: () => [product], getProduct: () => product, isDue: () => true,
      settleAnswer() {}, recordSessionResult() {}, listRepeats: () => [],
      teammates: { list: () => team, declinedRoles: () => declined },
      routeItem: (_slug: string, id: string, patch: Record<string, unknown>) => routed.push({ id, patch }),
    },
    '/nonexistent-app',
  );
  sup.wake = () => {};
  return { sup, routed };
}

const thread = (extra = {}) => ({
  id: 'w-auto', product: 'shop', kind: 'directive', status: 'open', title: 'Write this week\'s launch post for X.',
  body: '', labels: ['founder', AUTO_LABEL], priority: 5, createdAt: 1, updatedAt: 1, claim: null, ...extra,
});

beforeEach(() => { fake.spawns.length = 0; fake.reply = [1, '']; fake.queue.length = 0; });
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

describe('the question Auto asks', () => {
  it('asks whether a teammate of its own would do this better, and why that would be', () => {
    const prompt = routePrompt(thread(), [video], []);
    expect(prompt).toMatch(/Teammate: /);
    expect(prompt).toMatch(/repeats/);
    expect(prompt).toMatch(/long project/);
    expect(prompt).toMatch(/one-off/i);
  });

  it('names the roles it must not offer: the ones you have and the ones you turned down', () => {
    const prompt = routePrompt(thread(), [video], [], { declined: ['Recruiter'] });
    expect(prompt).toMatch(/Never offer.*Video producer/);
    expect(prompt).toMatch(/Never offer.*Recruiter/);
  });
});

describe('reading the offer', () => {
  it('reads a role with no why, which the small model sometimes writes', () => {
    expect(readOffer('0 | -\nTeammate: Support')).toEqual({ role: 'Support', why: '' });
  });

  it('reads a role and why', () => {
    expect(readOffer('0 | -\nTeammate: Marketer | It is a post every week, and it would learn your voice.'))
      .toEqual({ role: 'Marketer', why: 'It is a post every week, and it would learn your voice.' });
  });

  it('reads none as no offer, and a missing or garbled line as none', () => {
    for (const reply of ['0 | -\nTeammate: -', '0 | -', '0 | -\nTeammate: | why', '0 | -\nI think a marketer would help.']) {
      expect(readOffer(reply)).toBeNull();
    }
  });

  it('refuses a role that is a sentence rather than a role', () => {
    expect(readOffer('0 | -\nTeammate: Someone who writes posts every single week for the launch | x')).toBeNull();
  });

  it('never offers a role you have or turned down, however it is written', () => {
    expect(readOffer('0 | -\nTeammate: video producer | It makes clips.', { taken: ['Video producer'] })).toBeNull();
    expect(readOffer('0 | -\nTeammate: Recruiter | It hires.', { taken: ['recruiter'] })).toBeNull();
  });
});

describe('the offer on the thread', () => {
  const offer = { role: 'Marketer', why: 'It repeats every week.' };

  it('rides with a thread that went to an agent or to your primary', () => {
    expect(routedPatch(thread(), { to: 'agent', why: 'x', offer }).routed.offer).toEqual(offer);
    expect(routedPatch(thread(), { to: 'mate:t-chief', why: 'x', offer }).routed.offer).toEqual(offer);
  });

  it('is kept by the store, and an answer to it too', () => {
    expect(cleanRouted({ to: 'agent', why: 'x', at: 1, by: 'auto', offer: { ...offer, answered: 'no' } })?.offer).toEqual({ ...offer, answered: 'no' });
    expect(cleanRouted({ to: 'agent', why: 'x', at: 1, by: 'auto', offer: { role: '', why: 'x' } })?.offer).toBeUndefined();
  });
});

describe('a thread sent to Auto', () => {
  // Since 2026-11-12 the thread is routed first and the offer follows once the
  // card's reasons are asked for (tests/the-teammate-offer-is-a-card-under-the-answer).
  it('carries the offer when nobody\'s job covers it', async () => {
    fake.reply = [0, '0 | -\nTeammate: Marketer | It is a post every week, and it would learn your voice.\n'];
    const { sup, routed } = build({ items: [thread()] });
    await sup.routeTheThreads([thread()]);
    expect(fake.spawns).toHaveLength(2);
    expect(routed).toHaveLength(2);
    expect(routed[0].patch.routed).toMatchObject({ to: 'agent' });
    expect(routed[1].patch.routed).toMatchObject({ to: 'agent', offer: { role: 'Marketer' } });
  });

  it('asks the card\'s three reasons only once there is an offer, and puts them on it', async () => {
    fake.queue.push([0, '0 | -\nTeammate: Marketer | It repeats.\n'], [0, '- Learns your voice\n- Carries on from this post\n- Writes it every Monday, and asks first\n']);
    const { sup, routed } = build({ items: [thread()] });
    await sup.routeTheThreads([thread()]);
    expect(routed.at(-1)!.patch.routed).toMatchObject({ offer: { role: 'Marketer', gains: ['Learns your voice', 'Carries on from this post', 'Writes it every Monday, and asks first'] } });
  });

  it('asks nothing more when there is no offer', async () => {
    fake.reply = [0, '0 | -\nTeammate: -\n'];
    const { sup } = build({ items: [thread()] });
    await sup.routeTheThreads([thread()]);
    expect(fake.spawns).toHaveLength(1);
  });

  it('still makes the offer, with the card\'s own reasons, when the second question fails', async () => {
    fake.queue.push([0, '0 | -\nTeammate: Marketer | It repeats.\n'], [1, '']);
    const { sup, routed } = build({ items: [thread()] });
    await sup.routeTheThreads([thread()]);
    expect(routed.at(-1)!.patch.routed).toMatchObject({ offer: { role: 'Marketer', why: 'It repeats.' } });
    expect((routed.at(-1)!.patch.routed as { offer: { gains?: unknown } }).offer.gains).toBeUndefined();
  });

  it('puts no offer on a thread you gave to someone else while it was asked', async () => {
    fake.queue.push([0, '0 | -\nTeammate: Marketer | It repeats.\n'], [0, '- a\n- b\n- c\n']);
    const items = [thread()];
    const { sup, routed } = build({ items });
    // Your pick lands while the second question is out.
    const realAsk = sup._askSmall.bind(sup);
    let asked = 0;
    sup._askSmall = (async (ask: never, opts: never) => {
      if (++asked === 2) items[0] = thread({ routed: { to: 'mate:t-video', why: 'x', at: 1, by: 'you' } });
      return realAsk(ask, opts);
    }) as typeof sup._askSmall;
    await sup.routeTheThreads([thread()]);
    expect(routed).toHaveLength(1);
  });

  it('carries no offer when it went to a teammate whose job it is', async () => {
    fake.reply = [0, '1 | It made the last four clips.\nTeammate: Marketer | x\n'];
    const { sup, routed } = build({ items: [thread()] });
    await sup.routeTheThreads([thread()]);
    expect((routed[0].patch.routed as { offer?: unknown }).offer).toBeUndefined();
  });

  it('goes to your primary with the offer when Auto is unsure who', async () => {
    fake.reply = [0, 'P | It needs several of them.\nTeammate: Marketer | It repeats.\n'];
    const { sup, routed } = build({ items: [thread()], team: [video, chief] });
    await sup.routeTheThreads([thread()]);
    expect(routed.at(-1)!.patch.routed).toMatchObject({ to: 'mate:t-chief', offer: { role: 'Marketer' } });
  });

  it('with no teammates yet, goes to an agent at once, and the offer follows', async () => {
    fake.reply = [0, '0 | -\nTeammate: Marketer | It repeats every week.\n'];
    const { sup, routed } = build({ items: [thread()], team: [] });
    await sup.routeTheThreads([thread()]);
    expect(routed[0].patch.routed).toMatchObject({ to: 'agent', why: NOBODY_WHY });
    expect((routed[0].patch.routed as { offer?: unknown }).offer).toBeUndefined();
    expect(routed).toHaveLength(2);
    expect(routed[1].patch).toEqual({ routed: expect.objectContaining({ to: 'agent', why: NOBODY_WHY, offer: { role: 'Marketer', why: 'It repeats every week.' } }) });
  });

  it('with no teammates and no offer, writes the thread once and leaves it', async () => {
    fake.reply = [0, '0 | -\nTeammate: -\n'];
    const { sup, routed } = build({ items: [thread()], team: [] });
    await sup.routeTheThreads([thread()]);
    expect(routed).toHaveLength(1);
  });

  it('offers nothing, and asks nothing, while teammates are off', async () => {
    const { sup, routed } = build({ items: [thread()], teammatesOn: false });
    await sup.routeTheThreads([thread()]);
    expect(routed[0].patch.routed).toMatchObject({ to: 'agent', why: NOBODY_WHY });
    expect(fake.spawns).toHaveLength(0);
  });

  it('never offers a role you turned down before', async () => {
    fake.reply = [0, '0 | -\nTeammate: Marketer | It repeats every week.\n'];
    const { sup, routed } = build({ items: [thread()], declined: ['marketer'] });
    await sup.routeTheThreads([thread()]);
    expect((routed[0].patch.routed as { offer?: unknown }).offer).toBeUndefined();
  });

  it('still goes to someone when the model fails, with no offer', async () => {
    fake.reply = [1, ''];
    const { sup, routed } = build({ items: [thread()], team: [] });
    await sup.routeTheThreads([thread()]);
    expect(routed).toHaveLength(1);
    expect(routed[0].patch.routed).toMatchObject({ to: 'agent' });
  });
});

// Found by the power test of 2026-11-11 (founder and ops testers, real plans):
// Not now gave no sign it was pressed until the next refresh, the thread said a
// made teammate was "setting itself up" long after it had, and a two-week
// launch got no offer.
describe('what the power test found', () => {
  // Since 2026-11-12 the offer is a card (tests/the-teammate-offer-is-a-card-under-the-answer).
  const line = () => fs.readFileSync(new URL('../renderer/src/components/TeammateOffer.tsx', import.meta.url), 'utf8');

  it('answers a press at once, before the app has written it', () => {
    expect(line()).toMatch(/setPressed\(make \? 'made' : 'no'\);\s*\n\s*api\.answerRouteOffer/);
    expect(line()).toMatch(/const answered = pressed \?\? offer\?\.answered/);
  });

  it('says a made teammate was made, not that it is still setting up', () => {
    expect(line()).not.toMatch(/setting itself up/);
    expect(line()).toMatch(/You made \{aRole\(offer\.role\)\} for work like this\./);
  });

  it('counts a project that runs for weeks as a long project', () => {
    expect(routePrompt(thread(), [video], [])).toMatch(/runs for weeks/);
  });
});

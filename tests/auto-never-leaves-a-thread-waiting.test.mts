// AUTO NEVER LEAVES A THREAD WAITING (w-b5f23cff71).
//
// A thread sent To Auto carries the `auto` label, and nothing starts it while
// it does: the supervisor asks the small model who takes it first
// (`routeTheThreads`, shared/auto-route.mts). That makes Auto one more thing
// that could hold a thread for good, so this is held to the rules every
// background call here keeps (CLAUDE.md, 2026-10-19): one question per thread,
// a deadline on it, and every way it can fail ends with an agent on the thread
// and a sentence saying so. The one wait is the one she is asked about, and
// that thread is in Needs you.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fake = vi.hoisted(() => ({ spawns: [], reply: [1, ''] }));
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    ...actual,
    spawn: (bin, args, options) => {
      fake.spawns.push({ bin, args, options });
      const child = new Emitter();
      child.stdout = new Emitter();
      child.stderr = new Emitter();
      child.kill = () => true;
      const [code, out] = fake.reply;
      setTimeout(() => { if (out) child.stdout.emit('data', Buffer.from(out)); child.emit('close', code); }, 0);
      return child;
    },
  };
});

const { Supervisor } = await import('../main/supervisor.mts');
const { AUTO_LABEL, AGENT_WHY, NOBODY_WHY, FAILED_WHY } = await import('../shared/auto-route.mts');

const video = { id: 't-video', name: 'Video producer', role: null, job: 'Makes the clips.', status: 'active', paused: false, duties: [] };
const growth = { id: 't-growth', name: 'Growth marketer', role: null, job: 'Writes the posts.', status: 'active', paused: false, duties: [] };

const dirs = [];
function build({ items = [], team = [video, growth], teammatesOn = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'auto-route-'));
  dirs.push(dir);
  const product = { slug: 'shop', name: 'Shop', dir, repoPath: null };
  const routed = [];
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-discovered-accounts', storeRoot: dir, claudeBin: '/nonexistent/claude', claudeFound: true,
      maxConcurrentSessions: 3, authProfiles: ['default'], autonomousProducts: ['shop'],
      ...(teammatesOn ? { alphaTeammates: true } : {}),
    },
    {
      listItems: () => items, listProducts: () => [product], getProduct: () => product, isDue: () => true,
      settleAnswer() {}, recordSessionResult() {}, listRepeats: () => [],
      teammates: { list: () => team },
      routeItem: (slug, id, patch) => routed.push({ id, patch }),
    },
    '/nonexistent-app',
  );
  sup.wake = () => {};
  return { sup, routed };
}

const thread = (extra = {}) => ({
  id: 'w-auto', product: 'shop', kind: 'directive', status: 'open', title: 'Make a clip of Codex picking up a thread.',
  body: '', labels: ['founder', AUTO_LABEL], priority: 5, createdAt: 1, updatedAt: 1, claim: null, ...extra,
});

beforeEach(() => { fake.spawns.length = 0; fake.reply = [1, '']; });
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

describe('a thread sent to Auto', () => {
  it('is not started while it waits to be given to someone', () => {
    const { sup } = build();
    expect(sup._isFreshWork(thread())).toBe(false);
    expect(sup._isFreshWork(thread({ labels: ['founder'] }))).toBe(true);
  });

  it('goes to the teammate the small model names, asked once', async () => {
    fake.reply = [0, '1 | It made the last four clips.\n'];
    const { sup, routed } = build({ items: [thread()] });
    await sup.routeTheThreads([thread()]);
    expect(fake.spawns).toHaveLength(1);
    expect(routed).toHaveLength(1);
    expect(routed[0].patch.labels).toEqual(['founder', 'teammate:t-video']);
    expect(routed[0].patch.routed).toMatchObject({ to: 'mate:t-video', why: 'It made the last four clips.' });
  });

  it('goes to an agent when the model says nobody', async () => {
    fake.reply = [0, '0 | -\n'];
    const { sup, routed } = build();
    await sup.routeTheThreads([thread()]);
    expect(routed[0].patch).toMatchObject({ labels: ['founder'], routed: { to: 'agent', why: AGENT_WHY } });
  });

  it('goes to an agent, saying Auto could not decide, when no answer comes or it is not one', async () => {
    for (const reply of [[1, ''], [0, 'I would give this to the Video producer.\n']]) {
      fake.reply = reply;
      const { sup, routed } = build();
      await sup.routeTheThreads([thread()]);
      expect(routed[0].patch).toMatchObject({ labels: ['founder'], routed: { to: 'agent', why: FAILED_WHY } });
    }
  });

  it('goes to an agent without asking anything when there is no teammate to give it to', async () => {
    for (const setup of [{ team: [] }, { team: [{ ...video, paused: true }] }, { teammatesOn: false }]) {
      const { sup, routed } = build(setup);
      await sup.routeTheThreads([thread()]);
      expect(routed[0].patch.routed).toMatchObject({ to: 'agent', why: NOBODY_WHY });
    }
    expect(fake.spawns).toHaveLength(0);
  });

  it('asks her when the model names two, and that thread is in Needs you', async () => {
    fake.reply = [0, '1,2 | Both have worked on the captions.\n'];
    const { sup, routed } = build();
    await sup.routeTheThreads([thread()]);
    const asked = { ...thread(), ...routed[0].patch };
    expect(asked.routed.ask).toEqual(['mate:t-video', 'mate:t-growth']);
    expect(sup._isFreshWork(asked)).toBe(false);
    // Asked once: a thread waiting on her is not asked about again.
    await sup.routeTheThreads([asked]);
    expect(fake.spawns).toHaveLength(1);
  });

  it('asks about one thread at a time, the oldest first', async () => {
    fake.reply = [0, '2 | It writes the posts.\n'];
    const { sup, routed } = build();
    const first = sup.routeTheThreads([thread({ id: 'w-new', createdAt: 9 }), thread({ id: 'w-old', createdAt: 2 })]);
    expect(sup.routeTheThreads([thread({ id: 'w-new', createdAt: 9 })])).toBeUndefined();
    await first;
    expect(routed.map((r) => r.id)).toEqual(['w-old']);
  });

  it('carries a deadline on the question', () => {
    expect(source).toMatch(/\nconst ROUTE_TIMEOUT_MS = 60_000;/);
    expect(String(Supervisor.prototype.routeTheThreads)).toMatch(/askSmallModel\(prompt, clean, \{ \.\.\.opts, timeoutMs: ROUTE_TIMEOUT_MS[ ,]/);
  });

  // The supervisor's `stalled` is the list Needs you takes as nothing will start it.
  it('that asks her is named among the threads nothing will start', () => {
    expect(source).toMatch(/&& \(this\._isHeld\(i\) \|\| asksWho\(i\) \|\|/);
  });
});

const source = (await import('node:fs')).readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');

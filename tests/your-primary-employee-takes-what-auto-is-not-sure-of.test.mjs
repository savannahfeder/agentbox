// YOUR PRIMARY EMPLOYEE TAKES WHAT AUTO IS NOT SURE OF (w-cb18598d2f).
//
// Grok Bot's first bot is a primary one: "Your primary Bot is your main point
// of contact. It checks in with you on its own and coordinates work with your
// other Bots." The person wanted the same, but not in front of every thread:
// "That would certainly cost extra and slow down miscellaneous threads ...
// Maybe auto-routing is just like that in case it's undecided."
//
// So Auto keeps its one quick question to the small model. A clear answer goes
// where it always went: the teammate whose job it is, or an agent for a
// one-off. Only what Auto cannot place goes to the primary employee: two
// teammates fit, no usable answer came back, or the ask spans several jobs.
// Before, the first of those asked the person and the second went to an agent.
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

const { Supervisor } = await import('../main/supervisor.mjs');
const { AUTO_LABEL, AGENT_WHY, FAILED_WHY, NOBODY_WHY, PRIMARY_WHY, PRIMARY_TIE_WHY, routePrompt, readRoute, routeCandidates } = await import('../shared/auto-route.mjs');

const mate = (id, name, extra = {}) => ({ id, name, role: null, job: `${name}'s job.`, status: 'active', paused: false, duties: [], ...extra });
const video = mate('t-video', 'Video producer');
const growth = mate('t-growth', 'Growth marketer');
const chief = mate('t-chief', 'Chief of staff', { primary: true });

const dirs = [];
function build({ team = [video, growth, chief] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'auto-primary-'));
  dirs.push(dir);
  const product = { slug: 'shop', name: 'Shop', dir, repoPath: null };
  const routed = [];
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-discovered-accounts', storeRoot: dir, claudeBin: '/nonexistent/claude', claudeFound: true,
      maxConcurrentSessions: 3, authProfiles: ['default'], autonomousProducts: ['shop'], alphaTeammates: true,
    },
    {
      listItems: () => [], listProducts: () => [product], getProduct: () => product, isDue: () => true,
      settleAnswer() {}, recordSessionResult() {}, listRepeats: () => [],
      teammates: { list: () => team },
      routeItem: (slug, id, patch) => routed.push({ id, patch }),
    },
    '/nonexistent-app',
  );
  sup.wake = () => {};
  return { sup, routed };
}
const thread = () => ({
  id: 'w-auto', product: 'shop', kind: 'directive', status: 'open', title: 'Get the launch ready: a clip, the post and a fix.',
  body: '', labels: ['founder', AUTO_LABEL], priority: 5, createdAt: 1, updatedAt: 1, claim: null,
});
const route = async (reply, team) => {
  fake.reply = reply;
  const { sup, routed } = build(team ? { team } : {});
  await sup.routeTheThreads([thread()]);
  return routed[0]?.patch;
};

beforeEach(() => { fake.spawns.length = 0; fake.reply = [1, '']; });
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

describe('with a primary employee', () => {
  it('a clear teammate still takes it straight away', async () => {
    expect((await route([0, '1 | It made the last four clips.\n'])).labels).toEqual(['founder', 'teammate:t-video']);
  });

  it('a one-off still goes to an agent, not through the primary', async () => {
    expect(await route([0, '0 | -\n'])).toMatchObject({ labels: ['founder'], routed: { to: 'agent', why: AGENT_WHY } });
  });

  it('two teammates that both fit go to the primary instead of asking you', async () => {
    const p = await route([0, '1,2 | Both have worked on the captions.\n']);
    expect(p.labels).toEqual(['founder', 'teammate:t-chief']);
    expect(p.routed).toMatchObject({ to: 'mate:t-chief', why: PRIMARY_TIE_WHY });
    expect(p.routed.ask).toBeUndefined();
  });

  it('no usable answer goes to the primary, saying so', async () => {
    for (const reply of [[1, ''], [0, 'I think the video one.\n']]) {
      expect(await route(reply)).toMatchObject({ labels: ['founder', 'teammate:t-chief'], routed: { to: 'mate:t-chief', why: PRIMARY_WHY } });
    }
  });

  it('an ask that spans several jobs goes to the primary when the model says so', async () => {
    expect((await route([0, 'P | It needs a clip, a post and a fix.\n'])).labels).toEqual(['founder', 'teammate:t-chief']);
  });

  it('the primary is offered as the one for several jobs, never as a job of its own', () => {
    const candidates = routeCandidates([video, growth, chief]);
    expect(candidates.map((t) => t.id)).toEqual(['t-video', 't-growth']);
    const prompt = routePrompt(thread(), candidates, [], { primary: chief });
    expect(prompt).not.toMatch(/\[\d\] Chief of staff/);
    expect(prompt).toMatch(/\[P\] Chief of staff/);
    expect(readRoute('P | It needs three of them.', candidates, chief)).toEqual({ to: 'mate:t-chief', why: 'It needs three of them.' });
  });

  it('with nobody but the primary, a thread goes to an agent without asking anything', async () => {
    expect(await route([0, '1 | x\n'], [chief])).toMatchObject({ labels: ['founder'], routed: { to: 'agent', why: NOBODY_WHY } });
    expect(fake.spawns).toHaveLength(0);
  });
});

describe('without a primary employee', () => {
  it('nothing changes: two that fit asks you, no answer goes to an agent, and P is not on offer', async () => {
    expect((await route([0, '1,2 | Both.\n'], [video, growth])).routed.ask).toEqual(['mate:t-video', 'mate:t-growth']);
    expect(await route([1, ''], [video, growth])).toMatchObject({ routed: { to: 'agent', why: FAILED_WHY } });
    expect(routePrompt(thread(), [video, growth], [])).not.toContain('[P]');
    expect(readRoute('P | x', [video, growth], null)).toBeNull();
  });
});

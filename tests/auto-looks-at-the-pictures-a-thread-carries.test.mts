// AUTO LOOKS AT THE PICTURES A THREAD CARRIES (w-36261bad16).
//
// "why do these all say not started", sent with a screenshot of the inbox, went
// to the YC Partner. The small model that picks who takes a thread was started
// as `claude -p "<words>"`, so the screenshot reached it only as its file name
// and it guessed at what "these" were. Now the pictures go with the question:
// in Claude's input stream as images, or as `--image` to Codex. A picture call
// that fails is asked again with the words alone, so Auto is never worse off
// for having a picture.
//
// Measured on claude-haiku-4-5 through this path with the real screenshot:
// asked what the picture showed, it answered "the Inbox screen showing the IN
// PROGRESS tab, and the STATUS column displays NOT STARTED for nearly all rows".
// With the team as it stood then, that thread went to an agent 4 in 4 and
// "agents get stuck like this all the time" to the Performance lead 4 in 4.
// Each call took about 9s with the picture against 6s without. 197 of the last
// 200 pasted pictures were under the 3.75 MB limit.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fake = vi.hoisted(() => ({ spawns: [] as { bin: string; args: string[]; options: { stdio?: unknown[] }; stdin: string }[], replies: [] as [number, string][] }));
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual<typeof import('node:child_process')>();
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    ...actual,
    spawn: (bin: string, args: string[], options: { stdio?: unknown[] }) => {
      const call = { bin, args, options, stdin: '' };
      fake.spawns.push(call);
      const child = new Emitter() as InstanceType<typeof Emitter> & Record<string, unknown>;
      child.stdout = new Emitter();
      child.stderr = new Emitter();
      child.stdin = Object.assign(new Emitter(), { end: (d?: string) => { call.stdin += d ?? ''; } });
      child.kill = () => true;
      const [code, out] = fake.replies.shift() ?? [1, ''];
      setTimeout(() => { if (out) (child.stdout as InstanceType<typeof Emitter>).emit('data', Buffer.from(out)); child.emit('close', code); }, 0);
      return child;
    },
  };
});

const { Supervisor } = await import('../main/supervisor.mts');
const { AUTO_LABEL } = await import('../shared/auto-route.mts');
const { codexHarness } = await import('../main/harnesses/codex.mts');

const video = { id: 't-video', name: 'Video producer', role: null, job: 'Makes the clips.', status: 'active', paused: false, duties: [] };
const growth = { id: 't-growth', name: 'Growth marketer', role: null, job: 'Writes the posts.', status: 'active', paused: false, duties: [] };

const dirs: string[] = [];
function build(pictures: Record<string, Buffer> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'auto-pictures-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'attachments'));
  for (const [name, bytes] of Object.entries(pictures)) writeFileSync(join(dir, 'attachments', name), bytes);
  const product = { slug: 'shop', name: 'Shop', dir, repoPath: null };
  const routed: { id: string; patch: { routed: { to?: string } } }[] = [];
  const sup = new Supervisor(
    {
      home: '/nonexistent-home-with-no-discovered-accounts', storeRoot: dir, claudeBin: '/nonexistent/claude', claudeFound: true,
      maxConcurrentSessions: 3, authProfiles: ['default'], autonomousProducts: ['shop'], alphaTeammates: true,
    },
    {
      listItems: () => [], listProducts: () => [product], getProduct: () => product, isDue: () => true,
      settleAnswer() {}, recordSessionResult() {}, listRepeats: () => [],
      teammates: { list: () => [video, growth] },
      routeItem: (_slug: string, id: string, patch: { routed: { to?: string } }) => routed.push({ id, patch }),
    },
    '/nonexistent-app',
  );
  sup.wake = () => {};
  return { sup, routed, dir };
}

const thread = (body: string) => ({
  id: 'w-auto', product: 'shop', kind: 'directive', status: 'open', title: 'why do these all say not started',
  body, labels: ['founder', AUTO_LABEL], priority: 5, createdAt: 1, updatedAt: 1, claim: null,
});
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const streamed = (text: string) => [
  JSON.stringify({ type: 'system', subtype: 'init', tools: Array(200).fill('SomeToolWithALongName') }),
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: text }),
].join('\n') + '\n';
const sentMessage = (stdin: string) => JSON.parse(stdin.trim().split('\n')[0]).message;

beforeEach(() => { fake.spawns.length = 0; fake.replies = []; });
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

describe('a thread sent to Auto with a picture', () => {
  it('sends the picture itself to Claude, beside the words, and reads the streamed answer', async () => {
    const { sup, routed } = build({ 'shot.png': PNG });
    fake.replies = [[0, streamed('2 | It writes the posts.')]];
    await sup.routeTheThreads([thread('![shot.png](attachments/shot.png)')]);

    expect(fake.spawns).toHaveLength(1);
    const [call] = fake.spawns;
    expect(call.args).toEqual(expect.arrayContaining(['-p', '--input-format', 'stream-json', '--output-format', 'stream-json']));
    expect(call.args.join(' ')).not.toContain('why do these all say not started');
    expect(call.options.stdio?.[0]).toBe('pipe');
    const message = sentMessage(call.stdin);
    expect(message.content[0].type).toBe('text');
    expect(message.content[0].text).toContain('why do these all say not started\n(a picture, attached)');
    expect(message.content[0].text).not.toContain('attachments/shot.png');
    expect(message.content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') } });
    expect(routed[0].patch.routed.to).toBe('mate:t-growth');
  });

  it('sends three pictures at most, in the order they were attached', async () => {
    const { sup } = build({ 'a.png': PNG, 'b.jpg': PNG, 'c.webp': PNG, 'd.gif': PNG });
    fake.replies = [[0, streamed('0 | -')]];
    await sup.routeTheThreads([thread('![a](attachments/a.png) ![b](attachments/b.jpg) ![c](attachments/c.webp) ![d](attachments/d.gif)')]);
    const images = sentMessage(fake.spawns[0].stdin).content.slice(1);
    expect(images.map((i: { source: { media_type: string } }) => i.source.media_type)).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });

  it('asks again with the words alone when the call with the picture fails', async () => {
    const { sup, routed } = build({ 'shot.png': PNG });
    fake.replies = [[1, ''], [0, '1 | It makes the clips.']];
    await sup.routeTheThreads([thread('![shot.png](attachments/shot.png)')]);
    expect(fake.spawns).toHaveLength(2);
    expect(fake.spawns[1].args).not.toContain('--input-format');
    expect(fake.spawns[1].args.join(' ')).toContain('(a picture you cannot see)');
    expect(routed[0].patch.routed.to).toBe('mate:t-video');
  });

  it('takes a streamed error as no answer', async () => {
    const { sup } = build({ 'shot.png': PNG });
    fake.replies = [[0, JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: '1 | Not logged in' }) + '\n'], [0, '0 | -']];
    await sup.routeTheThreads([thread('![shot.png](attachments/shot.png)')]);
    expect(fake.spawns).toHaveLength(2);
  });
});

describe('a thread sent to Auto without a picture it can send', () => {
  it('asks in words, as before, when there is no picture', async () => {
    const { sup } = build();
    fake.replies = [[0, '0 | -']];
    await sup.routeTheThreads([thread('')]);
    expect(fake.spawns).toHaveLength(1);
    expect(fake.spawns[0].args[0]).toBe('-p');
    expect(fake.spawns[0].args[1]).toContain('why do these all say not started');
    expect(fake.spawns[0].options.stdio?.[0]).toBe('ignore');
  });

  it('asks in words when the picture is not on disk', async () => {
    const { sup } = build();
    fake.replies = [[0, '0 | -']];
    await sup.routeTheThreads([thread('![gone.png](attachments/gone.png)')]);
    expect(fake.spawns[0].args).not.toContain('--input-format');
  });

  it('leaves out a picture too big for Claude to take', async () => {
    const { sup } = build({ 'huge.png': Buffer.alloc(3_800_000) });
    fake.replies = [[0, '0 | -']];
    await sup.routeTheThreads([thread('![huge.png](attachments/huge.png)')]);
    expect(fake.spawns[0].args).not.toContain('--input-format');
  });
});

describe('Codex', () => {
  it('takes each picture as --image before the words', () => {
    const args = codexHarness.smallModelArgs('who takes it', null, ['/p/a.png', '/p/b.png']);
    expect(args.slice(-3)).toEqual(['--image=/p/a.png', '--image=/p/b.png', 'who takes it']);
    expect(codexHarness.smallModelArgs('who takes it').at(-1)).toBe('who takes it');
    expect(codexHarness.smallModelArgs('who takes it').join(' ')).not.toContain('--image');
  });
});

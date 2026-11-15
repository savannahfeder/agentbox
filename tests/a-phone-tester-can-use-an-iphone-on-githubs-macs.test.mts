// A PHONE TESTER CAN USE AN IPHONE ON GITHUB'S MACS.
//
// The product loop's testers only ever had the phone app's browser preview,
// which never shows the iOS keyboard, safe areas or native alerts, and the
// founder's Mac may not have the memory for a simulator. This gives each
// tester an iPhone simulator on one of GitHub's free Macs
// (.github/workflows/iphone-for-testers.yml), driven with the same `phone`
// commands through a tunnel. Measured here on Linux with stand-ins for AXe
// and simctl: what a tester reads and taps, that only the right key is
// answered, how the workday keeps an iPhone, and that the public run carries
// no secret.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { readScreen, lookText, pickThing, swipePoints, frameOf, parseTree } from '../.claude/skills/product-loop/scripts/iphone-screen.mjs';
import { keyFits, makeHost, serve } from '../.claude/skills/product-loop/scripts/iphone-host.mjs';
import { command } from '../.claude/skills/product-loop/scripts/iphone.mjs';
import { repoOf, runFor, addressFrom, ticketOf, newKey, writePhone } from '../.claude/skills/product-loop/scripts/iphones.mjs';
import { keepIPhone, iphoneHours, phonePrompt } from '../.claude/skills/product-loop/scripts/workday.mjs';

// The shape AXe's describe-ui prints: roots with children, frames in points.
const TREE = [{
  type: 'Application', AXLabel: 'Agentbox', frame: { x: 0, y: 0, width: 393, height: 852 },
  children: [
    { type: 'StaticText', AXLabel: 'Needs you', frame: { x: 16, y: 70, width: 120, height: 30 } },
    { type: 'Button', AXLabel: 'New thread', frame: { x: 330, y: 70, width: 44, height: 44 } },
    { type: 'Other', AXLabel: 'Plan the phone app. The plan is ready', frame: { x: 0, y: 140, width: 393, height: 80 } },
    { type: 'Other', AXLabel: 'Every thread in the list', frame: { x: 0, y: 120, width: 393, height: 700 } },
    { type: 'Group', frame: { x: 0, y: 0, width: 393, height: 852 }, children: [
      { type: 'TextField', AXLabel: '', placeholder: 'Reply', AXValue: '', frame: { x: 16, y: 760, width: 300, height: 40 } },
    ] },
    { type: 'Button', AXLabel: 'Off the bottom', frame: { x: 16, y: 900, width: 100, height: 40 } },
    { type: 'Button', AXLabel: 'Switched off', enabled: false, frame: { x: 16, y: 300, width: 100, height: 40 } },
  ],
}];

describe('what a tester reads of the iPhone', () => {
  const screen = readScreen(TREE);

  it('the words top to bottom, and only what a thumb can press, numbered', () => {
    expect(screen.text.split('\n').slice(0, 3)).toEqual(['Agentbox', 'Needs you', 'New thread']);
    expect(screen.things.map((t) => t.words)).toEqual(['New thread', 'Plan the phone app. The plan is ready', 'Reply']);
    expect(screen.things.map((t) => t.n)).toEqual([1, 2, 3]);
    expect(screen.things[2].typeable).toBe(true);
  });

  it('never offers words, a whole area, something off screen or something switched off', () => {
    const offered = screen.things.map((t) => t.words);
    expect(offered).not.toContain('Needs you');
    expect(offered).not.toContain('Every thread in the list');
    expect(offered).not.toContain('Off the bottom');
    expect(offered).not.toContain('Switched off');
  });

  it('presses the middle of a thing', () => {
    expect(screen.things[0]).toMatchObject({ x: 352, y: 92 });
    expect(lookText(screen)).toMatch(/THINGS TO TAP \(3\):\n1\. "New thread"\n2\. /);
  });

  it('reads a frame given as AXFrame text, and a tree printed after a log line', () => {
    expect(frameOf({ AXFrame: '{{16, 70}, {120, 30}}' })).toEqual({ x: 16, y: 70, width: 120, height: 30 });
    expect(parseTree(`starting\n${JSON.stringify(TREE)}`)).toEqual(TREE);
    expect(() => parseTree('no simulator booted')).toThrow(/printed no screen/);
  });

  it('picks by number or by the start of its words, and nothing for words no thing has', () => {
    expect(pickThing(screen.things, '2').words).toMatch(/^Plan/);
    expect(pickThing(screen.things, 'new').words).toBe('New thread');
    expect(pickThing(screen.things, '9')).toBeNull();
    expect(pickThing(screen.things, 'Settings')).toBeNull();
    expect(pickThing(screen.things, '')).toBeNull();
  });

  it('a swipe up moves the finger up the middle of the screen', () => {
    const { from, to } = swipePoints({ width: 393, height: 852 }, 'up');
    expect(from[1]).toBeGreaterThan(to[1]);
    expect(from[0]).toBe(to[0]);
    expect(swipePoints({ width: 393, height: 852 }, 'sideways')).toBeNull();
  });
});

describe('the key', () => {
  const key = newKey();
  const ticket = ticketOf(key);
  it('opens the iPhone only for the key whose sha256 the run was given', () => {
    expect(ticket).toMatch(/^[0-9a-f]{64}$/);
    expect(keyFits(`Bearer ${key}`, ticket)).toBe(true);
    expect(keyFits(`Bearer ${newKey()}`, ticket)).toBe(false);
    expect(keyFits(`Bearer ${ticket}`, ticket)).toBe(false);
    expect(keyFits(undefined, ticket)).toBe(false);
    expect(keyFits(`Bearer ${key}`, 'not-a-ticket')).toBe(false);
  });
});

describe('a tester driving the iPhone through the host', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iphone-host-'));
  const out = path.join(tmp, 'tester');
  const calls = path.join(tmp, 'calls.jsonl');
  const key = newKey();
  let server;
  const called = () => fs.readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  beforeAll(async () => {
    const fake = path.join(tmp, 'fake.mjs');
    fs.writeFileSync(fake, `import fs from 'node:fs';
const [tool, ...args] = process.argv.slice(2);
let stdin = ''; process.stdin.on('data', (d) => { stdin += d; });
process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ tool, args, stdin }) + '\\n');
  if (tool === 'axe' && args[0] === 'describe-ui') process.stdout.write('ready\\n' + ${JSON.stringify(JSON.stringify(TREE))});
  if (tool === 'xcrun' && args.includes('screenshot')) fs.writeFileSync(args.at(-1), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});
`);
    for (const tool of ['axe', 'xcrun']) fs.writeFileSync(path.join(tmp, tool), `#!/bin/sh\nexec '${process.execPath}' '${fake}' ${tool} "$@"\n`, { mode: 0o755 });
    const host = makeHost({ udid: 'SIM-1', bundle: 'now.astral.agentbox', ticket: ticketOf(key), axe: path.join(tmp, 'axe'), xcrun: path.join(tmp, 'xcrun'), settleMs: 0, openMs: 0 });
    server = await serve(host, { port: 0 });
    writePhone(out, { address: `http://127.0.0.1:${server.address().port}`, key });
  });
  afterAll(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('opens the app afresh and reads its screen', async () => {
    const r = await command(out, 'open', []);
    expect(r.code).toBe(0);
    expect(r.print).toMatch(/1\. "New thread"/);
    const xc = called().filter((c) => c.tool === 'xcrun').map((c) => c.args.slice(0, 2).join(' '));
    expect(xc).toEqual(['simctl terminate', 'simctl launch']);
  });

  it('taps a numbered thing at its middle, on this iPhone', async () => {
    await command(out, 'look', []);
    const r = await command(out, 'tap', ['1']);
    expect(r.code).toBe(0);
    expect(called().find((c) => c.args[0] === 'tap').args).toEqual(['tap', '-x', '352', '-y', '92', '--udid', 'SIM-1']);
  });

  it('types what the tester wrote, quotes and dashes and all', async () => {
    await command(out, 'type', ['--not', 'a flag', '"quoted"']);
    expect(called().find((c) => c.args[0] === 'type')).toMatchObject({ args: ['type', '--stdin', '--udid', 'SIM-1'], stdin: '--not a flag "quoted"' });
  });

  it('says so, and taps nothing, for a thing that is not there', async () => {
    const before = called().filter((c) => c.args[0] === 'tap').length;
    const r = await command(out, 'tap', ['Settings']);
    expect(r.code).toBe(1);
    expect(r.print).toMatch(/Nothing to tap called Settings/);
    expect(called().filter((c) => c.args[0] === 'tap').length).toBe(before);
  });

  it('presses a named key and refuses one it does not know', async () => {
    expect((await command(out, 'press', ['Enter'])).code).toBe(0);
    expect(called().find((c) => c.args[0] === 'key').args.slice(0, 2)).toEqual(['key', '40']);
    expect((await command(out, 'press', ['F13'])).print).toMatch(/No key called F13/);
  });

  it('saves a shot beside the diary', async () => {
    const r = await command(out, 'shot', ['inbox']);
    expect(r.print).toMatch(/Saved inbox\.png/);
    expect(fs.readFileSync(path.join(out, 'inbox.png')).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('answers nobody without the key', async () => {
    const other = path.join(tmp, 'stranger');
    writePhone(other, { address: `http://127.0.0.1:${server.address().port}`, key: newKey() });
    await expect(command(other, 'look', [])).rejects.toThrow(/did not take this key/);
    const r = await fetch(`http://127.0.0.1:${server.address().port}/hello`);
    expect(r.status).toBe(401);
  });

  it('tells a tester with no iPhone yet to note it, rather than failing silently', async () => {
    const r = await command(path.join(tmp, 'nobody'), 'look', []);
    expect(r).toMatchObject({ code: 1 });
    expect(r.print).toMatch(/No iPhone is running for you yet/);
  });
});

describe('finding the iPhone a run started', () => {
  it('names the repository from either kind of remote, and nothing from another host', () => {
    expect(repoOf('git@github.com:owner/agentbox.git')).toBe('owner/agentbox');
    expect(repoOf('https://github.com/owner/agentbox.git\n')).toBe('owner/agentbox');
    expect(repoOf('https://github.com/owner/agentbox')).toBe('owner/agentbox');
    expect(repoOf('https://gitlab.com/owner/agentbox.git')).toBeNull();
  });

  it('finds its own run by the ticket in its title, not another tester\'s', () => {
    const mine = ticketOf('a'); const theirs = ticketOf('b');
    const runs = [{ id: 1, display_title: `iPhone for tester ${theirs}` }, { id: 2, display_title: `iPhone for tester ${mine}` }];
    expect(runFor(runs, mine).id).toBe(2);
    expect(runFor(runs, ticketOf('c'))).toBeNull();
  });

  it('reads the address from the artifact the run names, and none from an expired one', () => {
    expect(addressFrom([{ name: 'other' }, { name: 'iphone-at-calm-river-owl' }])).toBe('https://calm-river-owl.trycloudflare.com');
    expect(addressFrom([{ name: 'iphone-at-calm-river-owl', expired: true }])).toBeNull();
    expect(addressFrom([{ name: 'iphone-at-evil.com/x' }])).toBeNull();
  });
});

describe('the workday keeps each tester an iPhone', () => {
  const store = new Map();
  const deps = (aliveNow) => {
    const seen = { started: 0, stopped: 0 };
    return { seen, read: (d) => store.get(d) ?? null, write: (d, p) => store.set(d, p), alive: async () => aliveNow, stop: async () => { seen.stopped++; }, start: async () => { seen.started++; return { address: 'https://new.trycloudflare.com', key: 'k' }; } };
  };

  it('keeps one that still answers', async () => {
    store.set('a', { address: 'https://old.trycloudflare.com', key: 'k' });
    const d = deps(true);
    const r = await keepIPhone('a', d);
    expect(r.fresh).toBe(false);
    expect(d.seen).toEqual({ started: 0, stopped: 0 });
  });

  it('lets a silent one go and starts another', async () => {
    store.set('b', { address: 'https://old.trycloudflare.com', key: 'k' });
    const d = deps(false);
    const r = await keepIPhone('b', d);
    expect(r.fresh).toBe(true);
    expect(d.seen).toEqual({ started: 1, stopped: 1 });
    expect(store.get('b').address).toBe('https://new.trycloudflare.com');
  });

  it('asks for what is left of the day, never past what a GitHub job can hold', () => {
    const now = Date.now();
    expect(iphoneHours(now + 10 * 3_600_000, now)).toBe(5);
    expect(iphoneHours(now + 2.2 * 3_600_000, now)).toBe(2.5);
    expect(iphoneHours(now + 60_000, now)).toBe(0.5);
  });

  it('tells an iPhone tester about the home button, and a browser tester nothing of it', () => {
    const person = { name: 'Ana Ruiz', role: 'founder', text: '' };
    expect(phonePrompt(person, { dir: '/t', minutes: 30, iphone: true })).toMatch(/swipe up\|down\|left\|right, home,.*real iPhone/);
    expect(phonePrompt(person, { dir: '/t', minutes: 30 })).not.toMatch(/home,|real iPhone/);
  });
});

describe('the GitHub run that holds the iPhone', () => {
  const root = new URL('..', import.meta.url);
  const text = fs.readFileSync(new URL('.github/workflows/iphone-for-testers.yml', root), 'utf8');
  const workflow = yaml.load(text) as { on: Record<string, { inputs: Record<string, unknown> }>; 'run-name': string; jobs: { iphone: { 'runs-on': string; 'timeout-minutes': number; steps: { name?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, string> }[] } } };
  const job = workflow.jobs.iphone;

  it('is started by hand on a Mac, and ends inside the 6 hours GitHub allows', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(job['runs-on']).toMatch(/^macos-/);
    expect(job['timeout-minutes']).toBeLessThan(360);
  });

  it('carries the ticket in its title, which is how iphones.mjs finds it', () => {
    expect(workflow['run-name']).toContain('${{ inputs.ticket }}');
  });

  it('reads no secret, because the app it builds signs in to nothing', () => {
    expect(text).not.toMatch(/secrets\./);
    expect(job.steps.find((s) => s.name === 'Build the preview app').env.EXPO_PUBLIC_PREVIEW).toBe('1');
  });

  it('gives its address only as an artifact\'s name, and uploads nothing else', () => {
    const uploads = job.steps.filter((s) => String(s.uses ?? '').startsWith('actions/upload-artifact'));
    expect(uploads.map((s) => s.with.name)).toEqual(['iphone-at-${{ steps.open.outputs.name }}']);
  });

  it('starts the host this repository has, with the ticket, and every download ends', () => {
    const open = job.steps.find((s) => s.name === 'Open the iPhone to its tester').run;
    const script = open.match(/node (\S+iphone-host\.mjs)/)[1];
    expect(fs.existsSync(new URL(script, root))).toBe(true);
    expect(open).toContain('--ticket "$TICKET"');
    for (const line of text.split('\n').filter((l) => /\bcurl /.test(l))) expect(line).toMatch(/--max-time \d+/);
  });

  it('holds the iPhone only until it is let go, its host dies, or the hours are up', () => {
    const hold = job.steps.find((s) => s.name === 'Hold the iPhone until its tester is done').run;
    expect(hold).toMatch(/! -f "\$RUNNER_TEMP\/stop"/);
    expect(hold).toMatch(/kill -0 "\$HOST_PID"/);
    expect(hold).toMatch(/-lt "\$end"/);
  });
});

describe('the host checks a ticket before it starts', () => {
  it('refuses to listen with no proper ticket', async () => {
    const { spawnSync } = await import('node:child_process');
    const host = path.resolve('.claude/skills/product-loop/scripts/iphone-host.mjs');
    const r = spawnSync(process.execPath, [host, '--udid', 'X', '--bundle', 'Y', '--ticket', 'short'], { encoding: 'utf8', timeout: 20_000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/64-character --ticket/);
    expect(crypto.createHash('sha256').update('x').digest('hex')).toHaveLength(64);
  });
});

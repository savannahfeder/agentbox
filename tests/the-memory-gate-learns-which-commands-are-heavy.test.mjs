// THE MEMORY GATE LEARNS WHICH COMMANDS ARE HEAVY, FROM WHAT THEY DID — w-3958c3753d.
//
// WHY THERE IS NO LIST OF NAMES. The first proposal matched program names (npm,
// pytest, xcodebuild) and the founder turned it down: another package manager,
// a script run directly, a training job, and the list is wrong. So nothing here
// knows what any program is. It records what each command was measured to use
// on this Mac and decides from that.
//
// THE RULE THAT MATTERS MOST: missing evidence never makes a command light.
// A command seen once is unknown; a program seen light a few times is light
// only for arguments it has not been seen heavy with; one heavy run is enough to
// make that exact command heavy again. Measured on 2026-10-04 across 30 recent
// sessions, the median command ran 1.3 s, so most commands finish between two
// samples. A command that finished inside 2 s without being seen big counts as
// light, because a command that short cannot hold memory long enough to starve
// anything. A command sent to the background never counts as light that way,
// because its tool call returns at once while its process keeps running.

import { describe, it, expect } from 'vitest';
import { CommandHistory, commandSegments } from '../main/memory-gate-history.mjs';

const seen = (h, command, peakMb, times = 1, durationMs = 5_000) => {
  for (let i = 0; i < times; i++) h.record(command, { peakMb, durationMs });
};

describe('what a command is filed under', () => {
  it('the program and its first word that is not a flag', () => {
    expect(commandSegments('npm test').keys).toEqual(['npm test']);
    expect(commandSegments('npx vitest related --run a.mjs').keys).toEqual(['npx vitest']);
    expect(commandSegments('/usr/local/bin/python3 -u train.py --epochs 3').keys).toEqual(['python3 train.py']);
    expect(commandSegments('ls').keys).toEqual(['ls']);
  });

  it('each part of a chain or a pipe, and not the shell builtins between them', () => {
    expect(commandSegments('cd app && npm run build').keys).toEqual(['npm run']);
    expect(commandSegments('git log --oneline | head -5; echo done').keys).toEqual(['git log', 'head']);
    expect(commandSegments('FOO=1 BAR=2 node scripts/x.mjs').keys).toEqual(['node scripts/x.mjs']);
  });

  it('looks through time, nice, env, timeout and nohup to what they run', () => {
    expect(commandSegments('time npm test').keys).toEqual(['npm test']);
    expect(commandSegments('timeout 60 cargo build').keys).toEqual(['cargo build']);
    expect(commandSegments('nohup env FOO=1 python3 serve.py &').keys).toEqual(['python3 serve.py']);
  });

  it('keeps an operator inside quotes as part of the word', () => {
    expect(commandSegments(`rg "a && b" src`).keys).toEqual(['rg a && b']);
    expect(commandSegments(`echo 'x; npm test'`).keys).toEqual([]);
  });

  it('marks a command it cannot see into', () => {
    expect(commandSegments('echo $(npm test)').opaque).toBe(true);
    expect(commandSegments('echo `make`').opaque).toBe(true);
    expect(commandSegments(`echo '$(not run)'`).opaque).toBe(false);
  });
});

describe('deciding light, heavy or unknown', () => {
  it('a command never seen is unknown', () => {
    expect(new CommandHistory().classify('cargo build')).toBe('unknown');
  });

  it('seen light twice is light; seen light once is still unknown', () => {
    const h = new CommandHistory();
    seen(h, 'git status', 15);
    expect(h.classify('git status')).toBe('unknown');
    seen(h, 'git status', 15);
    expect(h.classify('git status')).toBe('light');
  });

  it('one heavy run makes it heavy, among many light ones', () => {
    const h = new CommandHistory();
    seen(h, 'npm test', 40, 4);
    seen(h, 'npm test', 900);
    expect(h.classify('npm test')).toBe('heavy');
  });

  it('between light and heavy is unknown', () => {
    const h = new CommandHistory();
    seen(h, 'node build.mjs', 250, 3);
    expect(h.classify('node build.mjs')).toBe('unknown');
  });

  it('a program always light lends that to arguments never seen', () => {
    const h = new CommandHistory();
    for (let i = 0; i < 5; i++) seen(h, `rg pattern${i} src`, 20);
    expect(h.classify('rg something-new src')).toBe('light');
  });

  it('but not a program that has ever been heavy', () => {
    const h = new CommandHistory();
    for (let i = 0; i < 6; i++) seen(h, `python3 tool${i}.py`, 20);
    seen(h, 'python3 train.py', 3_000);
    expect(h.classify('python3 brand-new.py')).toBe('unknown');
    expect(h.classify('python3 train.py')).toBe('heavy');
  });

  it('a chain is as heavy as its heaviest part', () => {
    const h = new CommandHistory();
    seen(h, 'git status', 15, 3);
    seen(h, 'npm test', 900);
    expect(h.classify('git status && npm test')).toBe('heavy');
    expect(h.classify('git status && cargo build')).toBe('unknown');
    expect(h.classify('cd x && git status')).toBe('light');
  });

  it('a command it cannot see into is never light', () => {
    const h = new CommandHistory();
    seen(h, 'echo', 1, 5);
    expect(h.classify('echo $(npm test)')).toBe('unknown');
  });

  it('only builtins is light: nothing starts', () => {
    expect(new CommandHistory().classify('cd /tmp && export X=1')).toBe('light');
  });

  it('a short run never seen big counts as light; a long one never seen counts for nothing', () => {
    const h = new CommandHistory();
    h.record('jq . a.json', { peakMb: null, durationMs: 400 });
    h.record('jq . a.json', { peakMb: null, durationMs: 900 });
    expect(h.classify('jq . a.json')).toBe('light');
    const g = new CommandHistory();
    g.record('make all', { peakMb: null, durationMs: 30_000 });
    g.record('make all', { peakMb: null, durationMs: 30_000 });
    expect(g.classify('make all')).toBe('unknown');
  });

  it('a command sent to the background never counts as light from being quick', () => {
    const h = new CommandHistory();
    h.record('npm run dev', { peakMb: null, durationMs: 50, background: true });
    h.record('npm run dev', { peakMb: null, durationMs: 50, background: true });
    expect(h.classify('npm run dev')).toBe('unknown');
  });

  it('survives being written out and read back', () => {
    const h = new CommandHistory();
    seen(h, 'npm test', 900);
    seen(h, 'git status', 15, 2);
    const back = CommandHistory.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
    expect(back.classify('npm test')).toBe('heavy');
    expect(back.classify('git status')).toBe('light');
    expect(CommandHistory.fromJSON(null).classify('git status')).toBe('unknown');
    expect(CommandHistory.fromJSON({ garbage: true }).classify('x')).toBe('unknown');
  });

  it('forgets the least recently seen commands past its size limit', () => {
    const h = new CommandHistory({ maxKeys: 3 });
    seen(h, 'a1 x', 900); seen(h, 'a2 x', 900); seen(h, 'a3 x', 900); seen(h, 'a4 x', 900);
    expect(h.classify('a1 x')).toBe('unknown');
    expect(h.classify('a4 x')).toBe('heavy');
  });
});

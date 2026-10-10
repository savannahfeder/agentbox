// DELETED CHARACTERS LEAVE THE TERMINAL AT ONCE (w-16e47d0836, 2026-10-07).
//
// Her words: "When I try to use the bulk delete option, the characters are
// still visible for a second or two before they actually disappear. It should
// be immediate."
//
// The shell's echo of a delete only reached the screen when the panel next
// asked for output, and it asked every 150ms, one key's write at a time ahead
// of it. Measured in the real built screen against a real zsh
// (scripts/scratch/time-terminal-delete.mjs): Option+Delete took 49 to 193ms
// to clear on an idle machine and up to 279ms with the main process busy a
// quarter of the time, every key held behind its own round trip.
//
// Now the panel's read WAITS in main for the shell's next output and comes back
// the moment there is some, and keys typed while one write is on its way go out
// together as the next write. These pin both halves.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { TaskTerminals } from '../main/task-terminals.mjs';
import { inputQueue } from '../shared/terminal-input.mjs';

function fixture() {
  let emit = () => {}, exit = () => {};
  const child = {
    pid: 1, process: 'zsh', write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    onData: (f) => { emit = f; }, onExit: (f) => { exit = f; },
  };
  const manager = new TaskTerminals({ spawn: () => child, resolve: () => '/tmp', disposeProcess: (p) => p.kill(), sweepMs: 0 });
  const first = manager.open('k');
  return { manager, child, offset: first.offset, emit: (d) => emit(d), exit: (c) => exit({ exitCode: c }) };
}
const settled = async (p) => { let done = false; p.then(() => { done = true; }, () => { done = true; }); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); return done; };

describe('a read that may wait', () => {
  it('comes back the moment the shell prints, not at the next poll', async () => {
    const f = fixture();
    const read = f.manager.read('k', f.offset, 1000);
    expect(await settled(read)).toBe(false);
    f.emit('\b \b');
    const state = await read;
    expect(state.data).toBe('\b \b');
    expect(state.live).toBe(true);
    f.manager.dispose();
  });

  it('does not wait when output is already there', async () => {
    const f = fixture();
    f.emit('$ echo one');
    const state = await f.manager.read('k', f.offset, 1000);
    expect(state.data).toBe('$ echo one');
  });

  it('gives up after the wait with nothing, so the panel still hears about the shell', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      const read = f.manager.read('k', f.offset, 1000);
      vi.advanceTimersByTime(999);
      expect(await Promise.race([read, Promise.resolve('pending')])).toBe('pending');
      vi.advanceTimersByTime(1);
      const state = await read;
      expect(state.data).toBe('');
      expect(state.live).toBe(true);
      f.manager.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('comes back when the shell exits', async () => {
    const f = fixture();
    const read = f.manager.read('k', f.offset, 1000);
    f.exit(0);
    expect((await read).exited).toBe(true);
  });

  it('fails when the shell is ended under it, rather than reading a newer one', async () => {
    const f = fixture();
    const read = f.manager.read('k', f.offset, 1000);
    f.manager.close('k');
    await expect(read).rejects.toThrow(/ended/);
  });

  it('is the old immediate answer when no wait is asked for', () => {
    // agent-updates and every older caller read this way, and get a value, not a promise.
    const f = fixture();
    const state = f.manager.read('k', f.offset);
    expect(state.data).toBe('');
    expect(state.live).toBeUndefined();
  });
});

describe('keys typed while a write is on its way', () => {
  it('go out together, in order, as the next write', async () => {
    const sent = [];
    let release;
    const send = (d) => { sent.push(d); return new Promise((r) => { release = r; }); };
    const q = inputQueue(send);
    q.push('a');
    expect(sent).toEqual(['a']);
    q.push('\x7f'); q.push('\x7f'); q.push('\x1b\x7f');
    expect(sent).toEqual(['a']);
    release(); await new Promise((r) => setImmediate(r));
    expect(sent).toEqual(['a', '\x7f\x7f\x1b\x7f']);
    release(); await new Promise((r) => setImmediate(r));
    expect(sent.length).toBe(2);
  });

  it('a paste over the limit is still split into pieces main accepts', async () => {
    const sent = [];
    const q = inputQueue(async (d) => { sent.push(d.length); }, { chunk: 4 });
    q.push('abcdefghij');
    await new Promise((r) => setImmediate(r));
    expect(sent).toEqual([4, 4, 2]);
  });

  it('a failed write is reported and drops what was waiting behind it', async () => {
    const onError = vi.fn();
    let calls = 0;
    const q = inputQueue(async () => { calls++; throw Error('This shell has exited.'); }, { onError });
    q.push('a'); q.push('b');
    await new Promise((r) => setImmediate(r));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
  });
});

describe('the panel', () => {
  const source = fs.readFileSync('renderer/src/components/TaskTerminal.tsx', 'utf8');
  it('asks main to wait for output, and types through the queue', () => {
    expect(source).toMatch(/action:'read',offset,wait:/);
    expect(source).toContain('inputQueue(');
  });
  it('keeps the 150ms poll for a main that cannot wait yet (a renderer reloaded ahead of a restart)', () => {
    expect(source).toMatch(/state\.live\?0:150/);
  });
  it('main passes the wait through for both kinds of terminal', () => {
    expect(fs.readFileSync('main/ipc.mjs', 'utf8')).toMatch(/terminals\.read\(key,offset,wait\)/);
    expect(fs.readFileSync('main/agent-updates.mjs', 'utf8')).toMatch(/terminals\.read\(engine,p\.offset,p\.wait\)/);
  });
});

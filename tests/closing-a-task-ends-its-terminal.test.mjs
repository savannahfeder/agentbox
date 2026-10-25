// CLOSING A TASK ENDS ITS TERMINAL (w-7b5b89d886).
//
// What broke: nothing tied a terminal to its task. A shell running something
// was never ended by the app (main/task-terminals.mjs only ends idle ones), so
// a closed task's dev server ran until the app quit, and the app quitting was
// also the only thing that ended the servers people still needed. The rule
// asked for is one a person can predict: a terminal lives while its task is
// open, and goes when the task is closed.
//
// Measured with an injected clock: the terminal of a task the store reports as
// done is ended on the first look at least two minutes after the close, so a Z
// pressed in the reflex window (renderer/src/undo-window.ts, 30 s) keeps it.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TaskTerminals, ENDED } from '../main/task-terminals.mjs';
import { TerminalHosts, closedTerminals, taskClosed, CLOSE_GRACE_MS } from '../main/terminal-hosts.mjs';
import { serveTerminals, terminalHostSocket } from '../main/terminal-host.mjs';
import { SETTINGS_TERMINAL } from '../shared/settings-terminal.mjs';

const MIN = 60_000;
const key = (id, product = 'p') => JSON.stringify({ product, id });

describe('which terminals are due to end', () => {
  const list = (...keys) => keys.map((k) => ({ key: k }));

  it('a closed task\'s terminal goes once it has been closed for two minutes, not at one', () => {
    const seen = new Map();
    const closed = () => true;
    expect(closedTerminals(list('a'), closed, seen, 0)).toEqual([]);
    expect(closedTerminals(list('a'), closed, seen, MIN)).toEqual([]);
    expect(closedTerminals(list('a'), closed, seen, 2 * MIN - 1)).toEqual([]);
    expect(closedTerminals(list('a'), closed, seen, 2 * MIN)).toEqual(['a']);
    expect(CLOSE_GRACE_MS).toBe(2 * MIN);
  });

  it('an open task\'s terminal never goes, however long it runs', () => {
    const seen = new Map();
    for (let t = 0; t < 3 * 24 * 60; t += 60) expect(closedTerminals(list('a'), () => false, seen, t * MIN)).toEqual([]);
  });

  it('a task reopened inside the two minutes keeps its terminal, and closing it again starts the wait over', () => {
    const seen = new Map();
    let closed = true;
    closedTerminals(list('a'), () => closed, seen, 0);
    closed = false;
    expect(closedTerminals(list('a'), () => closed, seen, MIN)).toEqual([]);
    closed = true;
    expect(closedTerminals(list('a'), () => closed, seen, 2 * MIN)).toEqual([]);
    expect(closedTerminals(list('a'), () => closed, seen, 4 * MIN)).toEqual(['a']);
  });

  it('a store that throws reads as open', () => {
    expect(closedTerminals(list('a'), () => { throw new Error('busy'); }, new Map(), 10 * MIN)).toEqual([]);
  });
});

describe('what counts as closed', () => {
  const store = { readItem: (product, id) => ({ done: { status: 'done' }, open: { status: 'open' }, blocked: { status: 'blocked' } })[id] ?? null };
  const closed = taskClosed(store);

  it('only a task the store says is done', () => {
    expect(closed(key('done'))).toBe(true);
    expect(closed(key('open'))).toBe(false);
    expect(closed(key('blocked'))).toBe(false);
  });

  it('not a task the store cannot find, which may be another store\'s', () => {
    expect(closed(key('missing'))).toBe(false);
  });

  it('never the sign-in terminal or an outside agent\'s', () => {
    expect(closed(JSON.stringify(SETTINGS_TERMINAL))).toBe(false);
    expect(closed(key('agent:4242'))).toBe(false);
  });
});

describe('the app ending a closed task\'s terminal', () => {
  it('ends it, and opening the task\'s terminal again shows why above what it last said', async () => {
    const dir = fs.mkdtempSync(path.join(fs.existsSync('/tmp') ? '/tmp' : '.', 'th-'));
    let onData = () => {};
    const child = { pid: 7001, process: 'node', write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: (f) => { onData = f; }, onExit: () => {} };
    const terminals = new TaskTerminals({ spawn: vi.fn(() => child), disposeProcess: (p) => p.kill(), sweepMs: 0 });
    const served = serveTerminals({ sockPath: terminalHostSocket({ stamp: 'now', dir }), terminals });
    let t = 0;
    const app = new TerminalHosts({ local: new TaskTerminals({ sweepMs: 0 }), stamp: 'now', dir, launch: () => {}, now: () => t });
    try {
      await app.open(key('w-a'), { cwd: '/tmp' });
      onData('Metro waiting on exp://192.168.68.51:8081\r\n');
      let status = 'done';
      const isClosed = () => status === 'done';
      expect(await app.endClosed(isClosed)).toEqual([]);
      t += MIN;
      expect(await app.endClosed(isClosed)).toEqual([]);
      expect(child.kill).not.toHaveBeenCalled();
      t += MIN;
      expect(await app.endClosed(isClosed)).toEqual([key('w-a')]);
      expect(child.kill).toHaveBeenCalled();

      status = 'open';
      const again = await app.open(key('w-a'), { cwd: '/tmp' });
      expect(again.data).toContain('Metro waiting on exp://192.168.68.51:8081');
      expect(again.data).toContain(ENDED.closed);
    } finally {
      for (const c of app.conns.values()) c.close();
      await served.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Launch QA, 2026-10-06: 37 unhandled EMFILE watcher errors accompanied
// 1,222 passing assertions. fs.watch can fail asynchronously after returning;
// the try/catch around its creation cannot catch an emitted error.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../main/store.mts';

afterEach(() => vi.restoreAllMocks());

describe('a directory watcher can fail without taking the inbox down', () => {
  it('closes and releases the failed watcher while keeping healthy watchers', () => {
    const watchers = [];
    vi.spyOn(fs, 'watch').mockImplementation(() => {
      const watcher = Object.assign(new EventEmitter(), { close: vi.fn() });
      watchers.push(watcher);
      return watcher;
    });
    const store = new Store({ accountRoot: '/test-account' });
    vi.spyOn(store, 'listProducts').mockReturnValue([{ dir: '/test-account/shop' }]);
    store.watch();
    const error = Object.assign(new Error('too many open files'), { code: 'EMFILE' });
    expect(() => watchers[0].emit('error', error)).not.toThrow();
    expect(watchers[0].close).toHaveBeenCalledOnce();
    expect(store.watchers).toEqual([watchers[1]]);
    store.unwatch();
    expect(watchers[1].close).toHaveBeenCalledOnce();
  });

  it('still notifies for ordinary ledger changes', () => {
    let changed;
    vi.spyOn(fs, 'watch').mockImplementation((_dir, callback) => {
      changed = callback;
      return Object.assign(new EventEmitter(), { close() {} });
    });
    const store = new Store({ accountRoot: '/test-account' });
    vi.spyOn(store, 'listProducts').mockReturnValue([]);
    const notify = vi.spyOn(store, '_notify').mockImplementation(() => {});
    store.watch();
    changed('change', 'work-items.jsonl');
    changed('change', 'unrelated.txt');
    expect(notify).toHaveBeenCalledOnce();
    store.unwatch();
  });
});

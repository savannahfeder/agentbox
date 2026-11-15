// 2026-09-16: the slash catalog was fetched once per mounted task. A skill
// discovered by the next Claude session stayed invisible in that same composer.
// Measure fresh results, removal, failures, and late responses after navigation.
import { afterEach, expect, it, vi } from 'vitest';
import { watchCommandCatalog } from '../renderer/src/command-catalog.ts';
afterEach(() => vi.useRealTimers());
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
it('refreshes added and removed native commands without reopening the task', async () => {
 vi.useFakeTimers();
 const load = vi.fn().mockResolvedValueOnce(['old']).mockResolvedValueOnce(['old','plugin:check']).mockResolvedValueOnce([]);
 const publish = vi.fn();
 const stop = watchCommandCatalog(load, publish);
 await flush(); expect(publish).toHaveBeenLastCalledWith(['old']);
 await vi.advanceTimersByTimeAsync(1000); expect(publish).toHaveBeenLastCalledWith(['old','plugin:check']);
 await vi.advanceTimersByTimeAsync(1000); expect(publish).toHaveBeenLastCalledWith([]);
 stop();
});
it('does not let an old task response populate another task or overlap requests', async () => {
 vi.useFakeTimers(); let resolve;
 const load = vi.fn(() => new Promise(r => { resolve = r; }));
 const publish = vi.fn(); const stop = watchCommandCatalog(load,publish);
 await vi.advanceTimersByTimeAsync(5000); expect(load).toHaveBeenCalledTimes(1);
 stop(); resolve(['old-task-secret']); await flush();
 expect(publish).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(5000); expect(load).toHaveBeenCalledTimes(1);
});
it('retains the current list after an IPC failure and retries, without publishing unchanged data', async () => {
 vi.useFakeTimers();
 const load = vi.fn().mockResolvedValueOnce(['skill']).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(['skill']);
 const publish = vi.fn(); const stop = watchCommandCatalog(load,publish);
 await flush(); await vi.advanceTimersByTimeAsync(2000);
 expect(load).toHaveBeenCalledTimes(3); expect(publish).toHaveBeenCalledTimes(1);
 stop();
});

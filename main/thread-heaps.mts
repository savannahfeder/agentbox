// The main thread's heap is all `v8.getHeapStatistics()` reads; each worker
// thread has a heap of its own that only the worker object can measure
// (tests/the-memory-log-names-each-background-threads-heap).

type HeapReading = { used_heap_size: number };
export type MeasurableThread = {
  getHeapStatistics?: () => Promise<HeapReading>;
  once?: (event: 'exit', listener: () => void) => unknown;
};

const threads = new Map<string, MeasurableThread>();
const mb = (bytes: number) => Math.round(bytes / 1048576);

/** Note a worker under `name` until it exits. Returns a function that forgets it. */
export function noteThread(name: string, thread: MeasurableThread): () => void {
  let key = name;
  for (let n = 2; threads.has(key); n++) key = `${name} ${n}`;
  threads.set(key, thread);
  const forget = () => { if (threads.get(key) === thread) threads.delete(key); };
  thread.once?.('exit', forget);
  return forget;
}

/** Each noted thread's heap in MB. A thread that cannot answer within the deadline is left out. */
export async function threadHeaps({ deadlineMs = 2000 }: { deadlineMs?: number } = {}): Promise<Record<string, number>> {
  const read = async ([key, thread]: [string, MeasurableThread]): Promise<[string, number] | null> => {
    if (typeof thread.getHeapStatistics !== 'function') return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), deadlineMs); });
    try {
      const stats = await Promise.race([thread.getHeapStatistics(), late]);
      return stats ? [key, mb(stats.used_heap_size)] : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const readings = await Promise.all([...threads].map(read));
  return Object.fromEntries(readings.filter((r): r is [string, number] => r !== null));
}

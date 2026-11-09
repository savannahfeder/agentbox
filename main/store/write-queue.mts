// Per-key async serialization: catalog mutations and record appends for one
// project run one at a time, so concurrent chats can never interleave a
// read-modify-write. File edits are deliberately NOT queued (spec: LWW + git).
export interface WriteQueue { run<T>(key: string, fn: () => T | Promise<T>): Promise<T> }

export function makeWriteQueue(): WriteQueue {
  const tails = new Map<string, Promise<unknown>>(); // key -> promise tail
  return {
    run<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev.then(fn, fn); // run regardless of prior outcome
      tails.set(key, next.catch(() => {})); // a throw never poisons the chain
      return next;
    },
  };
}

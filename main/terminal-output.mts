// THE APP NEVER WAITS ON THE TERMINAL IT WAS OPENED FROM.
//
// Node writes to a terminal synchronously, so a Terminal window that falls
// behind holds the whole main process inside console.log, for up to a minute
// at a time. A terminal's output is made non-blocking instead, and past
// DROP_PAST_BYTES waiting, lines are dropped rather than held without end.
// Files and pipes are left alone: they do not wait on a window.

export const DROP_PAST_BYTES = 4 * 1024 * 1024;

interface TerminalStream {
  isTTY?: boolean;
  writableLength?: number;
  _handle?: { setBlocking?: (blocking: boolean) => unknown } | null;
  write: (chunk: unknown, ...rest: unknown[]) => boolean;
}

export function letTheTerminalFallBehind(given: object | null | undefined): boolean {
  const stream = given as TerminalStream | null | undefined;
  if (!stream?.isTTY || typeof stream._handle?.setBlocking !== 'function') return false;
  stream._handle.setBlocking(false);
  const write = stream.write.bind(stream);
  stream.write = (chunk: unknown, ...rest: unknown[]) => {
    if ((stream.writableLength ?? 0) > DROP_PAST_BYTES) {
      const done = rest.find((r) => typeof r === 'function') as (() => void) | undefined;
      if (done) queueMicrotask(done);
      return true;
    }
    return write(chunk, ...rest);
  };
  return true;
}

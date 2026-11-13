// Runs a step that can fail for reasons outside this Mac (Apple's servers
// dropping a connection) up to `tries` times, pausing between attempts.
const block = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function tryAgain(step, { tries = 3, pauseMs = 30_000, sleep = block } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    if (step(attempt)) return true;
    if (attempt < tries) sleep(pauseMs);
  }
  return false;
}

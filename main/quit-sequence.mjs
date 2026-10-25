// THE WAY OUT, AND NOTHING ON IT MAY KILL THE APP (w-60c8ddbab6, 2026-10-15).
//
// Quitting used to be six bare `app.on('before-quit', ...)` listeners and one
// `will-quit` that started the analytics flush and did not wait for it. Both
// halves of that cost us the end of every session.
//
// ONE STEP THAT THROWS ENDED THE WHOLE QUIT. On 0.1.13 the phone step did:
// closing the main window nulls `window`, and `phone.close()` makes the relay
// report the change back to a handler that asked the window whether it was
// destroyed (main/main.mjs, the `zero:phone-changed` line). An EventEmitter
// stops calling listeners at the first one that throws, `main/crash-report.mjs`
// rethrows an uncaught main error on purpose, and the process then dies
// fatally. Measured on an Electron harness: `updater.stop()` never ran,
// `will-quit` never fired, `analytics.flush()` never ran, and `quit` never
// came. The window's own guard is fixed where it lives, but the shape was the
// real fault: a quit built so that any one step can swallow the rest is a quit
// that will do this again for some other reason.
//
// AND THE FLUSH WAS FIRE AND FORGET. `will-quit` without `preventDefault` means
// the process goes as soon as the listeners return, so a batch handed to
// `posthog-node` a moment earlier is a POST that never leaves. Measured the
// same way: the flush resolved AFTER `process.on('exit')` had already run, and
// it only resolved at all because the harness's destination was in the same
// process. Against us.i.posthog.com it is a race the app loses.
//
// WHICH MATTERS BECAUSE THE END OF A SESSION IS WHAT WE READ RETENTION FROM.
// Of the fourteen installs that arrived on 0.1.13 or 0.1.14, thirteen opened
// the app once and never opened it again (PostHog, 2026-10-15), so for thirteen
// of fourteen people the batch dropped here is the LAST thing we would ever
// have heard, and the crash report explaining it is still sitting on their disk
// waiting for a launch that is not coming.

/** How long the quit is held open for the last batch of counts, and no longer. */
export const FLUSH_DEADLINE_MS = 2000;

/**
 * How long a quit we asked for is given before the process is ended outright.
 *  Longer than the flush above on purpose: a quit holding itself open for the
 *  last counts is a quit that is working. */
export const EXIT_DEADLINE_MS = 8000;

/**
 * How long the second ask gets, once the counts are out and there is nothing
 *  left to wait for. On Linux a quit asked for with a window still open — the
 *  menu's Quit, the tray's Quit — ignores it outright
 *  (tests/a-quit-held-for-the-last-counts-still-ends-the-app), and by then the
 *  window is gone and there is nothing left to show anybody. */
export const SECOND_QUIT_DEADLINE_MS = 2000;

/**
 * A STEP ON THE WAY OUT, which runs once and cannot throw.
 *
 *  `name` is in the warning rather than in a comment, because the one thing
 *  somebody reading a log needs to know is which step gave up. A swallow with
 *  nothing said is how this bug lived through three releases.
 *
 *  ONCE, not once per `app.quit()`. Holding the quit for the flush below means
 *  calling `app.quit()` a second time, which emits `before-quit` again, and a
 *  `killAll` or a `close` run twice is at best wasted and at worst a second
 *  teardown of something already gone.
 */
export function quitStep(app, event, name, fn, { log = console } = {}) {
  let ran = false;
  app.on(event, () => {
    if (ran) return;
    ran = true;
    try {
      fn();
    } catch (err) {
      // Never rethrown: the app is on its way out and every step after this one
      // still has to happen.
      log?.warn?.(`zero: ${name} failed while quitting: ${err?.message ?? err}`);
    }
  });
}

/**
 * HOLD THE QUIT OPEN FOR THE LAST BATCH OF COUNTS.
 *
 *  Three things it will not do, each of them a way a quit becomes a hang:
 *
 *   - It will not wait past `FLUSH_DEADLINE_MS`. A machine with no network, or
 *     a destination that accepts the connection and never answers, must cost
 *     somebody two seconds on the way out and not their afternoon.
 *   - It will not care whether the flush worked. There is nothing to be done
 *     about a flush that failed, and a count is never worth a quit.
 *   - It will not hold twice. `will-quit` comes round again when we ask again,
 *     and holding that one too is a quit that never happens.
 *   - It will not trust the second ask either. On Linux, a quit that began with
 *     a window open ignores it and the process stays for ever, which is what
 *     `quitThenExit` is for
 *     (tests/a-quit-held-for-the-last-counts-still-ends-the-app).
 */
export function flushBeforeQuit(app, flush, { deadlineMs = FLUSH_DEADLINE_MS, log = console } = {}) {
  let held = false;
  app.on('will-quit', (event) => {
    if (held) return;          // the second time round is the one we asked for
    held = true;
    event?.preventDefault?.();
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      quitThenExit(app, { what: 'the last counts', deadlineMs: SECOND_QUIT_DEADLINE_MS, log });
    };
    const timer = setTimeout(go, deadlineMs);
    // The deadline is armed before the flush is even called, so a `flush` that
    // throws synchronously is covered by the same promise as one that rejects.
    Promise.resolve()
      .then(() => flush())
      .catch((err) => { log?.warn?.(`zero: the last counts did not get out: ${err?.message ?? err}`); })
      .then(go, go);
  });
}

/**
 * ASK TO QUIT, AND GO ANYWAY IF THE QUIT DOES NOT COME.
 *
 *  `app.quit()` only asks, and on Linux an app that has already refused one
 *  `will-quit` ignores every ask after it: the measurement is in
 *  tests/a-quit-held-for-the-last-counts-still-ends-the-app. It is still asked,
 *  because that is what runs the quit steps, lets the workers go and fires
 *  `quit` for whoever is listening, and the deadline ends the process when the
 *  quit has not.
 *
 *  Both callers pass a deadline that suits what they are waiting for: a
 *  screenshot run has a whole quit ahead of it, the flush above has nothing
 *  left but the `quit` event. The timer is unreffed: an app with nothing left
 *  to do must not be kept alive by the thing watching it. */
export function quitThenExit(app, { what = 'this run', deadlineMs = EXIT_DEADLINE_MS, log = console } = {}) {
  let over = false;
  const timer = setTimeout(() => {
    if (over) return;
    over = true;
    log?.warn?.(`zero: ${what} asked the app to quit ${deadlineMs} ms ago and it is still here, so it is ending now`);
    app.exit(0);
  }, deadlineMs);
  timer.unref?.();
  app.once?.('quit', () => { over = true; clearTimeout(timer); });
  app.quit();
  return timer;
}

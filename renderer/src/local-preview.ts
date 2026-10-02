import { useCallback, useEffect, useRef, useState } from 'react';
import { isLocalPreview } from './artifact-layout';
// A LOCAL ADDRESS IS CHECKED BEFORE IT IS TRUSTED. An iframe's load event fires
// for Chromium's own error page as readily as for the app, so a pane pointed at
// a port nothing listens on used to "load" an empty page and sit there. One
// no-cors request settles it: a refused connection rejects at once, anything
// that answers resolves, even with a body we may not read.
// tests/a-local-app-that-is-not-running-says-so.test.mjs

export type LocalPreviewPhase = 'checking' | 'up' | 'slow' | 'down';

/** Silent for this long, so a fast app only ever shows the skeleton. */
export const WORDS_AFTER_MS = 1000;
/** Past this, the wait is long enough that she should be told it is a wait. */
export const SLOW_AFTER_MS = 8000;
/** One check gives up after this and calls the address slow rather than down. */
export const PROBE_TIMEOUT_MS = 4000;
/** How often a down or slow address is asked again. */
export const RECHECK_MS = 2000;

type FetchLike = (url: string, init: RequestInit) => Promise<unknown>;

export async function probeLocalPreview(url: string, fetchFn: FetchLike = fetch, timeoutMs = PROBE_TIMEOUT_MS): Promise<Exclude<LocalPreviewPhase, 'checking'>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    await fetchFn(url, { mode: 'no-cors', cache: 'no-store', signal: abort.signal });
    return 'up';
  } catch {
    return abort.signal.aborted ? 'slow' : 'down';
  } finally {
    clearTimeout(timer);
  }
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export type LocalStatus = {
  state: 'connecting' | 'slow' | 'down';
  /** The short status, drawn in the chrome's spaced capitals. */
  label: string;
  host: string;
  detail: string;
  retry: boolean;
  /** How long it has waited, m:ss, because not knowing that is what cost her. */
  clock: string;
};

function clockOf(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What the pane says about a local address, or null while it stays quiet. */
export function previewStatus(phase: LocalPreviewPhase, url: string, waitedMs: number): LocalStatus | null {
  const host = hostOf(url);
  const clock = clockOf(waitedMs);
  if (phase === 'down') {
    return { state: 'down', label: 'Not running', host, detail: 'Nothing is answering here. It opens by itself once the app starts.', retry: true, clock };
  }
  if (waitedMs >= SLOW_AFTER_MS) {
    return { state: 'slow', label: 'Still connecting', host, detail: 'It is slow to answer. This keeps trying.', retry: true, clock };
  }
  if (waitedMs >= WORDS_AFTER_MS) return { state: 'connecting', label: 'Connecting', host, detail: 'Waiting for the app to answer.', retry: false, clock };
  return null;
}

/** The frame is shown only once it has loaded AND the address has answered. */
export function previewShows(frameReady: boolean, phase: LocalPreviewPhase): boolean {
  return frameReady && (phase === 'up' || phase === 'slow');
}

/**
 * The live state of a local address in the pane. `attempt` changes whenever
 * the frame should start over (Try again, or an app that has just come up), so
 * it goes in the frame's key. `round` only restarts the checking, on Try again.
 */
export function useLocalPreview(url: string | null) {
  const local = url !== null && isLocalPreview(url);
  const [phase, setPhase] = useState<LocalPreviewPhase>('checking');
  const [attempt, setAttempt] = useState(0);
  const [round, setRound] = useState(0);
  const [waited, setWaited] = useState(0);
  const phaseRef = useRef<LocalPreviewPhase>('checking');

  useEffect(() => {
    if (!local || !url) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let clock: ReturnType<typeof setTimeout> | undefined;
    // The clock only runs until the words stop changing, so an open pane is
    // not redrawn twice a second for as long as it stays open.
    const startClock = () => {
      clearTimeout(clock);
      const started = Date.now();
      setWaited(0);
      const tick = () => {
        const waited = Date.now() - started;
        setWaited(waited);
        if (live && waited < SLOW_AFTER_MS) clock = setTimeout(tick, 500);
      };
      clock = setTimeout(tick, 500);
    };
    phaseRef.current = 'checking';
    setPhase('checking');
    startClock();
    const check = async () => {
      const next = await probeLocalPreview(url);
      if (!live) return;
      // An app that has just started gets a fresh frame, because the one
      // mounted while it was down holds an error page, and a fresh wait, so
      // it is not called slow for the time it spent not running.
      if (phaseRef.current === 'down' && next !== 'down') { setAttempt((n) => n + 1); startClock(); }
      phaseRef.current = next;
      setPhase(next);
      if (next !== 'up') timer = setTimeout(check, RECHECK_MS);
    };
    check();
    return () => { live = false; clearTimeout(timer); clearTimeout(clock); };
  }, [local, url, round]);

  const retry = useCallback(() => {
    phaseRef.current = 'checking';
    setPhase('checking');
    setAttempt((n) => n + 1);
    setRound((n) => n + 1);
  }, []);

  return { local, phase, attempt, waited, retry };
}

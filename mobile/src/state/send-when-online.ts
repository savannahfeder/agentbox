import { useEffect, useRef } from 'react';
import { dueAgain, failedSend, type Waiting } from '../lib/offline';
import { useCloud } from './cloud';

/**
 * A send that failed for want of internet goes again after the inbox's next
 * good read. `retry` is called then; `failed` returns what the box says.
 */
export function useSendWhenOnline(retry: () => void) {
  const { onlineAt } = useCloud();
  const waiting = useRef<Waiting>(null);
  const again = useRef(retry);
  again.current = retry;
  useEffect(() => {
    const w = waiting.current;
    if (!w || !dueAgain(w, onlineAt)) return;
    // Not due again until this try has answered.
    waiting.current = { ...w, since: Number.POSITIVE_INFINITY };
    again.current();
  }, [onlineAt]);
  return {
    failed: (message: string) => {
      const r = failedSend(waiting.current && { ...waiting.current }, message, Date.now());
      waiting.current = r.waiting;
      return r.say;
    },
    /** Sent, emptied, or pressed again by hand: nothing waits any more. */
    clear: () => { waiting.current = null; },
  };
}

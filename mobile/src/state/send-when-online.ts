import { useEffect, useRef, useState } from 'react';
import { carriedSends } from '../lib/carried-sends';
import { dueAgain, failedSend, type Waiting } from '../lib/offline';
import { useCloud } from './cloud';

type Cloud = ReturnType<typeof useCloud>;
const carried = carriedSends<Cloud>();

/** Sends whose page closed while they waited go on the inbox's next good read. Mounted once, under the cloud. */
export function CarriedSends() {
  const c = useCloud();
  const now = useRef(c);
  now.current = c;
  useEffect(() => { if (c.onlineAt) void carried.goAgain(now.current, c.onlineAt); }, [c.onlineAt]);
  return null;
}

/**
 * A send that failed for want of internet goes again after the inbox's next
 * good read. `retry` is called then; `failed` returns what the box says.
 * With `carry`, a page that closes while its send waits hands it on: `carry.send`
 * is asked then for a send that needs nothing of the page. `said` is what the
 * box says on opening, when its send was still waiting or gave up while it was shut.
 */
export function useSendWhenOnline(retry: () => void, carry?: { key: string; send: () => (c: Cloud) => Promise<void> }) {
  const { onlineAt } = useCloud();
  const [back] = useState(() => (carry ? carried.takeBack(carry.key) : { waiting: null, say: null }));
  const waiting = useRef<Waiting>(back.waiting);
  const lastSaid = useRef(back.say ?? '');
  const again = useRef(retry);
  again.current = retry;
  const carryNow = useRef(carry);
  carryNow.current = carry;
  useEffect(() => {
    const w = waiting.current;
    if (!w || !dueAgain(w, onlineAt)) return;
    // Not due again until this try has answered.
    waiting.current = { ...w, since: Number.POSITIVE_INFINITY };
    again.current();
  }, [onlineAt]);
  useEffect(() => () => {
    const w = waiting.current;
    const how = carryNow.current;
    if (how && w && w.since !== Number.POSITIVE_INFINITY) carried.carry(how.key, w, lastSaid.current, how.send());
  }, []);
  return {
    said: back.say,
    failed: (message: string) => {
      const r = failedSend(waiting.current && { ...waiting.current }, message, Date.now());
      waiting.current = r.waiting;
      lastSaid.current = r.say;
      return r.say;
    },
    /** Sent, emptied, or pressed again by hand: nothing waits any more. */
    clear: () => { waiting.current = null; },
  };
}

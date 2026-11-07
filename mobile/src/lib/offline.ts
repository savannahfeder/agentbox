// A SEND THAT NEVER REACHED THE INTERNET: said in plain words, and sent again
// on its own once the inbox reads again, while its page is open, a few times at most.

// Only failures where the request never left the phone, so a second try cannot
// send it twice. A timeout is left out for that reason.
const NO_NETWORK = [
  /UnknownHostException|Unable to resolve host/i,
  /ConnectException|ENOTFOUND|ENETUNREACH|EAI_AGAIN|ECONNREFUSED/,
  /Network request failed|Failed to fetch|^(TypeError: )?Load failed$|fetch failed/i,
  /Internet connection appears to be offline|not connected to the internet/i,
];
export const cantReach = (message: string) => NO_NETWORK.some((re) => re.test(message));

export const OFFLINE_TRIES = 5;
export type Waiting = { since: number; tries: number } | null;

export function failedSend(waiting: Waiting, message: string, now: number): { say: string; waiting: Waiting } {
  if (!cantReach(message)) return { say: `Not sent: ${message}`, waiting: null };
  const tries = (waiting?.tries ?? 0) + 1;
  if (tries >= OFFLINE_TRIES) return { say: 'Not sent. You’re offline. Send it again once you’re back online.', waiting: null };
  return { say: 'Offline. Keep this open and it sends when you’re back.', waiting: { since: now, tries } };
}

/** `onlineAt` is when the inbox last read without error, 0 while it cannot. */
export const dueAgain = (waiting: Waiting, onlineAt: number) => !!waiting && onlineAt > waiting.since;

// PURE. HOW A BROWSER TAB SPENDS ITS SIX CONNECTIONS TO THE APP.
//
// Background reads go through a small lane with room left beside it, so a press
// always has a connection. Asked twice while waiting they are sent once, and the
// newest goes first, because that is the one on screen. A read already on the
// wire is never shared with a later caller: a read asked after a press has to
// see that press.

export const LANE_ON_THE_WIRE = 3;

// Asking any of these twice is the same as asking once.
export const BACKGROUND_CHANNELS: ReadonlySet<string> = new Set([
  'zero:snapshot',
  'zero:agent-update',
  'zero:badge',
  'zero:corner-tag',
  'zero:files-place',
  'zero:files-place-open',
  'zero:read-doc',
  'zero:resolve-doc',
  'zero:team-thread-work',
  'zero:item-history',
]);

// Nothing is read back from these, so only the last one matters.
const LAST_ONE_WINS: ReadonlySet<string> = new Set(['zero:badge', 'zero:corner-tag']);

type Send<T> = (channel: string, body: string) => Promise<T>;
type Waiting<T> = {
  channel: string;
  body: string;
  key: string;
  takers: { resolve: (v: T) => void; reject: (e: unknown) => void }[];
};

export function callLane<T = unknown>(send: Send<T>) {
  const waiting: Waiting<T>[] = [];
  const onTheWire = new Set<string>();

  const next = () => {
    while (onTheWire.size < LANE_ON_THE_WIRE) {
      const at = waiting.findLastIndex((w) => !onTheWire.has(w.key));
      if (at < 0) return;
      const [call] = waiting.splice(at, 1);
      onTheWire.add(call.key);
      send(call.channel, call.body).then(
        (value) => { for (const t of call.takers) t.resolve(value); },
        (err) => { for (const t of call.takers) t.reject(err); },
      ).finally(() => { onTheWire.delete(call.key); next(); });
    }
  };

  return (channel: string, body: string): Promise<T> => {
    if (!BACKGROUND_CHANNELS.has(channel)) return send(channel, body);
    return new Promise<T>((resolve, reject) => {
      const key = LAST_ONE_WINS.has(channel) ? channel : `${channel}\0${body}`;
      const same = waiting.find((w) => w.key === key);
      if (same) {
        same.body = body;
        same.takers.push({ resolve, reject });
        return;
      }
      waiting.push({ channel, body, key, takers: [{ resolve, reject }] });
      next();
    });
  };
}

// WHETHER THIS MAC IS A WINDOW ONTO A HUB, and which one. `~/.agentbox/hub.json`
// holds `{ url, key }`; no file means the app runs everything here, as it always
// has. Whoever holds the key can run agents on the hub, so it never crosses a
// network in the clear.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/;
const KEY_AT_LEAST = 24;

function checked(url, key) {
  if (typeof key !== 'string' || key.length < KEY_AT_LEAST) return { invalid: 'its key is missing or too short' };
  let at;
  try { at = new URL(String(url)); } catch { return { invalid: 'its address cannot be read' }; }
  const safe = at.protocol === 'https:' || (at.protocol === 'http:' && LOOPBACK.test(at.hostname));
  return safe ? { url: at.origin, key } : { invalid: 'its address is not https, so the key would cross the network readable' };
}

/** `null` when this Mac names no hub; `{ url, key }`; or `{ invalid }` when it names one that cannot be used. */
export function readHubAddress(env = process.env, home = os.homedir()) {
  if (env.AGENTBOX_HUB) return checked(env.AGENTBOX_HUB, env.AGENTBOX_HUB_KEY);
  const file = path.join(home, '.agentbox', 'hub.json');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) {
    return err.code === 'ENOENT' ? null : { invalid: `${file} cannot be read` };
  }
  try {
    const { url, key } = JSON.parse(text);
    const hub = checked(url, key);
    return hub.invalid ? { invalid: `${file}: ${hub.invalid}` } : hub;
  } catch {
    return { invalid: `${file} is damaged` };
  }
}

// A store has one owner. A Mac that names a hub never falls back to running
// agents itself, even when it cannot read which hub.
export function whichApp(hub) {
  if (!hub) return 'whole';
  return hub.invalid ? 'refuse' : 'client';
}

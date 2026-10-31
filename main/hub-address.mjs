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
  if (typeof key !== 'string' || key.length < KEY_AT_LEAST) return null;
  let at;
  try { at = new URL(String(url)); } catch { return null; }
  const safe = at.protocol === 'https:' || (at.protocol === 'http:' && LOOPBACK.test(at.hostname));
  return safe ? { url: at.origin, key } : null;
}

export function readHubAddress(env = process.env, home = os.homedir()) {
  if (env.AGENTBOX_HUB) return checked(env.AGENTBOX_HUB, env.AGENTBOX_HUB_KEY);
  try {
    const { url, key } = JSON.parse(fs.readFileSync(path.join(home, '.agentbox', 'hub.json'), 'utf8'));
    return checked(url, key);
  } catch {
    return null;
  }
}

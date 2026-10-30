// WHICH RELAY THIS MAC USES (tests/the-mac-finds-the-relay-the-deploy-wrote-down).
// AGENTBOX_RELAY_URL first, for trying one by hand; then the address
// `npm run relay:deploy` wrote to relay/relay.local.json; then the one built
// into the app, which is empty until a deployed address is committed.
import fs from 'node:fs';
import path from 'node:path';
import { RELAY_URL } from '../shared/relay-address.mjs';

function usable(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return url.replace(/\/+$/, '');
}

export function relayAddress({ env = process.env, appDir }: { env?: Record<string, string | undefined>; appDir?: string } = {}): string {
  const byHand = usable(env.AGENTBOX_RELAY_URL);
  if (byHand) return byHand;
  if (appDir) {
    try {
      const deployed = usable((JSON.parse(fs.readFileSync(path.join(appDir, 'relay', 'relay.local.json'), 'utf8')) as { url?: unknown } | null)?.url);
      if (deployed) return deployed;
    } catch { /* not deployed from this folder */ }
  }
  return usable(RELAY_URL) ?? RELAY_URL;
}

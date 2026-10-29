// WHERE THE MAC FINDS THE RELAY (2026-10-12). The relay is deployed once, from
// the founder's own Cloudflare account ("I'll give you the accesses you need
// tmrw"), and only then has an address. Until then "Anywhere" must not show,
// and on the day it is deployed it must work on that Mac without anyone
// editing code: `npm run relay:deploy` writes the address it got to
// relay/relay.local.json, which git ignores, and the app reads it.
//
// The order: AGENTBOX_RELAY_URL (for trying a relay by hand), then that file,
// then the address built into the app (shared/relay-address.mjs), which is
// empty until a deployed address is committed for everybody. Anything that is
// not https is refused, bar a relay on this computer for development.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { relayAddress } from '../main/relay-address.mts';
import { RELAY_URL } from '../shared/relay-address.mjs';

const folder = (json) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-addr-'));
  fs.mkdirSync(path.join(dir, 'relay'));
  if (json !== undefined) fs.writeFileSync(path.join(dir, 'relay', 'relay.local.json'), typeof json === 'string' ? json : JSON.stringify(json));
  return dir;
};

describe('the relay a Mac uses', () => {
  it('is the one the deploy wrote down', () => {
    expect(relayAddress({ env: {}, appDir: folder({ url: 'https://agentbox-relay.someone.workers.dev' }) })).toBe('https://agentbox-relay.someone.workers.dev');
  });

  it('is one named by hand before that', () => {
    expect(relayAddress({ env: { AGENTBOX_RELAY_URL: 'https://by-hand.example' }, appDir: folder({ url: 'https://agentbox-relay.someone.workers.dev' }) })).toBe('https://by-hand.example');
  });

  it('is the built-in one with neither: the relay deployed for everybody', () => {
    expect(relayAddress({ env: {}, appDir: folder() })).toBe(RELAY_URL);
    // An https workers.dev address named for the app, never for a person: the
    // first deploy came out under the account owner's email name and was not
    // committed for that reason (2026-10-12).
    expect(RELAY_URL).toBe('https://agentbox-relay.agentbox-app.workers.dev');
  });

  it('is never plain http, except on this computer', () => {
    expect(relayAddress({ env: { AGENTBOX_RELAY_URL: 'http://relay.example' }, appDir: folder() })).toBe(RELAY_URL);
    expect(relayAddress({ env: { AGENTBOX_RELAY_URL: 'http://localhost:8787' }, appDir: folder() })).toBe('http://localhost:8787');
    expect(relayAddress({ env: {}, appDir: folder({ url: 'javascript:alert(1)' }) })).toBe(RELAY_URL);
  });

  it('shrugs off a file it cannot read', () => {
    expect(relayAddress({ env: {}, appDir: folder('{not json') })).toBe(RELAY_URL);
  });

  it('drops a trailing slash', () => {
    expect(relayAddress({ env: { AGENTBOX_RELAY_URL: 'https://by-hand.example/' }, appDir: folder() })).toBe('https://by-hand.example');
  });

  it('the file it reads is one git ignores', () => {
    const ignore = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^relay\/relay\.local\.json$/m);
    expect(ignore).toMatch(/^relay\/dist\/$/m);
  });
});

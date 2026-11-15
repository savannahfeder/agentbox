// THE LIVE RELAY LETS IN ONLY PEOPLE ON THE ROOM'S TEAM.
//
// A room's id starts with its team's id, and everything typed in it passes
// through the relay. A hosted relay must therefore ask the team cloud two
// things before it lets a socket in: whose sign-in this is, and whether that
// person is on the room's team. A cloud that does not answer is a no, inside a
// deadline, because nothing waits for ever.
import { describe, it, expect } from 'vitest';
import { supabaseAllow } from '../cloud/live/server.mjs';

const TEAM = '11111111-2222-3333-4444-555555555555';
const room = `${TEAM}.${'a'.repeat(40)}`;
const req = (token) => ({ url: `/room/${room}${token ? `?t=${token}` : ''}` });

function cloud({ people = { good: 'p-1', mate: 'p-2' }, members = ['p-1'], hang = false } = {}) {
  const asked = [];
  const fetchImpl = (url, init) => {
    asked.push(url);
    if (hang) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const token = String(init.headers.authorization).replace('Bearer ', '');
    if (url.endsWith('/auth/v1/user')) {
      return Promise.resolve(people[token] ? { ok: true, json: async () => ({ id: people[token] }) } : { ok: false, json: async () => ({}) });
    }
    const who = /person_id=eq\.([^&]+)/.exec(url)?.[1];
    const team = /team_id=eq\.([^&]+)/.exec(url)?.[1];
    return Promise.resolve({ ok: true, json: async () => (team === TEAM && members.includes(who) ? [{ person_id: who }] : []) });
  };
  return { fetchImpl, asked };
}

describe('a hosted relay', () => {
  it('lets in a signed-in person on the room\'s team', async () => {
    const { fetchImpl } = cloud();
    expect(await supabaseAllow({ url: 'https://db.example', anonKey: 'k', fetchImpl })(req('good'), room)).toBe(true);
  });

  it('keeps out a signed-in person on another team', async () => {
    const { fetchImpl } = cloud();
    expect(await supabaseAllow({ url: 'https://db.example', anonKey: 'k', fetchImpl })(req('mate'), room)).toBe(false);
  });

  it('keeps out a socket with no sign-in or one the cloud does not know', async () => {
    const { fetchImpl, asked } = cloud();
    const allow = supabaseAllow({ url: 'https://db.example', anonKey: 'k', fetchImpl });
    expect(await allow(req(null), room)).toBe(false);
    expect(asked).toHaveLength(0);
    expect(await allow(req('forged'), room)).toBe(false);
  });

  it('keeps out a room id that does not start with a team', async () => {
    const { fetchImpl } = cloud();
    expect(await supabaseAllow({ url: 'https://db.example', anonKey: 'k', fetchImpl })(req('good'), `team.${'a'.repeat(40)}`)).toBe(false);
  });

  it('says no when the cloud does not answer in time', async () => {
    const { fetchImpl } = cloud({ hang: true });
    const started = Date.now();
    expect(await supabaseAllow({ url: 'https://db.example', anonKey: 'k', fetchImpl, deadlineMs: 50 })(req('good'), room)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

// THE STAND-IN CLOUD LOSES CHAT EVENTS AS A DROPPED SOCKET DOES (w-f702d60afe, 2026-11-21).
//
// The founder missed a teammate's messages because her Mac's live connection
// dropped without a word and nothing read the chats again
// (tests/a-chat-message-reaches-needs-you-when-the-live-connection-is-down).
// No synthetic tester could have met it: the stand-in cloud they test on kept
// every event for a copy that was asleep and handed it over on waking, which
// the real cloud's socket never does. It now loses a chat event for a copy that
// has been away (no poll for AWAY_MS) or that a test deafened, so a tester's
// "the Mac slept" and "the connection dropped" faults meet the real thing.
import { describe, it, expect, afterEach } from 'vitest';
import { startStandinCloud, AWAY_MS } from '../cloud/standin/server.mjs';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => { while (stops.length) await stops.pop()!(); });

async function team(clock: { t: number }) {
  const c = await startStandinCloud({ now: () => clock.t });
  stops.push(c.stop);
  const post = async (door: string, body: object) => {
    const res = await fetch(`${c.url}/${door}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    return out;
  };
  const tony = await post('signin', { email: 'tony@team.test', name: 'Tony Stark' });
  const sav = await post('signin', { email: 'sav@team.test', name: 'Sav Founder' });
  const call = (who: { token: string }, method: string, ...args: unknown[]) => post('call', { token: who.token, method, args }).then((o) => o.value);
  const waitOf = (who: { token: string }) => post('wait', { token: who.token, waitMs: 50 }).then((o) => o.events as { kind: string }[]);
  const t = await call(tony, 'createTeam', 'Agentbox Team');
  await call(tony, 'invite', t.id, 'sav@team.test');
  await call(sav, 'acceptInvite', t.id);
  // Both are listening from the start, as a running copy is.
  await waitOf(sav); await waitOf(tony);
  const room = await call(tony, 'createRoom', { name: 'Sav Founder', kind: 'group', people: [tony.personId, sav.personId] });
  await waitOf(sav);
  const say = (words: string) => call(tony, 'sendRoomMessage', room.id ?? room, { body: words, inReplyTo: null, mentions: [] });
  return { post, sav, tony, say, waitOf };
}

describe('a chat event for someone listening', () => {
  it('reaches them, as it always did', async () => {
    const clock = { t: 1_000_000 };
    const { sav, say, waitOf } = await team(clock);
    await say('Are you there?');
    expect((await waitOf(sav)).filter((e) => e.kind === 'rooms').length).toBeGreaterThan(0);
  });
});

describe('a chat event for someone away', () => {
  it('is lost once they have not asked for events in a while, as a slept Mac\'s socket loses it', async () => {
    const clock = { t: 1_000_000 };
    const { sav, say, waitOf } = await team(clock);
    clock.t += AWAY_MS + 1;
    await say('Disk keeper is waiting for your approval.');
    expect((await waitOf(sav)).filter((e) => e.kind === 'rooms')).toEqual([]);
  });

  it('is lost while a test has deafened them, and heard again after', async () => {
    const clock = { t: 1_000_000 };
    const { post, sav, say, waitOf } = await team(clock);
    await post('deafen', { email: 'sav@team.test', ms: 60_000 });
    await say('One.');
    expect((await waitOf(sav)).filter((e) => e.kind === 'rooms')).toEqual([]);
    clock.t += 60_001;
    await waitOf(sav); // still listening all along
    await say('Two.');
    expect((await waitOf(sav)).filter((e) => e.kind === 'rooms').length).toBeGreaterThan(0);
  });
});

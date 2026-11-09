// Allow and Deny did nothing for minutes. Dev's reply typed at
// 16:09:40 reached the store at 16:17:37, 477 s later and seconds after he reloaded the tab.
// A tab has six connections to the app. The status poll alone asks twice a second, and every
// store change adds a snapshot, a badge and a corner tag, so an app answering slowly gets a
// queue that only grows, and a press joins the back of it. Measured through a proxy answering
// one call per 1.5 s: Allow took 104.5 s to reach the disk.
import { describe, expect, it } from 'vitest';
import { callLane, BACKGROUND_CHANNELS, LANE_ON_THE_WIRE } from '../renderer/src/tab-calls.ts';

/** A send that answers only when the test says so. */
function wire() {
  const sent = [];
  const send = (channel, body) => new Promise((resolve, reject) => { sent.push({ channel, body, resolve, reject }); });
  return { sent, send };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a call the person made goes straight out', () => {
  it('reaches the wire at once, with the lane full and a pile waiting', () => {
    const { sent, send } = wire();
    const call = callLane(send);
    for (let i = 0; i < 30; i++) call('zero:read-doc', `{"n":${i}}`);
    void call('zero:approve', '{"id":"a"}');
    expect(sent.at(-1).channel).toBe('zero:approve');
    expect(sent.length).toBe(LANE_ON_THE_WIRE + 1);
  });

  it('is never merged with another press, even an identical one', () => {
    const { sent, send } = wire();
    const call = callLane(send);
    void call('zero:answer', 'same');
    void call('zero:answer', 'same');
    expect(sent.length).toBe(2);
  });

  it('counts approve, a reply and a comment as presses, never as background', () => {
    for (const c of ['zero:approve', 'zero:answer', 'zero:files-place-mark']) expect(BACKGROUND_CHANNELS.has(c)).toBe(false);
  });
});

describe('background reads cannot pile up', () => {
  it('leaves connections free: no more than the lane on the wire', () => {
    const { sent, send } = wire();
    const call = callLane(send);
    for (let i = 0; i < 100; i++) call('zero:read-doc', `{"n":${i}}`);
    expect(sent.length).toBe(LANE_ON_THE_WIRE);
    // Six to a host, one is the event stream, and a press needs one left.
    expect(LANE_ON_THE_WIRE).toBeLessThanOrEqual(4);
  });

  it('keeps one waiting per identical read however many are asked for, and answers them all', async () => {
    const { sent, send } = wire();
    const call = callLane(send);
    for (let i = 0; i < LANE_ON_THE_WIRE; i++) call('zero:read-doc', `hold${i}`);
    const asked = Array.from({ length: 50 }, () => call('zero:snapshot', 'null'));
    for (const s of sent.splice(0)) s.resolve('held');
    await settle();
    expect(sent.filter((s) => s.channel === 'zero:snapshot').length).toBe(1);
    sent.find((s) => s.channel === 'zero:snapshot').resolve('snap');
    expect(await Promise.all(asked)).toEqual(Array(50).fill('snap'));
  });

  it('does not hand a read asked after a press the answer of one already on the wire', async () => {
    const { sent, send } = wire();
    const call = callLane(send);
    const before = call('zero:snapshot', 'null');
    const after = call('zero:snapshot', 'null');
    expect(sent.length).toBe(1);
    sent[0].resolve('old');
    expect(await before).toBe('old');
    await settle();
    expect(sent.length).toBe(2);
    sent[1].resolve('new');
    expect(await after).toBe('new');
  });

  it('does not merge reads of different things', () => {
    const { sent, send } = wire();
    const call = callLane(send);
    call('zero:read-doc', 'a');
    call('zero:read-doc', 'b');
    expect(sent.map((s) => s.body)).toEqual(['a', 'b']);
  });

  it('sends the newest first, because that is what is on screen now', async () => {
    const { sent, send } = wire();
    const call = callLane(send);
    for (let i = 0; i < LANE_ON_THE_WIRE; i++) call('zero:read-doc', `tile${i}`);
    for (let i = 0; i < 40; i++) call('zero:read-doc', `tile-behind${i}`);
    call('zero:read-doc', 'the-one-she-pressed');
    sent[0].resolve('x');
    await settle();
    expect(sent.at(-1).body).toBe('the-one-she-pressed');
  });

  it('keeps only the last of a count that nobody reads back', async () => {
    const { sent, send } = wire();
    const call = callLane(send);
    for (let i = 0; i < LANE_ON_THE_WIRE; i++) call('zero:read-doc', `hold${i}`);
    const first = call('zero:badge', '1');
    const last = call('zero:badge', '2');
    for (const s of sent.splice(0)) s.resolve('held');
    await settle();
    expect(sent.filter((s) => s.channel === 'zero:badge').map((s) => s.body)).toEqual(['2']);
    sent.find((s) => s.channel === 'zero:badge').resolve(null);
    expect(await first).toBe(null);
    expect(await last).toBe(null);
  });

  it('carries on after a read fails, and tells only those who asked for it', async () => {
    const { sent, send } = wire();
    const call = callLane(send);
    const bad = call('zero:snapshot', 'null');
    const others = Array.from({ length: LANE_ON_THE_WIRE }, (_, i) => call('zero:read-doc', `r${i}`));
    sent[0].reject(new Error('nope'));
    await expect(bad).rejects.toThrow('nope');
    await settle();
    expect(sent.length).toBe(LANE_ON_THE_WIRE + 1);
    for (const s of sent.slice(1)) s.resolve('ok');
    expect(await Promise.all(others)).toEqual(Array(LANE_ON_THE_WIRE).fill('ok'));
  });
});

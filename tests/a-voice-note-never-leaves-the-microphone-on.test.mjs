// A VOICE NOTE NEVER LEAVES THE MICROPHONE ON, AND REACHES ONLY WHOEVER ASKED.
//
// Recording a voice note opens the microphone. Codex's review of the first
// build found ways out that left it open or lost the note: a recorder that
// failed to start after the microphone opened kept its tracks live; a second
// note started while the first was being packed took the first's answer; a
// note that reached the five minute limit was handed to nobody. Measured here
// with a stand-in microphone that counts its live tracks: every way out ends
// with no track live, a refused or busy microphone says why, two boxes never
// record at once, a slip shorter than 0.4 s is not a note, and two notes in a
// row each arrive once, as themselves.
import { describe, it, expect } from 'vitest';
import { fakeMicrophone } from './helpers/fake-microphone.mjs';
import { TICK_MS, micRefusal } from '../renderer/src/team/voice-recording.ts';
import { VOICE_MAX_MS } from '../renderer/src/team/voice-note.ts';

describe('every way out lets the microphone go', () => {
  it('done keeps the note, at its length, and closes the microphone', async () => {
    const m = fakeMicrophone();
    const b = m.box();
    await b.r.start();
    expect(m.live.size).toBe(1);
    m.pass(2500);
    b.r.stop();
    await m.settle();
    expect(m.live.size).toBe(0);
    expect(m.timers.size).toBe(0);
    expect(b.notes).toHaveLength(1);
    expect(b.notes[0]).toMatchObject({ name: 'voice-note-2500ms.webm', how: 'recorded' });
  });

  it('the cross throws it away and closes the microphone', async () => {
    const m = fakeMicrophone();
    const b = m.box();
    await b.r.start();
    m.pass(2500);
    b.r.cancel();
    await m.settle();
    expect(m.live.size).toBe(0);
    expect(b.notes).toHaveLength(0);
  });

  it('the cross while the Mac is still asking never opens the microphone', async () => {
    const m = fakeMicrophone({ holdAsk: true });
    const b = m.box();
    const started = b.r.start();
    b.r.cancel();
    m.ask();
    await started;
    expect(m.live.size).toBe(0);
    expect(m.recorders).toHaveLength(0);
  });

  it('a recorder that cannot start closes the microphone it was given and says so', async () => {
    const m = fakeMicrophone({ recorderFails: true });
    const b = m.box();
    await b.r.start();
    expect(m.live.size).toBe(0);
    expect(b.said).toEqual(['A voice note could not be recorded on this computer.']);
    expect(b.phases.at(-1)).toBe('idle');
    expect(m.env.busy.id).toBeNull();
  });

  it('a refused microphone opens nothing and says where to allow it', async () => {
    const m = fakeMicrophone({ access: 'settings' });
    const b = m.box();
    await b.r.start();
    expect(m.live.size).toBe(0);
    expect(b.said[0]).toMatch(/System Settings/);
  });
});

describe('a microphone that will not open says why', () => {
  it('names the reason the browser gives', () => {
    expect(micRefusal({ name: 'NotAllowedError' })).toMatch(/Allow the microphone/);
    expect(micRefusal({ name: 'NotFoundError' })).toMatch(/No microphone was found/);
    expect(micRefusal({ name: 'NotReadableError' })).toMatch(/Another app is using the microphone/);
    expect(micRefusal(new Error('odd'))).toMatch(/could not be opened/);
  });

  it('says it in the box when opening fails', async () => {
    const m = fakeMicrophone({ openFails: 'NotReadableError' });
    const b = m.box();
    await b.r.start();
    expect(b.said).toEqual([micRefusal({ name: 'NotReadableError' })]);
    expect(b.phases.at(-1)).toBe('idle');
  });
});

describe('one note at a time', () => {
  it('a second box cannot start while another records, and can once it is done', async () => {
    const m = fakeMicrophone();
    const a = m.box('direct:p:w-1');
    const b = m.box('room:r:');
    await a.r.start();
    await b.r.start();
    expect(b.said).toEqual(['Another voice note is recording. Finish that one first.']);
    expect(m.live.size).toBe(1);
    m.pass(1000);
    a.r.stop();
    await m.settle();
    await b.r.start();
    expect(m.live.size).toBe(1);
    expect(b.phases.at(-1)).toBe('recording');
  });
});

describe('what counts as a note', () => {
  it('stops itself at the limit, keeps the note, and says so', async () => {
    const m = fakeMicrophone();
    const b = m.box();
    await b.r.start();
    m.pass(VOICE_MAX_MS - TICK_MS);
    expect(b.notes).toHaveLength(0);
    m.pass(TICK_MS);
    await m.settle();
    expect(m.live.size).toBe(0);
    expect(b.notes).toHaveLength(1);
    expect(b.notes[0].ms).toBe(VOICE_MAX_MS);
    expect(b.said).toEqual(['Voice notes stop at 5:00. This one is in the box.']);
  });

  it('a slip shorter than 0.4 s is not a note and says so; 0.4 s is', async () => {
    const short = fakeMicrophone();
    const s = short.box();
    await s.r.start();
    short.pass(399);
    s.r.stop();
    await short.settle();
    expect(s.notes).toHaveLength(0);
    expect(s.said[0]).toMatch(/too short to keep/);
    const just = fakeMicrophone();
    const j = just.box();
    await j.r.start();
    just.pass(400);
    j.r.stop();
    await just.settle();
    expect(j.notes).toHaveLength(1);
  });

  it('a second note recorded while the first is still being packed: each arrives once, as itself', async () => {
    const m = fakeMicrophone();
    const packs = [];
    const world = { ...m.env, pack: (blob) => new Promise((res) => packs.push(() => res(String(blob.size)))) };
    const b = m.box('direct:p:w-1', world);
    await b.r.start();
    m.pass(1000);
    b.r.stop();
    await m.settle();
    expect(packs).toHaveLength(1);
    await b.r.start();
    m.pass(2000);
    b.r.stop();
    await m.settle();
    packs[1]();
    packs[0]();
    await m.settle();
    expect(b.notes.map((n) => n.ms)).toEqual([2000, 1000]);
    expect(m.live.size).toBe(0);
  });
});

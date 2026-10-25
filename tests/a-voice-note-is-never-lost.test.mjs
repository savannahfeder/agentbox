// A VOICE NOTE IS NEVER LOST, WHATEVER HAPPENS WHILE IT IS RECORDED.
//
// Asked for by the person this app is for: someone records three minutes and
// something goes wrong half way, and that must not cost them what they said.
// The first build threw a note away whenever its box went: switching
// conversation, closing the reply box, the app quitting or crashing. Now each
// piece is written to this Mac as it is recorded (voice-drafts.ts) and only
// the cross throws a note away. Measured with a stand-in microphone and store:
//   the box closing mid-note keeps it, and the conversation's next box has it;
//   the app closing mid-note (pieces written, never finished) brings it back
//     at the length it reached, and says so;
//   the microphone dropping or the recorder breaking ends the note there and
//     keeps it, and says at what time;
//   Send pressed mid-note takes the note straight to the send, never the box;
//   a store that refuses every write still hands the note over;
//   a note is forgotten once sent, and the cross leaves nothing behind;
//   a note still being recorded is never handed to another box;
//   a box mounted twice (React's strict mode) hands each note over once.
// A review of that build found more ways to lose or double a note, now held:
//   a note being sent is not offered back to the box, comes back if the send
//     is turned back, and is dropped ten minutes after it went;
//   Send pressed between the tick and the note reaching the box takes it;
//   a box opened while the last one is still writing its note waits for it;
//   a store that will not write says so once, since a crash would cost the note.
import { describe, it, expect } from 'vitest';
import { fakeMicrophone } from './helpers/fake-microphone.mjs';
import { voiceRecording, SENT_KEEP_MS } from '../renderer/src/team/voice-recording.ts';
import { listedVoiceStore, memoryVoiceStore, voiceDraftsFor } from '../renderer/src/team/voice-drafts.ts';

const KEY = 'direct:p:w-1';

describe('the box going away', () => {
  it('keeps the note, turns the microphone off at once, and gives it to the next box', async () => {
    const m = fakeMicrophone();
    const first = m.box(KEY);
    await first.r.start();
    m.pass(3 * 60_000);
    first.r.dispose();
    expect(m.live.size).toBe(0);
    await m.settle();
    expect(first.notes).toHaveLength(0);
    const next = m.box(KEY);
    await next.r.restore();
    expect(next.notes).toHaveLength(1);
    expect(next.notes[0]).toMatchObject({ how: 'kept', ms: 3 * 60_000, name: 'voice-note-180000ms.webm' });
    expect(next.said).toEqual([]);
  });

  it('gives it only to the same conversation', async () => {
    const m = fakeMicrophone();
    const first = m.box(KEY);
    await first.r.start();
    m.pass(5000);
    first.r.dispose();
    await m.settle();
    const elsewhere = m.box('room:r:');
    await elsewhere.r.restore();
    expect(elsewhere.notes).toHaveLength(0);
  });
});

describe('the app closing mid-note', () => {
  it('brings back what was said, at the length it reached, and says so', async () => {
    const store = memoryVoiceStore();
    await store.begin({ id: 'crashed', key: KEY, startedAt: 10_000, mime: 'audio/webm', done: false });
    await store.chunk('crashed', 1, new Blob(['a']), 11_000);
    await store.chunk('crashed', 2, new Blob(['b']), 72_000);
    const m = fakeMicrophone();
    const b = m.box(KEY, { ...m.env, store });
    await b.r.restore();
    expect(b.notes).toHaveLength(1);
    expect(b.notes[0]).toMatchObject({ how: 'recovered', ms: 62_000, name: 'voice-note-62000ms.webm' });
    expect(Buffer.from(b.notes[0].dataBase64, 'base64').toString()).toBe('ab');
    expect(b.said).toEqual(['A voice note you were recording when the app closed was kept. It is in the box.']);
    expect((await store.list(KEY))[0]).toMatchObject({ done: true, ms: 62_000 });
  });

  it('drops a note that never got a single piece written', async () => {
    const store = memoryVoiceStore();
    await store.begin({ id: 'empty', key: KEY, startedAt: 10_000, mime: 'audio/webm', done: false });
    const m = fakeMicrophone();
    const b = m.box(KEY, { ...m.env, store });
    await b.r.restore();
    expect(b.notes).toHaveLength(0);
    expect(await store.list(KEY)).toEqual([]);
  });
});

describe('the microphone going away mid-note', () => {
  it('ends the note where it was, keeps it, and says at what time', async () => {
    const m = fakeMicrophone();
    const b = m.box(KEY);
    await b.r.start();
    m.pass(72_000);
    m.tracks[0].end();
    await m.settle();
    expect(m.live.size).toBe(0);
    expect(b.notes).toHaveLength(1);
    expect(b.notes[0].ms).toBe(72_000);
    expect(b.said).toEqual(['The microphone stopped, so the note ends at 1:12. It is in the box.']);
  });

  it('does the same when the recorder breaks', async () => {
    const m = fakeMicrophone();
    const b = m.box(KEY);
    await b.r.start();
    m.pass(30_000);
    m.recorders[0].fail();
    await m.settle();
    expect(b.notes).toHaveLength(1);
    expect(m.live.size).toBe(0);
  });
});

describe('Send pressed while recording', () => {
  it('hands the note to the send, not to the box', async () => {
    const m = fakeMicrophone();
    const b = m.box(KEY);
    await b.r.start();
    m.pass(4000);
    const note = await b.r.finish();
    expect(note).toMatchObject({ ms: 4000 });
    expect(b.notes).toHaveLength(0);
    expect(m.live.size).toBe(0);
  });

  it('answers nothing when nothing is recording', async () => {
    const m = fakeMicrophone();
    expect(await m.box(KEY).r.finish()).toBeNull();
  });
});

describe('a store that will not write', () => {
  it('still hands the note over from memory', async () => {
    const m = fakeMicrophone({ storeFails: true });
    const b = m.box(KEY);
    await b.r.start();
    m.pass(6000);
    b.r.stop();
    await m.settle();
    expect(b.notes).toHaveLength(1);
    expect(b.notes[0].ms).toBe(6000);
  });

  it('says once that there is no spare copy, so the note is sent before the app closes', async () => {
    const m = fakeMicrophone({ storeFails: true });
    const b = m.box(KEY);
    await b.r.start();
    m.pass(6000);
    b.r.stop();
    await m.settle();
    expect(b.said).toEqual(['This computer is not keeping a spare copy of the voice note, so send it before you close the app.']);
  });

  it('says nothing when the store writes', async () => {
    const m = fakeMicrophone();
    const b = m.box(KEY);
    await b.r.start();
    m.pass(6000);
    b.r.stop();
    await m.settle();
    expect(b.said).toEqual([]);
  });
});

describe('what is kept afterwards', () => {
  it('nothing, once the note is sent', async () => {
    const m = fakeMicrophone();
    const b = m.box(KEY);
    await b.r.start();
    m.pass(3000);
    b.r.stop();
    await m.settle();
    await b.r.forget(b.notes[0].draftId);
    const next = m.box(KEY);
    await next.r.restore();
    expect(next.notes).toHaveLength(0);
  });

  it('nothing, once the cross is pressed', async () => {
    const m = fakeMicrophone();
    const b = m.box(KEY);
    await b.r.start();
    m.pass(3000);
    b.r.cancel();
    await m.settle();
    expect(await m.store.list(KEY)).toEqual([]);
  });

  it('a note sitting unsent in the box comes back to it, once, oldest first', async () => {
    const m = fakeMicrophone();
    const b = m.box(KEY);
    for (const ms of [2000, 5000]) { await b.r.start(); m.pass(ms); b.r.stop(); await m.settle(); }
    const next = m.box(KEY);
    await next.r.restore();
    expect(next.notes.map((n) => [n.ms, n.how])).toEqual([[2000, 'kept'], [5000, 'kept']]);
  });
});

describe('two boxes and one note', () => {
  it('a note still being recorded is never handed to another box', async () => {
    const m = fakeMicrophone();
    const a = m.box(KEY);
    await a.r.start();
    m.pass(2000);
    // Its pieces are written down, so the store holds an unfinished note.
    await m.settle();
    expect((await m.store.list(KEY))[0]).toMatchObject({ done: false });
    const other = m.box(KEY);
    await other.r.restore();
    expect(other.notes).toHaveLength(0);
    a.r.stop();
    await m.settle();
    expect(a.notes).toHaveLength(1);
  });

  it('a box mounted, set aside and mounted again hands each note over once', async () => {
    const m = fakeMicrophone();
    const first = m.box(KEY);
    await first.r.start();
    m.pass(2000);
    first.r.stop();
    await m.settle();
    const once = m.box(KEY);
    const twice = m.box(KEY);
    const r1 = once.r.restore();
    once.r.dispose();
    await r1;
    await twice.r.restore();
    expect(once.notes).toHaveLength(0);
    expect(twice.notes).toHaveLength(1);
  });
});

describe('a note on its way out', () => {
  const recorded = async (m, b, ms = 3000) => { await b.r.start(); m.pass(ms); b.r.stop(); await m.settle(); return b.notes.at(-1); };

  it('is not offered back to the box while it is being sent', async () => {
    const m = fakeMicrophone();
    const note = await recorded(m, m.box(KEY));
    await m.store.sent(note.draftId, m.now());
    const next = m.box(KEY);
    await next.r.restore();
    expect(next.notes).toHaveLength(0);
    expect(await m.store.list(KEY)).toHaveLength(1);
  });

  it('comes back when the send is turned back', async () => {
    const m = fakeMicrophone();
    const note = await recorded(m, m.box(KEY));
    await m.store.sent(note.draftId, m.now());
    await m.store.sent(note.draftId, null);
    const next = m.box(KEY);
    await next.r.restore();
    expect(next.notes.map((n) => n.draftId)).toEqual([note.draftId]);
  });

  it('is kept for ten minutes after it went, then dropped', async () => {
    const m = fakeMicrophone();
    const note = await recorded(m, m.box(KEY));
    await m.store.sent(note.draftId, m.now());
    m.pass(SENT_KEEP_MS);
    await m.box(KEY).r.restore();
    expect(await m.store.list(KEY)).toHaveLength(1);
    m.pass(1);
    await m.box(KEY).r.restore();
    expect(await m.store.list(KEY)).toEqual([]);
  });

  it('leaves the folded box’s list while it goes, and is back on it when turned back', async () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const store = listedVoiceStore(memoryVoiceStore(), storage);
    await store.begin({ id: 'n1', key: KEY, startedAt: 1, mime: 'audio/webm', done: false });
    await store.sent('n1', 5);
    expect(voiceDraftsFor(KEY, storage)).toEqual([]);
    await store.sent('n1', null);
    expect(voiceDraftsFor(KEY, storage)).toEqual([{ id: 'n1' }]);
  });
});

describe('Send pressed just after the tick', () => {
  it('takes the note that is still being written down, and the box never gets it too', async () => {
    const m = fakeMicrophone();
    // The note is stopped and being read back when Send is pressed.
    let readBack;
    const held = new Promise((r) => { readBack = r; });
    const b = m.box(KEY, { ...m.env, pack: async (blob) => { await held; return m.env.pack(blob); } });
    await b.r.start();
    m.pass(4000);
    b.r.stop();
    await m.settle();
    expect(b.r.recording()).toBe(true);
    const sending = b.r.finish();
    readBack();
    const note = await sending;
    await m.settle();
    expect(note).toMatchObject({ ms: 4000 });
    expect(b.notes).toHaveLength(0);
    expect(b.r.recording()).toBe(false);
  });
});

describe('a box that opens while the last one is still writing its note down', () => {
  it('waits for it and has it, when the last box went away', async () => {
    const m = fakeMicrophone();
    const first = m.box(KEY);
    await first.r.start();
    m.pass(5000);
    first.r.dispose();
    const next = m.box(KEY);
    await next.r.restore();
    expect(next.notes.map((n) => n.ms)).toEqual([5000]);
  });

  it('leaves it to the box that recorded it, when that box is still there', async () => {
    const m = fakeMicrophone();
    const a = m.box(KEY);
    await a.r.start();
    m.pass(5000);
    a.r.stop();
    const other = m.box(KEY);
    await other.r.restore();
    await m.settle();
    expect(other.notes).toHaveLength(0);
    expect(a.notes).toHaveLength(1);
  });
});

describe('the list the folded reply box reads', () => {
  it('names a note while it is kept, with its length once finished, and forgets it', async () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const store = listedVoiceStore(memoryVoiceStore(), storage);
    await store.begin({ id: 'n1', key: KEY, startedAt: 1, mime: 'audio/webm', done: false });
    expect(voiceDraftsFor(KEY, storage)).toEqual([{ id: 'n1' }]);
    await store.finish('n1', { ms: 4200, name: 'voice-note-4200ms.webm' });
    expect(voiceDraftsFor(KEY, storage)).toEqual([{ id: 'n1', ms: 4200 }]);
    expect(voiceDraftsFor('room:r:', storage)).toEqual([]);
    await store.remove('n1');
    expect(voiceDraftsFor(KEY, storage)).toEqual([]);
  });
});

it('is a recorder anyone can make with this Mac’s pieces', () => {
  const m = fakeMicrophone();
  expect(Object.keys(voiceRecording(m.env, KEY, { phase() {}, tick() {}, done() {}, say() {} })).sort())
    .toEqual(['cancel', 'dispose', 'finish', 'forget', 'recording', 'restore', 'start', 'stop']);
});

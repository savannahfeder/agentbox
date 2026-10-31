// ONE VOICE NOTE BEING RECORDED, without React and without the browser's own
// objects, so every way it can go wrong can be tested. Two promises it keeps:
//
//   THE MICROPHONE IS LET GO on every way out: done, the cross, the limit, the
//   microphone dropping, a failure, the box going away.
//
//   NOTHING SAID IS LOST. Each piece is written to this Mac as it is recorded
//   (./voice-drafts.ts), so the box closing, the app quitting or crashing, or
//   the microphone dropping mid-sentence all keep what was said, and the note
//   comes back to its conversation's box. Only the cross throws one away.
//
// ./useVoiceRecorder.ts hands it the real microphone and the real store.
import { VOICE_MAX_MS, voiceClock, voiceNoteName } from './voice-note';
import type { VoiceDraftStore } from './voice-drafts';

export type Recorded = { name: string; ms: number; dataBase64: string; blob: Blob; draftId: string };
export type VoicePhase = 'idle' | 'asking' | 'recording';
/** How a note reached the box: just recorded, kept from before, or recovered after the app closed mid-note. */
export type Arrival = 'recorded' | 'kept' | 'recovered';

type Track = { stop: () => void; addEventListener?: (type: 'ended', fn: () => void) => void };
export type StreamLike = { getTracks: () => Track[] };
export type RecorderLike = {
  state: string;
  mimeType: string;
  start: (sliceMs: number) => void;
  stop: () => void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror?: ((e: unknown) => void) | null;
};

export type RecordingEnv = {
  ask: () => Promise<'granted' | 'settings'>;
  open: () => Promise<StreamLike>;
  makeRecorder: (stream: StreamLike) => RecorderLike;
  /** How loud the microphone is right now, 0..1, and how to stop listening. */
  makeMeter: (stream: StreamLike) => { level: () => number; close: () => void };
  now: () => number;
  every: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
  pack: (blob: Blob) => Promise<string>;
  store: VoiceDraftStore;
  /**
   * Shared by every box in the window: one note records at a time, and a note
   * still being written down after it stopped is waited for, not skipped.
   */
  busy: { id: string | null; finishing?: Map<string, { done: Promise<void>; delivers: boolean }>; recording?: Set<object> };
  newId: () => string;
};

/**
 * Whether any box in the window is waiting for the microphone or recording.
 * Folding a box ends its note, so a click away must not fold one meanwhile.
 */
export const aNoteIsRecording = (busy: RecordingEnv['busy']) => !!busy.recording?.size;

/** How long a sent note is kept, in case the send is undone or fails. */
export const SENT_KEEP_MS = 10 * 60_000;

export const TICK_MS = 90;
/** How often the recorder hands over a piece, and so how much a crash can cost. */
export const SLICE_MS = 1000;
const METER = 36;
// Shorter than this is a slip of the finger, not a note.
export const SHORTEST_MS = 400;
const WRITE_WAIT_MS = 3000;
const extOf = (type: string) => (/mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm');

// What a microphone that will not open says, by the name the browser gives it.
export function micRefusal(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Allow the microphone in System Settings, then press the mic again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Connect one, then press the mic again.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Another app is using the microphone. Close it there, then press the mic again.';
  return 'The microphone could not be opened. Check System Settings, then press the mic again.';
}

type Why = 'done' | 'limit' | 'lost' | 'cancel' | 'gone';

export function voiceRecording(env: RecordingEnv, key: string, on: {
  phase: (p: VoicePhase) => void;
  tick: (elapsed: number, levels: number[]) => void;
  done: (note: Recorded, how: Arrival) => void;
  say: (text: string) => void;
}) {
  type Live = {
    id: string; recorder: RecorderLike; stream: StreamLike; meter: { close: () => void } | null; timer: number;
    why: Why | null; writes: Promise<void>; startedAt: number; finished: Promise<Recorded | null>; deliver: boolean;
    end: (why: Why) => void;
  };
  let live: Live | null = null;
  // Stopped, and not yet in the box: Send can still take it from here.
  let stopping: Live | null = null;
  let asking = 0;
  let gone = false;
  let phase: VoicePhase = 'idle';
  const me = {};
  const recordingNow = (env.busy.recording ??= new Set());
  const setPhase = (p: VoicePhase) => {
    phase = p;
    if (p === 'idle') recordingNow.delete(me); else recordingNow.add(me);
    on.phase(p);
  };
  const finishing = (env.busy.finishing ??= new Map());
  // A store that will not write is said once, since a crash would now cost the note.
  let warned = false;
  const storeFailed = () => {
    if (warned || gone) return;
    warned = true;
    on.say('This computer is not keeping a spare copy of the voice note, so send it before you close the app.');
  };

  const release = (l: { stream: StreamLike; meter: { close: () => void } | null; timer: number }) => {
    env.clear(l.timer);
    l.stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* already stopped */ } });
    try { l.meter?.close(); } catch { /* already closed */ }
  };

  async function start() {
    if (live || gone || phase !== 'idle') return;
    if (env.busy.id) { on.say('Another voice note is recording. Finish that one first.'); return; }
    const ask = (asking += 1);
    const still = () => !gone && ask === asking;
    setPhase('asking');
    const access = await env.ask().catch(() => 'settings' as const);
    if (!still()) return;
    if (access !== 'granted') { setPhase('idle'); on.say(micRefusal({ name: 'NotAllowedError' })); return; }
    let stream: StreamLike;
    try { stream = await env.open(); } catch (err) {
      if (still()) { setPhase('idle'); on.say(micRefusal(err)); }
      return;
    }
    if (!still() || env.busy.id) {
      stream.getTracks().forEach((t) => t.stop());
      if (still()) { setPhase('idle'); on.say('Another voice note is recording. Finish that one first.'); }
      return;
    }
    const id = env.newId();
    let resolveFinished: (n: Recorded | null) => void = () => {};
    const mine: Live = {
      id, recorder: null as unknown as RecorderLike, stream, meter: null, timer: 0, why: null,
      writes: Promise.resolve(), startedAt: env.now(), deliver: true, end: () => {},
      finished: new Promise((r) => { resolveFinished = r; }),
    };
    // Writes go one after another, and one that fails costs only itself.
    const keep = (fn: () => Promise<void>) => { mine.writes = mine.writes.then(fn).catch(storeFailed); };
    try {
      const recorder = env.makeRecorder(stream);
      mine.recorder = recorder;
      const meter = env.makeMeter(stream);
      mine.meter = meter;
      const mime = recorder.mimeType || 'audio/webm';
      keep(() => env.store.begin({ id, key, startedAt: mine.startedAt, mime, done: false }));
      // Held here as well as written down: the note is read from memory, and
      // the written copy is what survives this window closing.
      const pieces: Blob[] = [];
      let levels: number[] = [];
      recorder.ondataavailable = (e) => {
        if (!e.data.size) return;
        pieces.push(e.data);
        const index = pieces.length;
        const at = env.now();
        keep(() => env.store.chunk(id, index, e.data, at));
      };
      const end = (why: Why) => {
        if (mine.why) return;
        mine.why = why;
        if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { void recorder.onstop?.(); } }
      };
      mine.end = end;
      // THE MICROPHONE GOING AWAY MID-NOTE (unplugged, taken by the system,
      // the Mac sleeping) ends the note where it is rather than losing it.
      for (const t of stream.getTracks()) t.addEventListener?.('ended', () => end('lost'));
      recorder.onerror = () => end('lost');
      // Written down before the window lets go of it, so a box that opens
      // again at once finds it finished rather than half recorded. A store
      // that will not answer holds nothing up for long.
      const settled = () => Promise.race([mine.writes, new Promise<void>((r) => { setTimeout(r, WRITE_WAIT_MS); })])
        .finally(() => { if (env.busy.id === id) env.busy.id = null; });
      recorder.onstop = async () => {
        if (live === mine) live = null;
        release(mine);
        if (!gone) { setPhase('idle'); on.tick(0, []); }
        const why = mine.why ?? 'lost';
        const ms = Math.min(VOICE_MAX_MS, env.now() - mine.startedAt);
        // Another box restoring this conversation waits for this to be
        // written down, and leaves it alone if it is going to this box.
        let landed: () => void = () => {};
        finishing.set(id, { done: new Promise<void>((r) => { landed = r; }), delivers: why !== 'gone' && why !== 'cancel' });
        const out = (note: Recorded | null) => { if (stopping === mine) stopping = null; finishing.delete(id); landed(); resolveFinished(note); };
        if (why === 'cancel') { keep(() => env.store.remove(id)); await settled(); out(null); return; }
        if (ms < SHORTEST_MS || !pieces.length) {
          keep(() => env.store.remove(id));
          await settled();
          if (!gone && why !== 'gone') on.say('That was too short to keep. Press the mic, talk, then press the tick.');
          out(null);
          return;
        }
        if (why !== 'gone') stopping = mine;
        const name = voiceNoteName(ms, extOf(mime));
        keep(() => env.store.finish(id, { ms, name }));
        await settled();
        // The box went away: the note waits in the store for the next one.
        if (why === 'gone') { out(null); return; }
        const blob = new Blob(pieces, { type: mime });
        let note: Recorded | null = null;
        try { note = { name, ms, blob, dataBase64: await env.pack(blob), draftId: id }; } catch { note = null; }
        if (!note) {
          if (!gone) on.say('The voice note was kept but could not be read back. Open this conversation again to find it.');
          out(null);
          return;
        }
        // From here Send can no longer take it: it goes to the box, or to
        // whoever already asked for it.
        const toBox = !gone && mine.deliver;
        out(note);
        if (!toBox) return;
        on.done(note, 'recorded');
        if (why === 'limit') on.say(`Voice notes stop at ${voiceClock(VOICE_MAX_MS)}. This one is in the box.`);
        if (why === 'lost') on.say(`The microphone stopped, so the note ends at ${voiceClock(ms)}. It is in the box.`);
      };
      mine.timer = env.every(() => {
        const ms = env.now() - mine.startedAt;
        levels = [...levels, Math.min(1, meter.level())].slice(-METER);
        on.tick(ms, levels);
        if (ms >= VOICE_MAX_MS) end('limit');
      }, TICK_MS);
      env.busy.id = id;
      live = mine;
      recorder.start(SLICE_MS);
      setPhase('recording');
    } catch {
      live = null;
      if (env.busy.id === id) env.busy.id = null;
      release(mine);
      keep(() => env.store.remove(id));
      setPhase('idle');
      on.say('A voice note could not be recorded on this computer.');
    }
  }

  const endLive = (why: Why) => live?.end(why);

  /** Finish; the note arrives through `done`. */
  function stop() { endLive('done'); }

  /**
   * Finish and hand the note to the caller instead of the box: Send pressed
   * while recording sends it at once. Null when nothing was kept.
   */
  function finish(): Promise<Recorded | null> {
    const l = live ?? stopping;
    if (!l) return Promise.resolve(null);
    l.deliver = false;
    if (l === live) endLive('done');
    return l.finished;
  }

  /** Throw it away, or stop waiting for the microphone. */
  function cancel() {
    asking += 1;
    if (live) { endLive('cancel'); return; }
    if (phase === 'asking') setPhase('idle');
  }

  /** The box went away. A note being recorded is kept for when it comes back. */
  function dispose() {
    gone = true;
    asking += 1;
    recordingNow.delete(me);
    const l = live;
    if (!l) return;
    endLive('gone');
    // The microphone goes off now, not when the recorder gets round to it.
    release(l);
  }

  /**
   * Into the box: notes recorded here and not sent, and any the app was still
   * recording when it closed. Not one still being recorded in this window.
   */
  async function restore() {
    const drafts = await env.store.list(key).catch(() => []);
    let recovered = 0;
    for (const listed of drafts.sort((a, b) => a.startedAt - b.startedAt)) {
      if (gone) return;
      let d = listed;
      // Gone out: not offered back, and dropped once an undo is no longer possible.
      if (d.sentAt) {
        if (env.now() - d.sentAt > SENT_KEEP_MS) await env.store.remove(d.id).catch(() => {});
        continue;
      }
      // Still being recorded in this window: it belongs to the box recording it.
      if (env.busy.id === d.id && !finishing.has(d.id)) continue;
      // Stopped and still being written down: waited for, then left alone if
      // it is on its way to the box that recorded it.
      const f = finishing.get(d.id);
      if (f) {
        await f.done;
        if (f.delivers || gone) continue;
        const now = (await env.store.list(key).catch(() => [])).find((x) => x.id === d.id);
        if (!now || now.sentAt) continue;
        d = now;
      }
      const kept = await env.store.read(d.id).catch(() => null);
      if (!kept || !kept.blob.size) { await env.store.remove(d.id).catch(() => {}); continue; }
      let ms = d.ms ?? 0;
      let name = d.name ?? '';
      if (!d.done || !name) {
        ms = Math.max(1, Math.min(VOICE_MAX_MS, kept.lastAt - d.startedAt));
        name = voiceNoteName(ms, extOf(d.mime));
        await env.store.finish(d.id, { ms, name }).catch(() => {});
      }
      let dataBase64: string;
      try { dataBase64 = await env.pack(kept.blob); } catch { continue; }
      if (gone) return;
      on.done({ name, ms, blob: kept.blob, dataBase64, draftId: d.id }, d.done ? 'kept' : 'recovered');
      if (!d.done) recovered += 1;
    }
    if (recovered && !gone) on.say(recovered === 1
      ? 'A voice note you were recording when the app closed was kept. It is in the box.'
      : `${recovered} voice notes you were recording when the app closed were kept. They are in the box.`);
  }

  /** A note taken out of the box, or that has certainly gone out, leaves the store. */
  const forget = (draftId: string) => env.store.remove(draftId).catch(() => {});

  return { start, stop, finish, cancel, dispose, restore, forget, recording: () => !!live || !!stopping };
}

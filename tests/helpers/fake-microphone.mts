// A stand-in microphone, recorder, clock and store for voice note tests. It
// counts live microphone tracks, hands over a piece every SLICE_MS of clock,
// and can lose the microphone, fail the recorder or fail every write.
import { voiceRecording, SLICE_MS } from '../../renderer/src/team/voice-recording.ts';
import { memoryVoiceStore } from '../../renderer/src/team/voice-drafts.ts';

export function fakeMicrophone({ access = 'granted', recorderFails = false, holdAsk = false, openFails = null, storeFails = false } = {}) {
  let clock = 1_000_000;
  const timers = new Map();
  let nextTimer = 1;
  const live = new Set();
  const tracks = [];
  let releaseAsk = null;
  const recorders = [];
  const inner = memoryVoiceStore();
  const store = storeFails
    ? { ...inner, begin: async () => { throw new Error('full'); }, chunk: async () => { throw new Error('full'); }, finish: async () => { throw new Error('full'); } }
    : inner;
  const env = {
    ask: () => (holdAsk ? new Promise((r) => { releaseAsk = () => r(access); }) : Promise.resolve(access)),
    open: async () => {
      if (openFails) { const e = new Error(openFails); e.name = openFails; throw e; }
      const ended = [];
      const track = { stop: () => live.delete(track), addEventListener: (type, fn) => { if (type === 'ended') ended.push(fn); }, end: () => { live.delete(track); ended.forEach((fn) => fn()); } };
      live.add(track);
      tracks.push(track);
      return { getTracks: () => [track] };
    },
    makeRecorder: () => {
      if (recorderFails) throw new Error('no recorder here');
      const rec = {
        state: 'inactive', mimeType: 'audio/webm', ondataavailable: null, onstop: null, onerror: null, slice: 0, given: 0,
        start(ms) { this.state = 'recording'; this.slice = ms; this.since = clock; },
        give() { this.ondataavailable?.({ data: new Blob([`piece-${(this.given += 1)}`]) }); this.since = clock; },
        stop() { if (this.state === 'inactive') return; this.state = 'inactive'; this.give(); queueMicrotask(() => this.onstop?.()); },
        fail() { this.onerror?.(new Error('recorder broke')); },
      };
      recorders.push(rec);
      return rec;
    },
    makeMeter: () => ({ level: () => 0.5, close: () => {} }),
    now: () => clock,
    every: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clear: (id) => { timers.delete(id); },
    pack: async (blob) => Buffer.from(await blob.arrayBuffer()).toString('base64'),
    store,
    busy: { id: null },
    newId: () => `rec-${(nextTimer += 1)}`,
  };
  // Time passes: the meter ticks, and the recorder hands over a piece each slice.
  const pass = (ms) => {
    clock += ms;
    for (const rec of recorders) if (rec.state === 'recording' && clock - rec.since >= (rec.slice || SLICE_MS)) rec.give();
    for (const fn of [...timers.values()]) fn();
  };
  const settle = () => new Promise((res) => setTimeout(res, 5));
  const box = (key = 'direct:p:w-1', world = env) => {
    const notes = [];
    const said = [];
    const phases = [];
    const r = voiceRecording(world, key, {
      phase: (p) => phases.push(p), tick: () => {},
      done: (n, how) => notes.push({ ...n, how }), say: (t) => said.push(t),
    });
    return { r, notes, said, phases };
  };
  return { env, store: inner, live, tracks, recorders, timers, pass, settle, box, ask: () => releaseAsk?.(), now: () => clock };
}

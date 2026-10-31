// RECORDING A VOICE NOTE: press the mic, talk, press the tick. While it records
// the composer shows how long it has been and a live meter, so you can see it
// is hearing you. The rules, and why nothing said is lost, are
// ./voice-recording.ts; this hands them the real microphone and this Mac's
// store, and puts back into the box whatever was kept for it.
import { useEffect, useRef, useState } from 'react';
import { aNoteIsRecording, voiceRecording, type Arrival, type Recorded, type RecordingEnv, type StreamLike, type VoicePhase } from './voice-recording';
import { indexedVoiceStore, listedVoiceStore, memoryVoiceStore, type VoiceDraftStore } from './voice-drafts';

export type { Arrival, Recorded, VoicePhase };

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const pickType = () => (typeof MediaRecorder === 'undefined' ? '' : TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '');

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

let store: VoiceDraftStore | null = null;
const theStore = () => (store ??= listedVoiceStore(typeof indexedDB === 'undefined' ? memoryVoiceStore() : indexedVoiceStore()));
const busy: RecordingEnv['busy'] = { id: null };
export const aVoiceNoteIsRecording = () => aNoteIsRecording(busy);

const browser = (): RecordingEnv => ({
  ask: async () => (await window.zero?.micAccess?.()) ?? 'granted',
  open: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
  makeRecorder: (stream) => {
    const type = pickType();
    return new MediaRecorder(stream as MediaStream, type ? { mimeType: type } : undefined) as unknown as ReturnType<RecordingEnv['makeRecorder']>;
  },
  makeMeter: (stream: StreamLike) => {
    const ctx = new AudioContext();
    const meter = ctx.createAnalyser();
    meter.fftSize = 512;
    ctx.createMediaStreamSource(stream as MediaStream).connect(meter);
    const wave = new Uint8Array(meter.fftSize);
    return {
      level: () => {
        meter.getByteTimeDomainData(wave);
        let peak = 0;
        for (const v of wave) peak = Math.max(peak, Math.abs(v - 128) / 128);
        return peak * 2.2;
      },
      close: () => { if (ctx.state !== 'closed') void ctx.close().catch(() => {}); },
    };
  },
  now: () => Date.now(),
  every: (fn, ms) => window.setInterval(fn, ms),
  clear: (id) => window.clearInterval(id),
  pack: toBase64,
  store: theStore(),
  busy,
  newId: () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`),
});

/** A note taken out of the box is no longer kept. */
export function forgetVoiceDraft(draftId: string | undefined) {
  if (draftId) void theStore().remove(draftId).catch(() => {});
}

// The notes the latest send from each box carried, so an undo brings back
// those and never one sent earlier.
const lastSent = new Map<string, string[]>();
const ids = (list: (string | undefined)[]) => list.filter((id): id is string => !!id);

/**
 * A send from this box went out, carrying these notes (none is fine: it still
 * becomes the latest send). They are no longer offered back to the box, but
 * kept a while (SENT_KEEP_MS) in case the send is undone or turned back.
 */
export function markVoiceSent(key: string, draftIds: (string | undefined)[]) {
  lastSent.set(key, ids(draftIds));
  for (const id of ids(draftIds)) void theStore().sent(id, Date.now()).catch(() => {});
}

/**
 * The latest send from this box was undone or turned back: its notes are the
 * box's again, and so are any the restored draft names.
 */
export async function sendTurnedBack(key: string, draftIds: (string | undefined)[] = []) {
  const back = [...new Set([...(lastSent.get(key) ?? []), ...ids(draftIds)])];
  await Promise.all(back.map((id) => theStore().sent(id, null).catch(() => {})));
}

/** What a box can ask of its recorder from outside the bar. */
export type VoiceControl = {
  recording: () => boolean;
  /** Finish the note being recorded and hand it here rather than to the box. */
  finish: () => Promise<Recorded | null>;
  /** Put back into the box what is kept for it, such as a note whose send was undone. */
  restore: () => Promise<void>;
};

export function useVoiceRecorder({ key, onSay, onDone }: {
  /** The conversation and box the notes belong to. */
  key: string;
  onSay: (text: string) => void;
  /** A note for the box: just recorded, kept from before, or recovered. */
  onDone: (note: Recorded, how: Arrival) => void;
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const said = useRef({ onSay, onDone });
  said.current = { onSay, onDone };
  // Made with the box and set aside with it. Made in the effect, so a second
  // mount (React's strict mode does one) gets a recorder of its own rather
  // than the one the first unmount set aside.
  const rec = useRef<ReturnType<typeof voiceRecording> | null>(null);
  useEffect(() => {
    const r = voiceRecording(browser(), key, {
      phase: setPhase,
      tick: (ms, l) => { setElapsed(ms); setLevels(l); },
      done: (note, how) => said.current.onDone(note, how),
      say: (text) => said.current.onSay(text),
    });
    rec.current = r;
    void r.restore();
    return () => {
      r.dispose();
      if (rec.current === r) rec.current = null;
      // A note set aside by a change of conversation leaves no bar behind.
      setPhase('idle'); setElapsed(0); setLevels([]);
    };
  }, [key]);
  const [actions] = useState(() => ({
    start: () => { void rec.current?.start(); },
    stop: () => rec.current?.stop(),
    cancel: () => rec.current?.cancel(),
    finish: () => rec.current?.finish() ?? Promise.resolve(null),
    recording: () => !!rec.current?.recording(),
    restore: () => rec.current?.restore() ?? Promise.resolve(),
  }));
  return { phase, elapsed, levels, ...actions };
}

// DICTATION IN THE WEB APP: the browser's own speech recognition as the
// dictation controller's speech (dictation.ts), and whether this account may
// use it. On an iPhone, Safari's recogniser is Apple's; the page records nothing.
import { PLANS } from '../../cloud/gateway/plans.mjs';
import type { Speech, SpeechEvents } from './dictation';

type Plans = Record<string, { agents: number }>;
type SettingsRow = { updated_at?: string; settings?: { workspace?: { plan?: unknown } } };

/** True on a paid Agentbox Cloud plan, as the computer heard from most recently read it. */
export function dictationAllowed(rows: SettingsRow[]): boolean {
  const newest = [...rows].sort((a, b) => (Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0))[0];
  const plan = newest?.settings?.workspace?.plan;
  return typeof plan === 'string' && Object.hasOwn(PLANS, plan) && (PLANS as Plans)[plan].agents > 0;
}

let allowed = false;
const listeners = new Set<() => void>();
export const dictationAllowedNow = () => allowed;
export function onDictationAllowed(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setDictationAllowed(next: boolean) {
  if (next === allowed) return;
  allowed = next;
  for (const fn of listeners) fn();
}

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type Win = {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
  navigator?: { language?: string; permissions?: { query(d: { name: string }): Promise<{ state: string }> } };
};

// The browser asks for the microphone once start() is called, so the start
// waits on the person's answer as well as on the recogniser.
const ASKING_MS = 20_000;
// SAFARI ON AN IPHONE ENDS A RECOGNISER ON ITS OWN, mid-sentence and with no
// error, which read as the dictation ending. One that ran a while is started
// again with the words kept; one that ends at once is failing, and stops.
const RESTARTS = 20;
const LIVED_MS = 1000;
// SAFARI ON iOS 27 CAN START A RECOGNISER THAT NEVER HEARS: start fires, then
// no word, error or end (bugs.webkit.org/show_bug.cgi?id=321436). One that has
// heard nothing this long is given up on, with the words kept.
export const DEAF_MS = 8000;

type Timers = { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: any): void };

/** The browser's recogniser as a Speech, or null where it has none. */
export function webSpeech(win: Win, { now = Date.now, timers = globalThis as unknown as Timers }: { now?: () => number; timers?: Timers } = {}): Speech | null {
  const Make = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  if (!Make) return null;
  let on: SpeechEvents | null = null;
  let live: Recognition | null = null;
  let wanted = false;
  let restarts = 0;
  const begin = () => {
    const r = new Make();
    live = r;
    const began = now();
    // What is heard but not yet final, written as final if this one ends early.
    let pending = '';
    let deaf: unknown = null;
    const hears = () => { if (deaf !== null) timers.clearTimeout(deaf); deaf = null; };
    r.lang = win.navigator?.language ?? '';
    r.continuous = true;
    r.interimResults = true;
    r.onstart = () => {
      if (live !== r) return;
      deaf = timers.setTimeout(() => {
        deaf = null;
        if (live !== r || !wanted) return;
        live = null;
        wanted = false;
        on?.error('not-hearing', '');
        r.abort();
      }, DEAF_MS);
      on?.start();
    };
    // Each final result once, and what is still being heard after the last one.
    r.onresult = (e) => {
      if (live !== r) return;
      hears();
      const heard: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) on?.result(res[0].transcript, true);
        else heard.push(res[0].transcript);
      }
      pending = heard.join(' ');
      if (heard.length) on?.result(pending, false);
    };
    r.onerror = (e) => {
      if (live !== r || (e.error === 'aborted' && wanted)) return;
      wanted = false;
      on?.error(e.error, e.message ?? '');
    };
    r.onend = () => {
      hears();
      if (live !== r) return;
      live = null;
      if (wanted && on && restarts < RESTARTS && now() - began >= LIVED_MS) {
        if (pending.trim()) on.result(pending, true);
        restarts += 1;
        try { begin(); return; } catch { /* ends below */ }
      }
      wanted = false;
      on?.end();
    };
    r.onspeechstart = () => { if (live === r) { hears(); on?.level(7); } };
    r.onspeechend = () => { if (live === r) on?.level(0); };
    r.start();
  };
  return {
    onDevice: () => false,
    // Refused here before is said at once; otherwise the browser asks on start.
    async allow() {
      const state = await win.navigator?.permissions?.query({ name: 'microphone' }).then((p) => p.state, () => null);
      return state === 'denied' ? { granted: false, canAskAgain: false } : { granted: true, canAskAgain: true };
    },
    startMs: ASKING_MS,
    start() {
      wanted = true;
      restarts = 0;
      begin();
    },
    stop() { wanted = false; live?.stop(); },
    abort() { wanted = false; live?.abort(); },
    listen(events) {
      on = events;
      return () => { if (on === events) on = null; };
    },
  };
}

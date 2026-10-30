// DICTATION INTO A MESSAGE: what you say is written after what is already in
// the box, as you say it. Stop leaves the words to edit or add to; Send waits
// for the last words and lets the message go. The phone app listens with the
// phone's own models (mobile/src/platform/speech.ts), the web app with the
// browser's (web-speech.ts).

export interface SpeechEvents {
  start(): void;
  /** `text` is the words since the last final result. */
  result(text: string, final: boolean): void;
  error(code: string, message: string): void;
  end(): void;
  level(value: number): void;
}

export interface Speech {
  /** Whether this phone can turn speech into text without sending it anywhere. */
  onDevice(): boolean;
  /** The microphone, and with `speech` the phone maker's speech recognition too. */
  allow(speech: boolean): Promise<{ granted: boolean; canAskAgain: boolean }>;
  start(onDevice: boolean): void;
  /** Ends with the last words, then an end. */
  stop(): void;
  /** Ends now. */
  abort(): void;
  listen(on: SpeechEvents): () => void;
  /** How long a start may take before it is given up on; START_MS unless said. */
  startMs?: number;
}

export type Phase = 'idle' | 'asking' | 'starting' | 'listening' | 'finishing';
export interface Listening { phase: Phase; level: number; problem: string | null; settings: boolean }
interface Timers { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: any): void }

export const START_MS = 5000;
export const FINISH_MS = 2000;
export const IDLE: Listening = { phase: 'idle', level: 0, problem: null, settings: false };

const MIC_SETTINGS = 'Dictation needs the microphone. Allow it in Settings.';
const PROBLEMS: Record<string, string> = {
  'audio-capture': 'Another app is using the microphone.',
  network: 'Dictation needs a connection on this phone.',
  'language-not-supported': 'Dictation does not know this phone\'s language.',
  'service-not-allowed': 'Dictation is not available on this phone.',
  busy: 'Dictation is busy. Try again in a moment.',
  'no-speech': 'Nothing was heard.',
  // The web app's own (web-speech.ts DEAF_MS).
  'not-hearing': 'Nothing was heard. Try the keyboard\'s microphone.',
  interrupted: 'Dictation stopped.',
};

/** Said words after typed ones: one space between, none after a space or a new line. */
export function joinWords(before: string, said: string): string {
  const words = said.trim();
  if (!words) return before;
  if (!before || /\s$/.test(before)) return before + words;
  return `${before} ${words}`;
}

/** The phone's language if the recogniser has it, else the same language as its home country speaks it. */
export function languageFor(phone: string | undefined, offered: readonly string[]): string | undefined {
  if (!phone) return undefined;
  const tag = phone.replace(/_/g, '-').toLowerCase();
  const exact = offered.find((l) => l.replace(/_/g, '-').toLowerCase() === tag);
  if (exact) return exact;
  const lang = tag.split('-')[0];
  const same = offered.filter((l) => l.toLowerCase().split(/[-_]/)[0] === lang);
  const home = (region: string) => same.find((l) => l.toLowerCase().split(/[-_]/)[1] === region);
  return home(lang) ?? home('us') ?? same[0];
}

export type Engine = { engine: 'newer'; lang: string } | { engine: 'keyboard'; download: string | null };

/**
 * Apple's newer model when this phone has it in the phone's language, else the
 * keyboard's. One the phone could have but has not downloaded is downloaded for next time.
 */
export function engineFor(phone: string | undefined, newer: { supported: readonly string[]; installed: readonly string[] } | null): Engine {
  const lang = newer ? languageFor(phone, newer.supported) : undefined;
  if (!newer || !lang) return { engine: 'keyboard', download: null };
  return newer.installed.some((l) => l.toLowerCase() === lang.toLowerCase()) ? { engine: 'newer', lang } : { engine: 'keyboard', download: lang };
}

/** The recogniser's level, -2 to 10 with 0 and under unheard, as 0 to 1. */
export const levelOf = (value: number) => Math.min(1, Math.max(0, value / 10));

// One box listens at a time; the microphone is the phone's, not the box's.
let holder: { leave(): void } | null = null;

/**
 * Whether a box is listening, or asking for the microphone to. Closing the box
 * ends its dictation, so a click away must not close it meanwhile.
 */
export const aBoxIsListening = () => holder !== null;
// Set when a phone that offered to listen on its own wanted speech recognition after all.
let needsSpeech = false;

export function dictation({ speech, box, changed, timers = globalThis as unknown as Timers }: {
  speech: Speech;
  box: { read(): string; write(text: string): void };
  changed: (now: Listening) => void;
  timers?: Timers;
}) {
  let now: Listening = IDLE;
  let before = '';
  let kept: string[] = [];
  let live = '';
  let off: (() => void) | null = null;
  let timer: unknown = null;
  let waiting: (() => void)[] = [];
  let onDevice = false;

  const set = (patch: Partial<Listening>) => { now = { ...now, ...patch }; changed(now); };
  const said = () => [...kept, live].map((s) => s.trim()).filter(Boolean).join(' ');
  const clear = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; };

  // Every way out comes through here: the words stay, the listener goes.
  const end = (problem: string | null = null, settings = false) => {
    clear();
    off?.();
    off = null;
    if (live.trim()) kept.push(live);
    live = '';
    if (holder === me) holder = null;
    set({ phase: 'idle', level: 0, problem, settings });
    const done = waiting;
    waiting = [];
    done.forEach((r) => r());
  };

  const failed = (code: string, message: string) => {
    if (code === 'aborted') return;
    if (code === 'not-allowed') {
      if (onDevice && !needsSpeech && /recogni/i.test(message)) {
        needsSpeech = true;
        return end('Press the microphone again to allow speech recognition.');
      }
      return end(MIC_SETTINGS, true);
    }
    end(PROBLEMS[code] ?? `Dictation stopped: ${message || code}`);
  };

  const events: SpeechEvents = {
    start() {
      if (now.phase !== 'starting') return;
      clear();
      set({ phase: 'listening' });
    },
    result(text, final) {
      if (now.phase === 'idle' || now.phase === 'asking') return;
      if (final) { if (text.trim()) kept.push(text); live = ''; } else live = text;
      box.write(joinWords(before, said()));
    },
    error: failed,
    // While starting, an end with no error is a late one from the box before.
    end() { if (now.phase === 'listening' || now.phase === 'finishing') end(); },
    level(value) { if (now.phase === 'listening') set({ level: levelOf(value) }); },
  };

  const me = {
    get now() { return now; },
    async start() {
      if (now.phase !== 'idle') return;
      if (holder && holder !== me) holder.leave();
      holder = me;
      set({ phase: 'asking', problem: null, settings: false });
      onDevice = speech.onDevice();
      let allowed = { granted: false, canAskAgain: false };
      try { allowed = await speech.allow(!onDevice || needsSpeech); } catch { /* answered as refused */ }
      // Left while the question was up.
      if (me.now.phase !== 'asking') return;
      if (!allowed.granted) return end(MIC_SETTINGS, true);
      before = box.read();
      kept = [];
      live = '';
      off = speech.listen(events);
      set({ phase: 'starting' });
      timer = timers.setTimeout(() => { speech.abort(); end('Dictation did not start. Try again.'); }, speech.startMs ?? START_MS);
      try { speech.start(onDevice); } catch (err) { speech.abort(); end(`Dictation stopped: ${String((err as Error)?.message ?? err)}`); }
    },
    /** Stops listening; resolves once the last words are in the box. */
    finish(): Promise<void> {
      if (now.phase === 'idle') return Promise.resolve();
      if (now.phase === 'asking') { end(); return Promise.resolve(); }
      if (now.phase === 'starting') { speech.abort(); end(); return Promise.resolve(); }
      const done = new Promise<void>((r) => waiting.push(r));
      if (now.phase === 'listening') {
        set({ phase: 'finishing', level: 0 });
        speech.stop();
        timer = timers.setTimeout(() => { speech.abort(); end(); }, FINISH_MS);
      }
      return done;
    },
    stop() { void me.finish(); },
    /** The screen went or the app was put away: off now, with the words heard so far. */
    leave() {
      if (now.phase === 'idle') return;
      if (now.phase !== 'asking') speech.abort();
      end();
    },
  };
  return me;
}

export type Dictation = ReturnType<typeof dictation>;

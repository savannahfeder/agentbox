// A recogniser for the browser preview (EXPO_PUBLIC_PREVIEW=1), which has no
// phone to listen with: it hears a sentence a word at a time, so the screens
// can be drawn while dictating. `window.__dictation.say` and `.upTo` set the
// sentence and how far it gets before it waits; `.refuse` refuses the microphone.
import type { Speech, SpeechEvents } from './dictation';

const SAID = 'Go with the first one, but keep the reason on the row so I can see why it stopped.';

export function previewSpeech(): Speech {
  const set = (globalThis as { __dictation?: { say?: string; upTo?: number; refuse?: boolean } }).__dictation ?? {};
  const words = (set.say ?? SAID).split(' ');
  let on: SpeechEvents | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let heard = 0;
  const later = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)); };
  const quiet = () => { timers.forEach(clearTimeout); timers = []; };
  return {
    onDevice: () => true,
    allow: async () => ({ granted: !set.refuse, canAskAgain: !set.refuse }),
    start() {
      heard = 0;
      later(() => on?.start(), 250);
      const upTo = Math.min(words.length, set.upTo ?? words.length);
      for (let n = 1; n <= upTo; n += 1) {
        later(() => { heard = n; on?.result(words.slice(0, n).join(' '), false); on?.level(3 + 6 * Math.abs(Math.sin(n * 1.7))); }, 250 + n * 160);
      }
    },
    stop() { quiet(); later(() => { on?.result(words.slice(0, heard).join(' '), true); on?.end(); }, 200); },
    abort() { quiet(); later(() => { on?.error('aborted', ''); on?.end(); }, 0); },
    listen(events) { on = events; return () => { if (on === events) on = null; }; },
  };
}

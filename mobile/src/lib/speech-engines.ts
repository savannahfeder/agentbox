// THE PHONE'S TWO SPEECH MODELS AS ONE Speech (renderer/src/dictation.ts): Apple's
// newer one (modules/apple-dictation) where the phone has it, else the
// keyboard's (expo-speech-recognition). Both run on the phone and cost nothing.
import { engineFor, languageFor, type Speech, type SpeechEvents } from '../../../renderer/src/dictation';

type Sub = { remove(): void };
type Allowed = { granted: boolean; canAskAgain: boolean };

export interface KeyboardModel {
  supportsOnDeviceRecognition(): boolean;
  requestPermissionsAsync(): Promise<Allowed>;
  requestMicrophonePermissionsAsync(): Promise<Allowed>;
  getSupportedLocales(options: object): Promise<{ locales: string[]; installedLocales: string[] }>;
  start(options: object): void;
  stop(): void;
  abort(): void;
  addListener(event: string, listener: (e: any) => void): Sub;
}

export interface NewerModel {
  languages(): Promise<{ supported: string[]; installed: string[] }>;
  download(language: string): Promise<void>;
  start(language: string): Promise<void>;
  stop(): void;
  abort(): void;
  addListener(event: string, listener: (e: any) => void): Sub;
}

export function phoneSpeechOf({ keyboard, newer, android, phoneLanguage }: {
  keyboard: KeyboardModel;
  newer: NewerModel | null;
  android: boolean;
  phoneLanguage: () => string | undefined;
}): Speech {
  let keyboardLanguages: Promise<{ locales: string[]; installedLocales: string[] }> | null = null;
  const offered = () => (keyboardLanguages ??= keyboard.getSupportedLocales({}).catch(() => ({ locales: [], installedLocales: [] })));
  // A newer model that failed before hearing a word is not tried again this session.
  let broken = false;
  const newerLanguages = async () => {
    if (!newer || broken) return null;
    try { return await newer.languages(); } catch { return null; }
  };
  // The languages are read before a model starts; a stop or a leave in between
  // must win, or the microphone would come on after the box had gone.
  let asked = 0;
  let active: 'newer' | 'keyboard' | null = null;
  let heard = false;

  const startKeyboard = (onDevice: boolean, { locales, installedLocales }: { locales: string[]; installedLocales: string[] }) => {
    active = 'keyboard';
    const lang = languageFor(phoneLanguage(), locales);
    // Android listens on the phone only in a language it has downloaded.
    const here = onDevice && (!android || (!!lang && installedLocales.includes(lang)));
    keyboard.start({
      ...(lang ? { lang } : {}),
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      requiresOnDeviceRecognition: here,
      iosTaskHint: 'dictation',
      volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
    });
  };

  return {
    onDevice() {
      try { return keyboard.supportsOnDeviceRecognition(); } catch { return false; }
    },
    async allow(speech) {
      const answer = speech ? await keyboard.requestPermissionsAsync() : await keyboard.requestMicrophonePermissionsAsync();
      return { granted: answer.granted, canAskAgain: answer.canAskAgain };
    },
    start(onDevice) {
      const mine = ++asked;
      void Promise.all([offered(), newerLanguages()]).then(([keyboardOffers, newerOffers]) => {
        if (mine !== asked) return;
        const pick = engineFor(phoneLanguage(), newerOffers);
        if (pick.engine === 'keyboard') {
          // Nothing waits on it: it is there for the next press, or it is not.
          if (pick.download) void newer?.download(pick.download).catch(() => {});
          return startKeyboard(onDevice, keyboardOffers);
        }
        active = 'newer';
        heard = false;
        newer!.start(pick.lang).catch(() => {
          if (mine !== asked) return;
          broken = true;
          startKeyboard(onDevice, keyboardOffers);
        });
      });
    },
    stop() {
      asked += 1;
      if (active === 'newer') newer?.stop();
      else if (active === 'keyboard') keyboard.stop();
    },
    abort() {
      asked += 1;
      const was = active;
      active = null;
      if (was === 'newer') newer?.abort();
      else if (was === 'keyboard') keyboard.abort();
    },
    listen(on: SpeechEvents) {
      const only = (engine: 'newer' | 'keyboard') => (fn: (e: any) => void) => (e: any) => { if (active === engine) fn(e); };
      const k = only('keyboard');
      const n = only('newer');
      const subs = [
        keyboard.addListener('start', k(() => on.start())),
        keyboard.addListener('result', k((e) => on.result(e.results?.[0]?.transcript ?? '', e.isFinal))),
        keyboard.addListener('error', k((e) => on.error(e.error, e.message))),
        keyboard.addListener('end', k(() => { active = null; on.end(); })),
        keyboard.addListener('volumechange', k((e) => on.level(e.value))),
        ...(newer ? [
          newer.addListener('onStart', n(() => on.start())),
          newer.addListener('onResult', n((e) => { if (e.text.trim()) heard = true; on.result(e.text, e.isFinal); })),
          newer.addListener('onError', n((e) => { if (!heard && e.code !== 'interrupted') broken = true; on.error(e.code, e.message); })),
          newer.addListener('onEnd', n(() => { active = null; on.end(); })),
          newer.addListener('onLevel', n((e) => on.level(e.value))),
        ] : []),
      ];
      return () => subs.forEach((s) => s.remove());
    },
  };
}

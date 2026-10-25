// THE PHONE APP DICTATES WITH APPLE'S NEWER MODEL WHERE THE PHONE HAS IT.
//
// The first build listened with the model behind the iPhone keyboard's own
// microphone. Apple's page for that model says it "uses the same speech-to-text
// machine learning models as system dictation features", and the keyboard's
// dictation gets your words wrong most of the time. Apple's newer model
// (SpeechAnalyzer, iOS 26) is free and on the phone too, and one independent
// test puts it level with a mid-sized Whisper. So the app now listens with the
// newer model when the phone has it in the phone's language, and with the
// keyboard's model otherwise.
//
// Measured here with stand-ins for both models: which one listens, that only
// the listening one's words reach the box, that a newer model not downloaded
// yet is downloaded for next time while the keyboard's listens now, that a newer
// model that fails falls back to the keyboard's at once and for the rest of the
// session, and that Stop and leaving reach the model that is listening and
// leave no microphone on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { dictation, engineFor } from '../mobile/src/lib/dictation';
import { phoneSpeechOf } from '../mobile/src/lib/speech-engines';

const src = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

function emitter() {
  const subs = new Map();
  return {
    addListener: (name, fn) => {
      const set = subs.get(name) ?? new Set();
      set.add(fn);
      subs.set(name, set);
      return { remove: () => set.delete(fn) };
    },
    emit: (name, e) => { for (const fn of subs.get(name) ?? []) fn(e); },
    listening: () => [...subs.values()].reduce((n, s) => n + s.size, 0),
  };
}

function keyboardModel({ installed = ['en-US'] } = {}) {
  const ev = emitter();
  const m = {
    ...ev,
    on: false,
    calls: [],
    supportsOnDeviceRecognition: () => true,
    requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    requestMicrophonePermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    getSupportedLocales: async () => ({ locales: ['en-GB', 'en-US', 'fr-FR'], installedLocales: installed }),
    start: (o) => { m.calls.push(['start', o]); m.on = true; queueMicrotask(() => ev.emit('start')); },
    stop: () => { m.calls.push(['stop']); m.on = false; queueMicrotask(() => ev.emit('end')); },
    abort: () => { m.calls.push(['abort']); m.on = false; queueMicrotask(() => { ev.emit('error', { error: 'aborted', message: '' }); ev.emit('end'); }); },
    hear: (transcript, isFinal = false) => ev.emit('result', { results: [{ transcript }], isFinal }),
  };
  return m;
}

function newerModel({ supported = ['en-GB', 'en-US'], installed = ['en-US'], startFails = null } = {}) {
  const ev = emitter();
  const m = {
    ...ev,
    on: false,
    calls: [],
    languages: async () => ({ supported, installed }),
    download: async (l) => { m.calls.push(['download', l]); },
    start: async (l) => {
      m.calls.push(['start', l]);
      if (startFails) throw new Error(startFails);
      m.on = true;
      ev.emit('onStart');
    },
    stop: () => { m.calls.push(['stop']); m.on = false; queueMicrotask(() => ev.emit('onEnd')); },
    abort: () => { m.calls.push(['abort']); m.on = false; queueMicrotask(() => ev.emit('onEnd')); },
    hear: (text, isFinal = false) => ev.emit('onResult', { text, isFinal }),
    fail: (code, message = 'it broke') => { m.on = false; ev.emit('onError', { code, message }); ev.emit('onEnd'); },
  };
  return m;
}

function phone({ keyboard = keyboardModel(), newer = newerModel(), language = 'en-US', android = false } = {}) {
  const speech = phoneSpeechOf({ keyboard, newer, android, phoneLanguage: () => language });
  let text = '';
  const states = [];
  const d = dictation({ speech, box: { read: () => text, write: (t) => { text = t; } }, changed: (s) => states.push(s), timers: { setTimeout: () => 0, clearTimeout: () => {} } });
  return { keyboard, newer, d, text: () => text, now: () => states[states.length - 1] };
}

describe('which model listens', () => {
  it('is the newer one in the phone\'s language when it is on the phone', () => {
    expect(engineFor('en-GB', { supported: ['en-GB', 'en-US'], installed: ['en-GB'] })).toEqual({ engine: 'newer', lang: 'en-GB' });
  });

  it('is the keyboard\'s on a phone without the newer one, or a build without it', () => {
    expect(engineFor('en-US', { supported: [], installed: [] })).toEqual({ engine: 'keyboard', download: null });
    expect(engineFor('en-US', null)).toEqual({ engine: 'keyboard', download: null });
  });

  it('is the keyboard\'s while the newer one is not downloaded, which is downloaded for next time', () => {
    expect(engineFor('en-GB', { supported: ['en-GB', 'en-US'], installed: ['en-US'] })).toEqual({ engine: 'keyboard', download: 'en-GB' });
  });

  it('is the keyboard\'s in a language the newer one does not know, downloading nothing', () => {
    expect(engineFor('hi-IN', { supported: ['en-US', 'fr-FR'], installed: ['en-US'] })).toEqual({ engine: 'keyboard', download: null });
  });
});

describe('dictating with the newer model', () => {
  it('writes its words into the box and never starts the keyboard\'s', async () => {
    const p = phone();
    await p.d.start();
    await settle();
    expect(p.newer.calls).toContainEqual(['start', 'en-US']);
    expect(p.keyboard.calls.some(([c]) => c === 'start')).toBe(false);
    expect(p.now().phase).toBe('listening');
    p.newer.hear('Go with the');
    p.newer.hear('Go with the first one.', true);
    p.newer.hear('Thanks');
    expect(p.text()).toBe('Go with the first one. Thanks');
  });

  it('lets only the listening model reach the box', async () => {
    const p = phone();
    await p.d.start();
    await settle();
    p.keyboard.hear('stray words');
    p.keyboard.emit('end');
    expect(p.now().phase).toBe('listening');
    expect(p.text()).toBe('');
  });

  it('Stop goes to the newer model, which ends with the microphone off', async () => {
    const p = phone();
    await p.d.start();
    await settle();
    p.newer.hear('Ship it', true);
    p.d.stop();
    expect(p.newer.calls).toContainEqual(['stop']);
    await settle();
    expect(p.now().phase).toBe('idle');
    expect(p.newer.on).toBe(false);
    expect(p.keyboard.on).toBe(false);
    expect(p.text()).toBe('Ship it');
  });

  it('leaving before the languages are read starts no model at all', async () => {
    let release;
    const keyboard = keyboardModel();
    keyboard.getSupportedLocales = () => new Promise((r) => { release = () => r({ locales: ['en-US'], installedLocales: ['en-US'] }); });
    const p = phone({ keyboard });
    await p.d.start();
    expect(p.now().phase).toBe('starting');
    p.d.leave();
    release();
    await settle();
    expect(p.newer.calls.some(([c]) => c === 'start')).toBe(false);
    expect(p.keyboard.calls.some(([c]) => c === 'start')).toBe(false);
  });
});

describe('falling back to the keyboard\'s model', () => {
  it('listens with it at once when the newer one will not start, and for the rest of the session', async () => {
    const p = phone({ newer: newerModel({ startFails: 'no format' }) });
    await p.d.start();
    await settle();
    expect(p.keyboard.calls.some(([c]) => c === 'start')).toBe(true);
    expect(p.now().phase).toBe('listening');
    p.keyboard.hear('still works');
    expect(p.text()).toBe('still works');
    p.d.stop();
    await settle();
    p.newer.calls.length = 0;
    await p.d.start();
    await settle();
    expect(p.newer.calls.some(([c]) => c === 'start')).toBe(false);
  });

  it('after a newer model fails before any word, but not after one that heard words first', async () => {
    const early = phone();
    await early.d.start();
    await settle();
    early.newer.fail('recognition');
    expect(early.now().problem).toBe('Dictation stopped: it broke');
    early.newer.calls.length = 0;
    await early.d.start();
    await settle();
    expect(early.newer.calls.some(([c]) => c === 'start')).toBe(false);

    const later = phone();
    await later.d.start();
    await settle();
    later.newer.hear('some words', true);
    later.newer.fail('recognition');
    later.newer.calls.length = 0;
    await later.d.start();
    await settle();
    expect(later.newer.calls.some(([c]) => c === 'start')).toBe(true);
  });

  it('downloads the newer model for next time while the keyboard\'s listens now', async () => {
    const p = phone({ newer: newerModel({ installed: [] }) });
    await p.d.start();
    await settle();
    expect(p.newer.calls).toContainEqual(['download', 'en-US']);
    expect(p.keyboard.calls[0][0]).toBe('start');
    expect(p.keyboard.calls[0][1]).toMatchObject({ lang: 'en-US', requiresOnDeviceRecognition: true });
  });

  it('on Android listens on the phone only in a language it has downloaded', async () => {
    const p = phone({ newer: null, android: true, keyboard: keyboardModel({ installed: [] }) });
    await p.d.start();
    await settle();
    expect(p.keyboard.calls[0][1]).toMatchObject({ requiresOnDeviceRecognition: false });
  });
});

describe('the iPhone code', () => {
  const swift = () => src('mobile/modules/apple-dictation/ios/AppleDictationModule.swift');

  it('listens live with the newer model and lets the microphone go on every way out', () => {
    const s = swift();
    expect(s).toMatch(/SpeechTranscriber\(locale: Locale\(identifier: language\), preset: \.progressiveTranscription\)/);
    expect(s).toMatch(/finalizeAndFinishThroughEndOfInput\(\)/);
    expect(s).toMatch(/cancelAndFinishNow\(\)/);
    expect(s).toMatch(/removeTap\(onBus: 0\)/);
    expect(s).toMatch(/AVAudioSession\.interruptionNotification/);
    // Stop, abort and the end of results all release it.
    expect(s.match(/releaseMicrophone\(\)/g).length).toBeGreaterThanOrEqual(4);
  });

  it('loads on iPhones before iOS 26, and the app runs where the module is missing', () => {
    expect(swift()).toMatch(/private var live: AnyObject\?/);
    expect(swift()).toMatch(/@available\(iOS 26\.0, \*\)\nfinal class LiveDictation/);
    expect(src('mobile/modules/apple-dictation/index.ts')).toMatch(/requireOptionalNativeModule/);
    expect(src('mobile/src/platform/speech.ts')).toMatch(/phoneSpeechOf\(/);
  });
});

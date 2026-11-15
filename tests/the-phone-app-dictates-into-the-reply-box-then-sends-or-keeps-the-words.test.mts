// THE PHONE APP DICTATES INTO THE REPLY BOX, THEN SENDS OR KEEPS THE WORDS.
//
// Asked for on 2026-10-24: a microphone in the phone app's reply box, the words
// appearing as you talk, and while it listens two choices, as Claude's app
// gives: Send, which sends what you said, and Stop, which leaves the words in
// the box to edit, add a picture to, or talk more after. The phone app had no
// way to talk at all.
//
// Measured here with a stand-in for the phone's recogniser that counts whether
// the microphone is on: where the words land and how they join what was typed,
// that Stop and Send each end with the microphone off and the words in the
// box, that Send waits for the last words but not for ever, that a start that
// never begins and every other way out also turn it off, that a refusal says
// how to fix it, and that the voice is turned into text on the phone whenever
// the phone can do that. The last part reads the two screens, the app's
// permission wording and the privacy policy.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { dictation, joinWords, languageFor, levelOf, START_MS, FINISH_MS } from '../renderer/src/dictation';

const src = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// A recogniser that does what the phone's does: events after start, the last
// words and an end after stop, an "aborted" error and an end after abort.
function phone({ onDevice = true, mic = { granted: true, canAskAgain: true }, startsBy = 'start' } = {}) {
  const calls = [];
  let handlers = null;
  const listeners = new Set();
  const timers = new Map();
  let clock = 0;
  let next = 1;
  const p = {
    on: false,
    calls,
    listeners,
    speech: {
      onDevice: () => onDevice,
      allow: async (speech) => { calls.push(speech ? 'allow mic+speech' : 'allow mic'); return mic; },
      start: (here) => { calls.push(`start${here ? ' on the phone' : ''}`); p.on = true; if (startsBy === 'start') queueMicrotask(() => handlers?.start()); },
      stop: () => { calls.push('stop'); },
      abort: () => { calls.push('abort'); p.on = false; queueMicrotask(() => { handlers?.error('aborted', 'Speech recognition aborted.'); handlers?.end(); }); },
      listen: (on) => { const h = { ...on }; handlers = h; listeners.add(h); return () => { listeners.delete(h); if (handlers === h) handlers = null; }; },
    },
    timers: {
      setTimeout: (fn, ms) => { const id = next++; timers.set(id, { fn, at: clock + ms }); return id; },
      clearTimeout: (id) => { timers.delete(id); },
    },
    pass(ms) {
      clock += ms;
      for (const [id, t] of [...timers]) if (t.at <= clock) { timers.delete(id); t.fn(); }
    },
    hear: (text, final = false) => handlers?.result(text, final),
    level: (v) => handlers?.level(v),
    fail: (code, message = '') => { p.on = false; handlers?.error(code, message); handlers?.end(); },
    // The phone gives its last words, then ends, as it does after stop.
    finish: (text) => { if (text) handlers?.result(text, true); p.on = false; handlers?.end(); },
  };
  return p;
}

function box(text = '') {
  const seen = [];
  return { seen, get text() { return text; }, read: () => text, write: (t) => { text = t; seen.push(t); } };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

async function listening(opts = {}, typed = '') {
  const p = phone(opts);
  const b = box(typed);
  const states = [];
  const d = dictation({ speech: p.speech, box: b, changed: (s) => states.push(s), timers: p.timers });
  await d.start();
  await settle();
  return { p, b, d, states, now: () => states[states.length - 1] };
}

describe('the words', () => {
  it('appear as they are said, after what was typed, with one space between', async () => {
    const { p, b, now } = await listening({}, 'Fix the login');
    expect(now().phase).toBe('listening');
    p.hear('and the');
    expect(b.text).toBe('Fix the login and the');
    p.hear('and the tests');
    expect(b.text).toBe('Fix the login and the tests');
    p.hear('and the tests.', true);
    p.hear(' Then ship it');
    expect(b.text).toBe('Fix the login and the tests. Then ship it');
  });

  it('start a box of their own, or a new line, without a space before them', () => {
    expect(joinWords('', 'Ship it')).toBe('Ship it');
    expect(joinWords('First this\n', 'then that')).toBe('First this\nthen that');
    expect(joinWords('Ends in a space ', ' then more')).toBe('Ends in a space then more');
    expect(joinWords('Typed', '')).toBe('Typed');
    expect(joinWords('Typed', '   ')).toBe('Typed');
  });
});

describe('Stop', () => {
  it('leaves the words in the box and turns the microphone off', async () => {
    const { p, b, d, now } = await listening({}, 'Look at');
    p.hear('the second option');
    d.stop();
    expect(p.calls).toContain('stop');
    expect(now().phase).toBe('finishing');
    p.finish('the second option please');
    expect(now().phase).toBe('idle');
    expect(p.on).toBe(false);
    expect(p.listeners.size).toBe(0);
    expect(b.text).toBe('Look at the second option please');
  });

  it('then the microphone again adds after them', async () => {
    const { p, b, d } = await listening({}, 'One');
    p.hear('two', true);
    d.stop();
    p.finish();
    await d.start();
    await settle();
    p.hear('three');
    expect(b.text).toBe('One two three');
  });

  it('before a word is heard leaves the box as it was', async () => {
    const { p, b, d, now } = await listening({}, 'Typed only');
    d.stop();
    p.finish();
    expect(now().phase).toBe('idle');
    expect(b.text).toBe('Typed only');
    expect(b.seen).toEqual([]);
  });

  it('does not wait for ever for the phone to end: the words heard so far stay', async () => {
    const { p, b, d, now } = await listening();
    p.hear('half a sentence');
    d.stop();
    p.pass(FINISH_MS - 1);
    expect(now().phase).toBe('finishing');
    p.pass(1);
    expect(p.calls).toContain('abort');
    expect(p.on).toBe(false);
    expect(now().phase).toBe('idle');
    expect(b.text).toBe('half a sentence');
  });
});

describe('Send', () => {
  it('waits for the last words before it lets the send go', async () => {
    const { p, b, d } = await listening({}, 'Please');
    p.hear('ship');
    let done = false;
    const sent = d.finish().then(() => { done = true; });
    await settle();
    expect(done).toBe(false);
    p.finish('ship it');
    await sent;
    expect(b.text).toBe('Please ship it');
    expect(p.on).toBe(false);
  });

  it('goes after a deadline with what was heard when the phone never ends', async () => {
    const { p, b, d } = await listening();
    p.hear('send this');
    const sent = d.finish();
    p.pass(FINISH_MS);
    await sent;
    expect(b.text).toBe('send this');
    expect(p.on).toBe(false);
  });
});

describe('every way out turns the microphone off', () => {
  it('a start that never begins gives up and says so', async () => {
    const { p, now } = await listening({ startsBy: 'never' });
    expect(now().phase).toBe('starting');
    p.pass(START_MS);
    expect(p.calls).toContain('abort');
    expect(p.on).toBe(false);
    expect(now()).toMatchObject({ phase: 'idle', problem: 'Dictation did not start. Try again.' });
  });

  it('leaving the screen or putting the app away keeps the words heard so far', async () => {
    const { p, b, d, now } = await listening({}, 'Keep');
    p.hear('these words');
    d.leave();
    expect(p.on).toBe(false);
    expect(p.listeners.size).toBe(0);
    expect(now().phase).toBe('idle');
    expect(b.text).toBe('Keep these words');
    await settle();
    expect(now().problem).toBe(null);
  });

  it('leaving while the permission is being asked never starts it', async () => {
    const p = phone();
    let answer;
    p.speech.allow = () => new Promise((r) => { answer = r; });
    const states = [];
    const d = dictation({ speech: p.speech, box: box(), changed: (s) => states.push(s), timers: p.timers });
    const going = d.start();
    expect(states.at(-1).phase).toBe('asking');
    d.leave();
    answer({ granted: true, canAskAgain: true });
    await going;
    expect(p.calls.some((c) => c.startsWith('start'))).toBe(false);
    expect(p.on).toBe(false);
  });

  it('a second box taking the microphone stops the first, which keeps its words', async () => {
    const first = await listening({}, 'First');
    first.p.hear('box');
    const second = dictation({ speech: first.p.speech, box: box(), changed: () => {}, timers: first.p.timers });
    await second.start();
    expect(first.now().phase).toBe('idle');
    expect(first.b.text).toBe('First box');
    expect(first.p.listeners.size).toBe(1);
  });

  it('a phone that stops by itself, after a call or a long silence, keeps the words', async () => {
    const { p, b, now } = await listening();
    p.hear('before the call');
    p.fail('interrupted', 'Audio session was interrupted');
    expect(p.on).toBe(false);
    expect(now()).toMatchObject({ phase: 'idle', problem: 'Dictation stopped.' });
    expect(b.text).toBe('before the call');
  });
});

describe('a refusal or a failure says why', () => {
  it('a refused microphone points to Settings and never starts', async () => {
    const { p, now } = await listening({ mic: { granted: false, canAskAgain: false } });
    expect(p.calls.some((c) => c.startsWith('start'))).toBe(false);
    expect(now()).toMatchObject({ phase: 'idle', settings: true, problem: 'Dictation needs the microphone. Allow it in Settings.' });
  });

  it('each failure is named, and the app\'s own abort says nothing', async () => {
    for (const [code, words] of [
      ['audio-capture', 'Another app is using the microphone.'],
      ['network', 'Dictation needs a connection on this phone.'],
      ['language-not-supported', 'Dictation does not know this phone\'s language.'],
      ['service-not-allowed', 'Dictation is not available on this phone.'],
      ['no-speech', 'Nothing was heard.'],
      ['something-new', 'Dictation stopped: it broke'],
    ]) {
      const { p, now } = await listening();
      p.fail(code, 'it broke');
      expect(now().problem).toBe(words);
      expect(p.on).toBe(false);
    }
    const { d, now } = await listening();
    d.leave();
    await settle();
    expect(now().problem).toBe(null);
  });
});

describe('the voice stays on the phone when the phone can do it', () => {
  it('asks only for the microphone and listens on the phone', async () => {
    const { p } = await listening({ onDevice: true });
    expect(p.calls.slice(0, 2)).toEqual(['allow mic', 'start on the phone']);
  });

  it('asks for speech recognition as well where the phone cannot', async () => {
    const { p } = await listening({ onDevice: false });
    expect(p.calls.slice(0, 2)).toEqual(['allow mic+speech', 'start']);
  });

  it('asks for speech recognition on the next press if the phone wanted it after all', async () => {
    const { p, d, now } = await listening({ onDevice: true });
    p.fail('not-allowed', 'Not authorized to recognize speech');
    expect(now().problem).toBe('Press the microphone again to allow speech recognition.');
    p.calls.length = 0;
    await d.start();
    expect(p.calls[0]).toBe('allow mic+speech');
  });

  it('listens in the phone\'s own language when the phone offers it', () => {
    expect(languageFor('en-GB', ['en-AU', 'en-GB', 'en-US'])).toBe('en-GB');
    expect(languageFor('fr-BE', ['en-US', 'fr-CA', 'fr-FR'])).toBe('fr-FR');
    expect(languageFor('fr', ['en-US', 'fr-FR'])).toBe('fr-FR');
    expect(languageFor('en-XX', ['en-AU', 'en-GB', 'en-US'])).toBe('en-US');
    expect(languageFor('en_GB', ['en-GB'])).toBe('en-GB');
    expect(languageFor('xx-YY', ['en-US'])).toBe(undefined);
    expect(languageFor(undefined, ['en-US'])).toBe(undefined);
  });

  it('draws the level the phone hears between nothing and full', () => {
    expect(levelOf(-2)).toBe(0);
    expect(levelOf(0)).toBe(0);
    expect(levelOf(5)).toBe(0.5);
    expect(levelOf(12)).toBe(1);
  });
});

describe('the screens, the wording and the policy', () => {
  const thread = () => src('mobile/src/app/thread/[product]/[id].tsx');
  const ui = () => src('mobile/src/ui/Dictation.tsx');
  // The New thread page and the empty inbox share one form.
  const newThread = () => src('mobile/src/app/new.tsx') + src('mobile/src/ui/NewThreadForm.tsx');

  it('a thread and a new thread both have the microphone', () => {
    for (const screen of [thread(), newThread()]) {
      expect(screen).toMatch(/useDictation\(/);
      expect(screen).toMatch(/<MicButton\b/);
      expect(screen).toMatch(/<Listening\b/);
    }
  });

  it('while it listens, the reply box offers Stop and Send and not the agent\'s Stop', () => {
    expect(ui()).toContain('"Stop dictating"');
    expect(ui()).toContain('"Send what you said"');
    expect(thread()).toMatch(/talk\.on \? \(\s*<Listening talk=\{talk\}/);
    // The new thread's own Send, at the top, waits for the last words too.
    expect(newThread()).toMatch(/talk\.on \? talk\.send\(\) : void send\(\)/);
  });

  it('lets go of the microphone when the screen is left or the app is put away', () => {
    expect(ui()).toMatch(/useFocusEffect/);
    expect(ui()).toMatch(/AppState\.addEventListener\('change'/);
    expect(ui()).toMatch(/\.leave\(\)/);
  });

  it('tells Apple what the microphone and speech recognition are for, and keeps the microphone line', async () => {
    const { default: config } = await import('../mobile/app.config.ts');
    const options = (name) => config.plugins.find((p) => Array.isArray(p) && p[0] === name)?.[1];
    const speech = options('expo-speech-recognition');
    expect(speech.microphonePermission).toMatch(/only while you dictate/);
    expect(speech.speechRecognitionPermission).toMatch(/iPhone does this itself when it can/);
    expect(speech.speechRecognitionPermission).toMatch(/Apple's speech recognition/);
    // The image picker's `false` deletes the microphone line and blocks the microphone on Android.
    expect(options('expo-image-picker').microphonePermission).toBe(speech.microphonePermission);
    expect(JSON.parse(src('mobile/package.json')).dependencies['expo-speech-recognition']).toMatch(/^~58\./);
  });

  it('the privacy policy says where your voice goes', () => {
    const policy = src('phone-legal/privacy.html');
    expect(policy).toMatch(/Dictation/);
    expect(policy).toMatch(/on your iPhone/);
    expect(policy).toMatch(/Apple/);
  });
});

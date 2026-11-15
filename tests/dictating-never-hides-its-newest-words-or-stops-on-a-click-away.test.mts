// DICTATING NEVER HIDES ITS NEWEST WORDS OR STOPS ON A CLICK AWAY.
//
// Speaking a message into the web app's reply box: "it doesn't auto-scroll. If
// your voice note extends past the size of the box, it will not be visible. It
// just gets cut off at the bottom." And a click outside the box closed it,
// which ends the dictation mid-sentence. Measured on the built app with a
// stand-in speech recogniser, 30 sentences said:
//   reply box, phone size     985px of the words below the box, sentence 6 the last one shown
//   reply box, 1440x900       216px below the box
//   new-thread box, 1440x900  443px below the box
//   a click on the conversation closed the reply box and stopped listening;
//   a click on the new-thread backdrop closed it and stopped listening.
// Dictation writes the box from code, and a value written by code does not
// move a box's view; the click-away folds never asked whether a box was
// listening. Now the box is scrolled to its end after each dictated write, and
// neither fold, nor the backdrop, closes a box that is listening.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { aBoxIsListening, dictation } from '../renderer/src/dictation';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

// A recogniser that answers at once, and timers that fire only when told to.
function fakeSpeech({ granted = true, startThrows = false, slowAllow = false } = {}) {
  let on = null;
  let answer = null;
  const s = {
    onDevice: () => false,
    allow: () => (slowAllow ? new Promise((r) => { answer = () => r({ granted, canAskAgain: true }); }) : Promise.resolve({ granted, canAskAgain: true })),
    start() { if (startThrows) throw new Error('no recogniser'); queueMicrotask(() => on?.start()); },
    stop() { queueMicrotask(() => on?.end()); },
    abort() { queueMicrotask(() => { on?.error('aborted', ''); on?.end(); }); },
    listen(events) { on = events; return () => { on = null; }; },
    hear: (text, final) => on?.result(text, final),
    answer: () => answer?.(),
  };
  return s;
}
function timers() {
  const due = new Map();
  let n = 0;
  return { setTimeout: (fn) => { n += 1; due.set(n, fn); return n; }, clearTimeout: (id) => { due.delete(id); }, fire: () => { const all = [...due.values()]; due.clear(); all.forEach((fn) => fn()); } };
}
function box() {
  let text = '';
  return { read: () => text, write: (t) => { text = t; }, get text() { return text; } };
}
const make = (speech, t = timers()) => ({ ctl: dictation({ speech, box: box(), changed: () => {}, timers: t }), t });

describe('a box counts as listening from the mic press until it stops', () => {
  it('is off when nothing has been pressed', () => {
    make(fakeSpeech());
    expect(aBoxIsListening()).toBe(false);
  });

  it('is on while the microphone is asked for, while starting, and while listening', async () => {
    const speech = fakeSpeech({ slowAllow: true });
    const { ctl } = make(speech);
    void ctl.start();
    expect(ctl.now.phase).toBe('asking');
    expect(aBoxIsListening()).toBe(true);
    speech.answer();
    await settle();
    expect(ctl.now.phase).toBe('listening');
    expect(aBoxIsListening()).toBe(true);
    speech.hear('hello there', true);
    expect(aBoxIsListening()).toBe(true);
    ctl.leave();
  });

  it('stays on while the last words are being finished, and goes off once they are in', async () => {
    const speech = fakeSpeech();
    const { ctl } = make(speech);
    await ctl.start();
    await settle();
    const done = ctl.finish();
    expect(ctl.now.phase).toBe('finishing');
    expect(aBoxIsListening()).toBe(true);
    await done;
    expect(aBoxIsListening()).toBe(false);
  });

  it('is off after Stop, after leaving, and after the box is left while asking', async () => {
    const a = make(fakeSpeech());
    await a.ctl.start();
    await settle();
    a.ctl.stop();
    await settle();
    expect(aBoxIsListening()).toBe(false);

    const b = make(fakeSpeech());
    await b.ctl.start();
    await settle();
    b.ctl.leave();
    expect(aBoxIsListening()).toBe(false);

    const slow = fakeSpeech({ slowAllow: true });
    const c = make(slow);
    void c.ctl.start();
    c.ctl.leave();
    expect(aBoxIsListening()).toBe(false);
    slow.answer();
    await settle();
    expect(aBoxIsListening()).toBe(false);
  });

  it('is off when the microphone is refused, the recogniser will not start, or never answers', async () => {
    const refused = make(fakeSpeech({ granted: false }));
    await refused.ctl.start();
    expect(aBoxIsListening()).toBe(false);

    const broken = make(fakeSpeech({ startThrows: true }));
    await broken.ctl.start();
    expect(aBoxIsListening()).toBe(false);

    const silent = { ...fakeSpeech(), start() {} };
    const quiet = make(silent);
    await quiet.ctl.start();
    expect(aBoxIsListening()).toBe(true);
    quiet.t.fire();
    expect(aBoxIsListening()).toBe(false);
  });

  it('stays on when a second box takes the microphone from the first', async () => {
    const first = make(fakeSpeech());
    const second = make(fakeSpeech());
    await first.ctl.start();
    await settle();
    await second.ctl.start();
    await settle();
    expect(first.ctl.now.phase).toBe('idle');
    expect(aBoxIsListening()).toBe(true);
    second.ctl.leave();
    expect(aBoxIsListening()).toBe(false);
  });
});

// The fold's handler, from where it starts to where its effect closes.
const handler = (text, opening, closing) => {
  const from = text.indexOf(opening);
  expect(from).toBeGreaterThan(-1);
  return text.slice(from, text.indexOf(closing, from) + closing.length);
};

describe('a click away leaves a listening box open', () => {
  const app = read('renderer/src/App.tsx');

  it('clicking nothing does not fold the reply box while it listens, and still folds it otherwise', () => {
    const away = handler(app, "if (modal !== 'reply') return;\n    const away", '}, [modal]);');
    const asks = away.indexOf('if (aVoiceNoteIsRecording() || aBoxIsListening()) return;');
    expect(asks).toBeGreaterThan(-1);
    expect(away.indexOf('setModal(null);')).toBeGreaterThan(asks);
  });

  it('a click away over a full-screen document does not fold it either', () => {
    const fold = handler(app, "if (!fullScreenDoc || modal !== 'reply') return;", '}, [fullScreenDoc, modal]);');
    expect(fold).toContain('const foldBack = () => { if (!aVoiceNoteIsRecording() && !aBoxIsListening()) setModal(null); };');
    expect(app).toMatch(/import \{ aBoxIsListening \} from '\.\/dictation';/);
  });

  it('the new-thread box\'s backdrop does not close it while it listens', () => {
    const composer = read('renderer/src/threads/ThreadComposer.tsx');
    expect(composer).toContain('<div className="modal-backdrop tc-veil" onClick={() => { if (!talk.on) onClose(); }}>{box}</div>');
    expect(composer).not.toContain('<div className="modal-backdrop tc-veil" onClick={onClose}>');
  });
});

describe('the newest words stay in view', () => {
  const hook = read('renderer/src/components/WebDictation.tsx');

  it('marks each dictated write, and scrolls the box to its end once it is drawn', () => {
    expect(hook).toMatch(/write: \(text\) => \{ wrote\.current = true; latest\.current\.setText\(text\); \}/);
    const effect = hook.slice(hook.indexOf('if (!wrote.current) return;'));
    expect(effect.slice(0, 200)).toMatch(/wrote\.current = false;[\s\S]*field\.scrollTop = field\.scrollHeight;/);
  });

  it('scrolls after the reply box has grown to fit the words, not before', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    const grows = focus.indexOf('applyDockHeight(ref.current);\n  });');
    const listens = focus.indexOf('const talk = useWebDictation(');
    expect(grows).toBeGreaterThan(-1);
    expect(listens).toBeGreaterThan(grows);
  });
});

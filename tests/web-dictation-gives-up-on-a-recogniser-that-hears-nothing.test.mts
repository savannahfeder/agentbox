// What broke (w-af3179c7ce, 2026-10-28): "Even when you talk nothing is going
// to be added to the input field" in the web app on an iPhone. Safari on iOS 27
// starts recognisers that hear nothing: start fires, then no word, no error and
// no end (bugs.webkit.org/show_bug.cgi?id=321436, every one after the first
// since a home-screen app opened, on iOS 27.2). The box showed Listening for
// ever while the words went nowhere, and a recogniser Safari ended on its own
// was started again as one of those. Measured here with a stand-in recogniser
// and a hand-turned clock: one that hears nothing for DEAF_MS is given up on,
// with the words already in the box kept and a note saying what to do.
import { describe, it, expect } from 'vitest';
import { DEAF_MS, webSpeech } from '../renderer/src/web-speech';
import { dictation } from '../renderer/src/dictation';

const NOTE = "Nothing was heard. Try the keyboard's microphone.";

function clock() {
  let t = 0;
  let next = 1;
  const due = new Map();
  return {
    now: () => t,
    timers: {
      setTimeout: (fn, ms) => { due.set(next, { at: t + ms, fn }); return next++; },
      clearTimeout: (id) => { due.delete(id); },
    },
    pass(ms) {
      const until = t + ms;
      for (;;) {
        const [id, first] = [...due.entries()].filter(([, d]) => d.at <= until).sort((a, b) => a[1].at - b[1].at)[0] ?? [];
        if (!first) break;
        due.delete(id);
        t = first.at;
        first.fn();
      }
      t = until;
    },
  };
}

function browser() {
  const made = [];
  class Recognition {
    constructor() { made.push(this); this.calls = []; }
    start() { this.calls.push('start'); }
    stop() { this.calls.push('stop'); }
    abort() { this.calls.push('abort'); }
  }
  return { win: { webkitSpeechRecognition: Recognition, navigator: { language: 'en-US' } }, made };
}
const result = (parts, from = 0) => ({ resultIndex: from, results: parts.map(([text, isFinal]) => Object.assign([{ transcript: text }], { isFinal })) });

async function listening(typed = '') {
  const c = clock();
  const { win, made } = browser();
  let text = typed;
  const ctl = dictation({ speech: webSpeech(win, c), box: { read: () => text, write: (t) => { text = t; } }, changed: () => {}, timers: c.timers });
  await ctl.start();
  made[0].onstart();
  return { c, ctl, made, box: () => text };
}

describe('the web app gives up on a recogniser that hears nothing', () => {
  it('ends with a note once one has heard nothing for DEAF_MS, and not a moment before', async () => {
    const { c, ctl, made } = await listening();
    c.pass(DEAF_MS - 1);
    expect(ctl.now.phase).toBe('listening');
    c.pass(1);
    expect(ctl.now.phase).toBe('idle');
    expect(ctl.now.problem).toBe(NOTE);
    expect(made[0].calls).toContain('abort');
    // Its late "aborted" and end change nothing.
    made[0].onerror({ error: 'aborted', message: 'No speech detected' });
    made[0].onend();
    expect(ctl.now.problem).toBe(NOTE);
    expect(made).toHaveLength(1);
  });

  it('keeps what was typed before', async () => {
    const { c, ctl, box } = await listening('Please');
    c.pass(DEAF_MS);
    expect(ctl.now.phase).toBe('idle');
    expect(box()).toBe('Please');
  });

  it('leaves one that heard words alone, however long the person then thinks', async () => {
    const { c, ctl, made, box } = await listening();
    c.pass(DEAF_MS - 1);
    made[0].onresult(result([['one thought', true]]));
    c.pass(DEAF_MS * 3);
    expect(ctl.now.phase).toBe('listening');
    made[0].onresult(result([['one thought', true], ['then another', true]], 1));
    expect(box()).toBe('one thought then another');
  });

  it('counts the start of speech as heard, before any words come', async () => {
    const { c, ctl, made } = await listening();
    c.pass(1000);
    made[0].onspeechstart();
    c.pass(DEAF_MS * 2);
    expect(ctl.now.phase).toBe('listening');
  });

  it('gives up on one started again after Safari ended the last, keeping the words from before', async () => {
    const { c, ctl, made, box } = await listening();
    made[0].onresult(result([['the first half', false]]));
    c.pass(3000);
    made[0].onend();
    expect(made).toHaveLength(2);
    made[1].onstart();
    c.pass(DEAF_MS - 1);
    expect(ctl.now.phase).toBe('listening');
    c.pass(1);
    expect(ctl.now.phase).toBe('idle');
    expect(ctl.now.problem).toBe(NOTE);
    expect(box()).toBe('the first half');
    expect(made[1].calls).toContain('abort');
  });

  it('says nothing after Stop, or after the person typed', async () => {
    const stopped = await listening();
    const done = stopped.ctl.finish();
    stopped.made[0].onend();
    await done;
    stopped.c.pass(DEAF_MS * 2);
    expect(stopped.ctl.now).toMatchObject({ phase: 'idle', problem: null });

    const typed = await listening();
    typed.ctl.leave();
    typed.c.pass(DEAF_MS * 2);
    expect(typed.ctl.now).toMatchObject({ phase: 'idle', problem: null });
  });
});

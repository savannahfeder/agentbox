// What broke: "dictation doesn't work. The moment the keyboard comes up it
// cuts it off" (w-c187f19b37, 2026-10-28, the web app on an iPhone). Measured
// in WebKit at an iPhone's size with a stand-in recogniser and keyboard: the
// reply box stopped the microphone the moment it took the cursor, so tapping
// it to see or fix a word ended the dictation. And Safari on an iPhone ends a
// recogniser on its own, which the page took as the end of the dictation.
// Now the box takes the cursor and the microphone keeps listening; typing is
// what stops it, so typed and spoken words never write over each other; and a
// recogniser Safari ends is started again with the words kept, a bounded
// number of times.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { webSpeech } from '../renderer/src/web-speech';
import { dictation } from '../renderer/src/dictation';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
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
const noTimers = { setTimeout: () => 0, clearTimeout: () => {} };

async function listening({ clock }) {
  const { win, made } = browser();
  let text = 'Fix';
  const ctl = dictation({ speech: webSpeech(win, { now: () => clock.t }), box: { read: () => text, write: (t) => { text = t; } }, changed: () => {}, timers: noTimers });
  await ctl.start();
  made[0].onstart();
  return { ctl, made, box: () => text };
}

describe('the web app keeps listening when Safari ends the recogniser on its own', () => {
  it('starts a new one and keeps every word, the half-heard ones too', async () => {
    const clock = { t: 0 };
    const { ctl, made, box } = await listening({ clock });
    made[0].onresult(result([['the picture', false]]));
    clock.t = 3000;
    made[0].onend();
    expect(made).toHaveLength(2);
    expect(made[1].calls).toEqual(['start']);
    expect(ctl.now.phase).toBe('listening');
    made[1].onstart();
    made[1].onresult(result([['on the web', false]]));
    expect(box()).toBe('Fix the picture on the web');
    made[1].onresult(result([['on the web', true]]));
    expect(box()).toBe('Fix the picture on the web');
  });

  it('does not take an abort it did not ask for as the end', async () => {
    const clock = { t: 0 };
    const { ctl, made } = await listening({ clock });
    clock.t = 2000;
    made[0].onerror({ error: 'aborted' });
    made[0].onend();
    expect(made).toHaveLength(2);
    expect(ctl.now.phase).toBe('listening');
  });

  it('stops when one ends as soon as it starts, rather than starting over and over', async () => {
    const clock = { t: 0 };
    const { ctl, made } = await listening({ clock });
    clock.t = 400;
    made[0].onend();
    expect(made).toHaveLength(1);
    expect(ctl.now.phase).toBe('idle');
  });

  it('stops after twenty starts in one dictation', async () => {
    const clock = { t: 0 };
    const { ctl, made } = await listening({ clock });
    for (let i = 0; i < 25 && ctl.now.phase === 'listening'; i += 1) {
      clock.t += 5000;
      made[made.length - 1].onend();
    }
    expect(made).toHaveLength(21);
    expect(ctl.now.phase).toBe('idle');
  });

  it('ends for good when the person stops it or something goes wrong', async () => {
    const clock = { t: 0 };
    const stopped = await listening({ clock });
    clock.t = 5000;
    const done = stopped.ctl.finish();
    expect(stopped.made[0].calls).toContain('stop');
    stopped.made[0].onend();
    await done;
    expect(stopped.made).toHaveLength(1);
    expect(stopped.ctl.now.phase).toBe('idle');

    const failed = await listening({ clock });
    clock.t = 15000;
    failed.made[0].onerror({ error: 'audio-capture', message: '' });
    failed.made[0].onend();
    expect(failed.made).toHaveLength(1);
    expect(failed.ctl.now.problem).toBe('Another app is using the microphone.');
  });

  it('takes no notice of a recogniser from before that ends late', async () => {
    const clock = { t: 0 };
    const { ctl, made } = await listening({ clock });
    clock.t = 3000;
    made[0].onend();
    made[0].onend();
    expect(made).toHaveLength(2);
    expect(ctl.now.phase).toBe('listening');
  });
});

describe('the reply box and the New thread box', () => {
  for (const file of ['renderer/src/components/Focus.tsx', 'renderer/src/threads/ThreadComposer.tsx']) {
    it(`${file}: taking the cursor does not stop it, typing does`, () => {
      const src = read(file);
      expect(src).not.toMatch(/onFocus=\{\(\) => \{ if \(talk\.on\) talk\.stop\(\); \}\}/);
      expect(src).toMatch(/onChange=\{\(e\) => \{ talk\.typed\(\);/);
    });
  }

  it('typing stops it with the words it already wrote, and writes no more', () => {
    const ui = read('renderer/src/components/WebDictation.tsx');
    expect(ui).toMatch(/typed: \(\) => \{ if \(ctl\?\.now\.phase !== 'idle'\) ctl\?\.leave\(\); \}/);
  });
});

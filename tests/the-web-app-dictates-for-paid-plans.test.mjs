// THE WEB APP DICTATES, FOR PAID PLANS.
//
// What was asked (the founder, 2026-10-26, for the launch video): voice
// dictation in the web app "for pro users specifically", as the phone app has
// it (w-81bdea1efa): a microphone in the reply box and the New thread box, a
// Listening row with Stop and Send, Stop keeping the words to edit, Send
// sending them. The web app listens with the browser's own speech recognition
// (Safari on an iPhone: Apple's). It knows the plan from the copy of settings
// a computer already sends (shared/phone-settings.mjs), which now carries the
// Agentbox Cloud plan that computer last read; pro, plus and max are paid.
// The site's own header refused every page the microphone, so it now allows
// the page itself. Measured here on the pieces: the plan's way from the
// computer to the page, the header, the browser's recogniser driving the phone
// app's own dictation controller (a refused microphone said before listening,
// and time for the browser's question), and the two boxes drawing the
// microphone only when it is allowed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../main/config.mjs';
import { readSettings } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { phoneSettingsOf } from '../shared/phone-settings.mjs';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';
import { dictationAllowed, webSpeech } from '../renderer/src/web-speech';
import { dictation } from '../renderer/src/dictation';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const row = (plan, at) => ({ device: '0a1b2c3d4e5f', name: 'Mac', updated_at: new Date(at).toISOString(), settings: { v: 1, workspace: { plan } } });

describe('the plan, from the computer to the web app', () => {
  it('is the plan the computer last read, in the settings copy it sends', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-copy-'));
    const fake = { listItems: () => [], listProducts: () => [], isDue: () => true, readInstructions: () => '' };
    const config = loadConfig(dir);
    const sup = new Supervisor(config, fake, dir);
    const copy = () => phoneSettingsOf({ ok: true, ...readSettings({ config, supervisor: sup, store: fake }, { search: false }) }, { version: 'x' }).workspace.plan;
    expect(copy()).toBeNull();
    sup.cloudPlanSeen({ signedIn: true, plan: 'pro', agents: 10 });
    expect(copy()).toBe('pro');
    // A read that failed says nothing about the plan, so the last one stands.
    sup.cloudPlanSeen({ signedIn: true, error: 'unreachable' });
    expect(copy()).toBe('pro');
    sup.cloudPlanSeen({ signedIn: false });
    expect(copy()).toBeNull();
  });

  it('allows dictation on a paid plan, by the computer heard from last', () => {
    expect(dictationAllowed([row('pro', 2)])).toBe(true);
    expect(dictationAllowed([row('plus', 2)])).toBe(true);
    expect(dictationAllowed([row('max', 2)])).toBe(true);
    expect(dictationAllowed([row('none', 2)])).toBe(false);
    expect(dictationAllowed([row(null, 2)])).toBe(false);
    expect(dictationAllowed([row('gold', 2)])).toBe(false);
    expect(dictationAllowed([])).toBe(false);
    expect(dictationAllowed([row('none', 1), row('pro', 5)])).toBe(true);
    expect(dictationAllowed([row('pro', 1), row('none', 5)])).toBe(false);
  });

  it('reaches the page through the bridge, read again once a minute', () => {
    const bridge = read('renderer/src/cloud-bridge.ts');
    expect(bridge).toMatch(/const next = await readSettingsRows\(/);
    expect(bridge).toContain('setDictationAllowed(dictationAllowed(next))');
    expect(bridge).toMatch(/PLAN_READ_MS = 60_000/);
  });

  it('the site lets its own page, and nothing it frames, use the microphone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mic-site-'));
    const put = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
    put(path.join(dir, 'dist', 'index.html'), '<!doctype html><html><head></head><body></body></html>');
    put(path.join(dir, 'icon.png'), 'png');
    put(path.join(dir, 'team.config.json'), JSON.stringify({ url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' }));
    const { out } = buildPhoneSite({ dist: path.join(dir, 'dist'), out: path.join(dir, 'out'), configFile: path.join(dir, 'team.config.json'), icon: path.join(dir, 'icon.png'), log: () => {} });
    const policy = fs.readFileSync(path.join(out, '_headers'), 'utf8').match(/Permissions-Policy: (.*)/)[1];
    expect(policy).toMatch(/(^|, )microphone=\(self\)(,|$)/);
    expect(policy).toMatch(/camera=\(\)/);
    expect(policy).toMatch(/geolocation=\(\)/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// A stand-in for the browser's recogniser, as Safari and Chrome shape it.
function browser() {
  const made = [];
  class Recognition {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; made.push(this); this.calls = []; }
    start() { this.calls.push('start'); }
    stop() { this.calls.push('stop'); }
    abort() { this.calls.push('abort'); }
  }
  return { win: { webkitSpeechRecognition: Recognition, navigator: { language: 'en-GB' } }, made };
}
const result = (parts, from = 0) => ({ resultIndex: from, results: parts.map(([text, isFinal]) => Object.assign([{ transcript: text }], { isFinal })) });

describe("the browser's recogniser as the dictation controller's speech", () => {
  it('is there only where the browser has one', () => {
    expect(webSpeech({ navigator: {} })).toBeNull();
    expect(webSpeech(browser().win)).not.toBeNull();
  });

  it('writes what is said into the box as it is said, after what was typed', async () => {
    const { win, made } = browser();
    let text = 'Please';
    const ctl = dictation({ speech: webSpeech(win), box: { read: () => text, write: (t) => { text = t; } }, changed: () => {}, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
    await ctl.start();
    const r = made[0];
    expect(r.continuous).toBe(true);
    expect(r.interimResults).toBe(true);
    expect(r.lang).toBe('en-GB');
    r.onstart();
    expect(ctl.now.phase).toBe('listening');
    r.onresult(result([['make the', false]]));
    expect(text).toBe('Please make the');
    r.onresult(result([['make the button bigger', true]]));
    r.onresult(result([['make the button bigger', true], ['and orange', false]], 1));
    expect(text).toBe('Please make the button bigger and orange');
    const done = ctl.finish();
    expect(r.calls).toContain('stop');
    r.onresult(result([['make the button bigger', true], ['and orange', true]], 1));
    r.onend();
    await done;
    expect(text).toBe('Please make the button bigger and orange');
    expect(ctl.now.phase).toBe('idle');
  });

  it('says so before listening when this site was refused the microphone, and asks again when it was not', async () => {
    for (const [state, starts] of [['denied', false], ['prompt', true], ['granted', true]]) {
      const { win, made } = browser();
      win.navigator.permissions = { query: async ({ name }) => ({ state: name === 'microphone' ? state : 'granted' }) };
      let seen = null;
      const ctl = dictation({ speech: webSpeech(win), box: { read: () => '', write: () => {} }, changed: (n) => { seen = n; }, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
      await ctl.start();
      expect(made.length, state).toBe(starts ? 1 : 0);
      expect(seen.problem, state).toBe(starts ? null : 'Dictation needs the microphone. Allow it in Settings.');
    }
  });

  it('gives the browser time to ask for the microphone before it gives up on a start', async () => {
    const { win } = browser();
    const waits = [];
    const ctl = dictation({ speech: webSpeech(win), box: { read: () => '', write: () => {} }, changed: () => {}, timers: { setTimeout: (fn, ms) => { waits.push(ms); return 0; }, clearTimeout: () => {} } });
    await ctl.start();
    expect(waits[0]).toBeGreaterThanOrEqual(15_000);
    expect(waits[0]).toBeLessThanOrEqual(30_000);
  });

  it('says why when the browser refuses the microphone', async () => {
    const { win, made } = browser();
    let seen = null;
    const ctl = dictation({ speech: webSpeech(win), box: { read: () => '', write: () => {} }, changed: (n) => { seen = n; }, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
    await ctl.start();
    made[0].onerror({ error: 'not-allowed', message: '' });
    expect(seen.phase).toBe('idle');
    expect(seen.problem).toMatch(/microphone/i);
  });
});

describe('the boxes', () => {
  it('the reply box and the New thread box draw the microphone only when dictation is allowed, and the Listening row while it listens', () => {
    for (const file of ['renderer/src/components/Focus.tsx', 'renderer/src/threads/ThreadComposer.tsx']) {
      const src = read(file);
      expect(src, file).toMatch(/useWebDictation\(/);
      expect(src, file).toMatch(/talk\.allowed && (!talk\.on && )?<MicButton talk=\{talk\} \/>/);
      expect(src, file).toMatch(/talk\.on \? <Listening talk=\{talk\} \/>/);
    }
  });

  it('use the phone app\'s words', () => {
    const ui = read('renderer/src/components/WebDictation.tsx');
    for (const words of ["'Listening'", "'Finishing'", "'Starting'", '>Stop<', '>Send<', 'aria-label="Dictate"', 'aria-label="Stop dictating"', 'aria-label="Send what you said"']) expect(ui).toContain(words);
  });

  it('the privacy policy says where the website sends a voice', () => {
    expect(read('phone-legal/privacy.html')).toMatch(/website[^<]*browser's own speech recognition/i);
  });
});

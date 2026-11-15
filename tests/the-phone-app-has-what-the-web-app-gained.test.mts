// THE PHONE APP HAS WHAT THE WEB APP GAINED (w-9f9c2570e2, 2026-10-27).
//
// Between 24 and 27 October the web app got a run of features and fixes that
// the iPhone app never did. Found by reading the two apps side by side:
// a "Connect your computer" page for an account no computer has joined, the
// empty inbox drawing the New thread form open, Done in the thread's corner,
// the pen moving up when a permission card covers it, Send feedback, the build
// number, the computer line naming the cloud, Show password, the dots logo,
// and dictation that carries on when the box is tapped. The rules are the web
// app's own; these pin that the phone app uses them.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { phoneConnectState } from '../renderer/src/phone-rows';
import { computerLine, versionLine } from '../mobile/src/lib/computer-line';
import { feedbackAddressOn, sendPhoneFeedback } from '../renderer/src/phone-feedback';

const read = (p) => fs.readFileSync(p, 'utf8');
const NOW = Date.parse('2026-10-27T12:00:00Z');

describe('an account no computer has joined', () => {
  it('reads Connect your computer once the first read is in, not before, and not on an error', () => {
    const base = { signedIn: true, started: true, error: null, projects: [], email: 'a@example.test' };
    expect(phoneConnectState(base)).toEqual({ email: 'a@example.test' });
    expect(phoneConnectState({ ...base, started: false })).toBeNull();
    expect(phoneConnectState({ ...base, error: 'offline' })).toBeNull();
    expect(phoneConnectState({ ...base, projects: [{}] })).toBeNull();
  });
  it('is drawn in place of the inbox, with a way to another account', () => {
    const src = read('mobile/src/app/index.tsx');
    expect(read('mobile/src/state/cloud.tsx')).toMatch(/phoneConnectState\(\{ signedIn, started: !read\.first/);
    expect(src).toMatch(/if \(c\.connect\) return <ComputerWait email=\{c\.connect\.email\} signOut=\{c\.signOut\} \/>/);
    expect(read('mobile/src/ui/Onboarding.tsx')).toMatch(/Use another account/);
  });
});

describe('the empty inbox', () => {
  it('draws the New thread form open, and hides the floating pen there', () => {
    const src = read('mobile/src/app/index.tsx');
    expect(src).toMatch(/<InboxComposer \/>/);
    expect(src).toMatch(/!\(inboxEmpty && !board\)/);
  });
  it('the page and the inbox share one form', () => {
    expect(read('mobile/src/app/new.tsx')).toMatch(/useNewThread\(close[,)]/);
    expect(read('mobile/src/ui/NewThreadForm.tsx')).toMatch(/export function InboxComposer/);
  });
});

describe('a permission card over the pen', () => {
  it('moves the pen up to the top bar', () => {
    const src = read('mobile/src/app/index.tsx');
    expect(src).toMatch(/const penUp = c\.view\.approvals\.length > 0/);
    expect(src).toMatch(/\{penUp && <IconButton label="New thread"/);
    expect(src).toMatch(/\{!picked && !penUp && /);
  });
});

describe('Done in the thread corner', () => {
  it('is offered on an open thread, and closes it the way the More sheet does', () => {
    const src = read('mobile/src/app/thread/[product]/[id].tsx');
    expect(src).toMatch(/threadState\(item\) !== 'done' && \(\s*<Pressable onPress=\{close\}/);
    expect(src).toMatch(/accessibilityLabel="Mark done"/);
  });
});

describe('dictation and the keyboard', () => {
  it('tapping the box keeps it listening; typing stops it and keeps the words', () => {
    for (const file of ['mobile/src/app/thread/[product]/[id].tsx', 'mobile/src/ui/NewThreadForm.tsx']) {
      const src = read(file);
      expect(src, file).not.toMatch(/onFocus=\{\(\) => \{ if \(talk\.active\(\)\) talk\.stop\(\); \}\}/);
      expect(src, file).toMatch(/onChangeText=\{\(t\) => \{ if \(talk\.active\(\)\) talk\.leave\(\); draft\.setText\(t\); \}\}/);
    }
  });
});

describe('Settings', () => {
  const s = (updated) => ({ computer: { name: 'Studio', updated_at: new Date(updated).toISOString() }, loaded: true, error: null });
  it('says the build, so one TestFlight build tells from the next', () => {
    expect(versionLine('0.1.0', '5')).toBe('Version 0.1.0 (5)');
    expect(versionLine('0.1.0', null)).toBe('Version 0.1.0');
  });
  it('names the cloud when the computer is away and the cloud carries on, and only then', () => {
    expect(computerLine(s(NOW - 60_000), NOW, true)).toBe('From Studio.');
    expect(computerLine(s(NOW - 3 * 3600_000), NOW, true)).toMatch(/waits for it\. Agentbox Cloud starts your new threads and replies meanwhile\.$/);
    expect(computerLine(s(NOW - 3 * 3600_000), NOW, false)).toMatch(/waits for it\.$/);
  });
  it('sends feedback to the same function the web app and the Mac post to', async () => {
    expect(feedbackAddressOn({ url: 'https://abc.supabase.co' })).toBe('https://abc.supabase.co/functions/v1/feedback');
    let posted;
    const out = await sendPhoneFeedback({ url: 'https://abc.supabase.co' }, { text: ' broke ', files: [], os: 'ios app', version: '0.1.0 (5)' }, async (u, init) => { posted = { u, body: JSON.parse(init.body) }; return { ok: true, json: async () => ({ ok: true }) }; });
    expect(out.ok).toBe(true);
    expect(posted.body).toMatchObject({ text: 'broke', app: { os: 'ios app', version: '0.1.0 (5)' } });
    expect(read('mobile/src/ui/SettingsPages.tsx')).toMatch(/router\.push\('\/settings\/feedback'\)/);
  });
});

describe('sign in', () => {
  const src = read('mobile/src/app/sign-in.tsx');
  it('wears the dots, not the app icon', () => {
    expect(src).not.toMatch(/assets\/icon\.png/);
    expect(src).toMatch(/<AppMark /);
  });
  it('can show the password', () => {
    // The field is shared with the reset screen.
    const field = read('mobile/src/ui/Field.tsx');
    expect(src).toMatch(/<Field label="Password"[^>]*secureTextEntry/);
    expect(field).toMatch(/secureTextEntry=\{secureTextEntry && !shown\}/);
    expect(field).toMatch(/'Show password'/);
  });
});

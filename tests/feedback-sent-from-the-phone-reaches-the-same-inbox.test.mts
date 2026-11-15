// FEEDBACK SENT FROM THE PHONE NEVER LEFT THE PHONE (w-13a364930d, 2026-10-22).
//
// Reported: "feedback from the feedback button isn't going to my email".
// Measured that evening: the server function's recipient secret matched the
// address asked for (by its digest in `supabase secrets list`), and a POST to
// the live function answered 200 {"ok":true}, so the Mac's card was sending.
// The phone website's was not. Its Settings page offers "Send feedback", but
// the bridge it runs on (renderer/src/cloud-bridge.ts) answers every door it
// does not handle by throwing NOT_HERE, sendFeedback included, and the card
// turned that into "It did not send. Try again in a moment." Wiring the door
// alone would not have done it either: the function answered the browser's
// preflight (OPTIONS from https://agentbox-phone.pages.dev) with 405 and no
// access-control header, so the browser would have refused the POST.
//
// What this file pins:
//   - the phone posts the checked payload to the feedback function on the
//     cloud the site was built for, and only there;
//   - a refusal or a dropped connection comes back as a sentence, never a throw;
//   - the bridge's sendFeedback door is that sender, not NOT_HERE;
//   - the function answers a preflight without sending mail, and every answer
//     carries the header a browser needs to read it; GET is still refused.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { feedbackAddressOn, sendPhoneFeedback } from '../renderer/src/cloud-bridge';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const CLOUD = { url: 'https://abc123.supabase.co', anonKey: 'anon' };
const shot = { name: 'shot.png', type: 'image/png', size: 3, data: 'AAAA' };

describe('the phone sends feedback', () => {
  it('to the feedback function on the cloud the site was built for', () => {
    expect(feedbackAddressOn(CLOUD)).toBe('https://abc123.supabase.co/functions/v1/feedback');
    expect(feedbackAddressOn({ ...CLOUD, url: 'https://abc123.supabase.co/' })).toBe('https://abc123.supabase.co/functions/v1/feedback');
  });

  it('posts the words trimmed and the files once, as JSON, and says it went', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    expect(await sendPhoneFeedback(CLOUD, { text: '  the phone card works  ', files: [shot] }, fetchImpl)).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [to, init] = fetchImpl.mock.calls[0];
    expect(to).toBe('https://abc123.supabase.co/functions/v1/feedback');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.text).toBe('the phone card works');
    expect(body.files).toEqual([{ name: 'shot.png', type: 'image/png', data: 'AAAA' }]);
    expect(body.app.os).toMatch(/phone/);
  });

  it('carries no sign-in and no key, since the function takes none', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await sendPhoneFeedback(CLOUD, { text: 'hi', files: [] }, fetchImpl);
    const headers = Object.keys(fetchImpl.mock.calls[0][1].headers).map((h) => h.toLowerCase());
    expect(headers).toEqual(['content-type']);
  });

  it('sends nothing when there is nothing to send', async () => {
    const fetchImpl = vi.fn();
    const out = await sendPhoneFeedback(CLOUD, { text: '   ', files: [] }, fetchImpl);
    expect(out.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns a refusal into a sentence', async () => {
    const out = await sendPhoneFeedback(CLOUD, { text: 'hi', files: [] }, async () => ({ ok: false, status: 502 }));
    expect(out).toEqual({ ok: false, error: expect.stringMatching(/^[A-Z].*\.$/) });
  });

  it('turns a dropped connection into a sentence, not a throw', async () => {
    const out = await sendPhoneFeedback(CLOUD, { text: 'hi', files: [] }, async () => { throw new TypeError('Load failed'); });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/connection/);
  });
});

describe('the phone website wires its Send button to it', () => {
  const bridge = read('renderer/src/cloud-bridge.ts');
  it('the sendFeedback door is the phone sender, not "your computer does this"', () => {
    expect(bridge).toMatch(/sendFeedback: *\([^)]*\) *=> *sendPhoneFeedback\(cfg,/);
  });
  it('and carries no email address', () => {
    expect(bridge).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/);
  });
});

describe('the feedback function answers a browser', () => {
  let handler;
  const env = { FEEDBACK_TO: 'to', FEEDBACK_FROM: 'from', RESEND_API_KEY: 'key' };
  const mail = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
  beforeAll(async () => {
    vi.stubGlobal('Deno', { serve: (fn) => { handler = fn; }, env: { get: (k) => env[k] } });
    vi.stubGlobal('fetch', mail);
    await import('../cloud/supabase/functions/feedback/index.ts');
  });
  afterAll(() => vi.unstubAllGlobals());

  const FROM_PHONE = 'https://agentbox-phone.pages.dev';
  const post = (body) => new Request('https://fn.example/feedback', { method: 'POST', headers: { 'content-type': 'application/json', origin: FROM_PHONE }, body: JSON.stringify(body) });

  it('lets the phone site post JSON, and sends no mail for asking', async () => {
    mail.mockClear();
    const res = await handler(new Request('https://fn.example/feedback', {
      method: 'OPTIONS',
      headers: { origin: FROM_PHONE, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    }));
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/);
    expect(res.headers.get('access-control-allow-headers')).toMatch(/content-type/i);
    expect(mail).not.toHaveBeenCalled();
  });

  it('a sent one answers ok where the browser can read it', async () => {
    mail.mockClear();
    const res = await handler(post({ text: 'from the phone', files: [], app: { version: '', os: 'phone website' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toEqual({ ok: true });
    expect(mail).toHaveBeenCalledTimes(1);
  });

  it('a refused one says so where the browser can read it', async () => {
    mail.mockImplementationOnce(async () => new Response('{"name":"validation_error","message":"nope"}', { status: 422 }));
    const res = await handler(post({ text: 'x', files: [] }));
    expect(res.status).toBe(502);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('still refuses anything but POST, and sends no mail for it', async () => {
    mail.mockClear();
    const res = await handler(new Request('https://fn.example/feedback', { method: 'GET', headers: { origin: FROM_PHONE } }));
    expect(res.status).toBe(405);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(mail).not.toHaveBeenCalled();
  });
});

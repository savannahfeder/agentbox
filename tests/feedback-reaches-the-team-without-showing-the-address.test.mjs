// FEEDBACK GOES STRAIGHT TO THE AGENTBOX TEAM, AND THE ADDRESS IS NOWHERE IN
// THE APP (w-1b574413db, 2026-10-04).
//
// Asked for: a low friction way for anyone using Agentbox to send feedback,
// pasted or dropped files included, forwarded to the builder's inbox, "though
// they shouldn't be able to see my email anywhere". This repository is public,
// so "anywhere" includes the source: the address cannot be in the app at all.
// It lives as a secret on the server function (`FEEDBACK_TO`), and the app
// only knows where that function is, which is baked into the download at
// build time the way the analytics key is.
//
// What this file pins:
//   - what may be sent: words, files, or both, and never nothing; the limits
//     on length, file count and total size, with the boundary either side;
//   - where it goes: the config wins over the baked address, a copy with
//     neither refuses in words instead of failing silently;
//   - how it goes: one POST of the checked payload, and a refused or failed
//     send comes back as a sentence, never a throw;
//   - that no email address is written into the card, the sender or the
//     server function, and the function reads its recipient from a secret;
//   - the card's own words, as approved: the subheader and a Send button that
//     carries ⌘↵ and nothing that schedules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { FEEDBACK_LIMITS, checkFeedback, feedbackPayload, totalBytes } from '../shared/feedback.mjs';
import { feedbackUrl, sendFeedback } from '../main/feedback.mjs';
import { FeedbackCard } from '../renderer/src/components/FeedbackCard';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// A made-up attachment. `size` is what the card reads off the File; `data` is
// its base64, which is what travels.
const file = (size, name = 'shot.png') => ({ name, type: 'image/png', size, data: 'AAAA' });

describe('what may be sent', () => {
  it('refuses nothing at all, and words that are only spaces', () => {
    expect(checkFeedback({ text: '', files: [] }).ok).toBe(false);
    expect(checkFeedback({ text: '   \n\t ', files: [] }).ok).toBe(false);
    expect(checkFeedback({}).ok).toBe(false);
  });

  it('takes words alone, a file alone, or both', () => {
    expect(checkFeedback({ text: 'Snooze is lost on restart', files: [] }).ok).toBe(true);
    expect(checkFeedback({ text: '', files: [file(10)] }).ok).toBe(true);
    expect(checkFeedback({ text: 'see attached', files: [file(10)] }).ok).toBe(true);
  });

  it('takes words right up to the limit and refuses one character more', () => {
    expect(checkFeedback({ text: 'a'.repeat(FEEDBACK_LIMITS.text), files: [] }).ok).toBe(true);
    const over = checkFeedback({ text: 'a'.repeat(FEEDBACK_LIMITS.text + 1), files: [] });
    expect(over.ok).toBe(false);
    expect(over.reason).toMatch(/characters/);
  });

  it('takes the most files allowed and refuses one more', () => {
    const many = (n) => Array.from({ length: n }, (_, i) => file(1, `f${i}.png`));
    expect(checkFeedback({ text: 'x', files: many(FEEDBACK_LIMITS.files) }).ok).toBe(true);
    const over = checkFeedback({ text: 'x', files: many(FEEDBACK_LIMITS.files + 1) });
    expect(over.ok).toBe(false);
    expect(over.reason).toMatch(/files/);
  });

  it('takes files that add up to exactly the size limit and refuses one byte more', () => {
    const half = FEEDBACK_LIMITS.bytes / 2;
    expect(totalBytes([file(half), file(half)])).toBe(FEEDBACK_LIMITS.bytes);
    expect(checkFeedback({ text: '', files: [file(half), file(half)] }).ok).toBe(true);
    const over = checkFeedback({ text: '', files: [file(half), file(half + 1)] });
    expect(over.ok).toBe(false);
    expect(over.reason).toMatch(/MB/);
  });

  it('every refusal is a sentence a person can act on', () => {
    for (const r of [checkFeedback({ text: '' }), checkFeedback({ text: 'a'.repeat(FEEDBACK_LIMITS.text + 1) })]) {
      expect(r.reason).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('sends the words trimmed, each file as name, type and data, and the app version', () => {
    const payload = feedbackPayload({ text: '  hello  ', files: [{ ...file(3), extra: 'dropped' }], app: { version: '1.2.3', os: 'darwin 25.5.0' } });
    expect(payload).toEqual({
      text: 'hello',
      files: [{ name: 'shot.png', type: 'image/png', data: 'AAAA' }],
      app: { version: '1.2.3', os: 'darwin 25.5.0' },
    });
  });
});

describe('where it goes', () => {
  const baked = 'https://baked.example/functions/v1/feedback';
  it('uses the address baked into the download', () => {
    expect(feedbackUrl({}, baked, {})).toBe(baked);
  });
  it('lets the config point a copy somewhere else', () => {
    expect(feedbackUrl({ feedbackUrl: 'https://mine.example/f' }, baked, {})).toBe('https://mine.example/f');
  });
  it('has nowhere to send when neither is set, and a blank does not count', () => {
    expect(feedbackUrl({}, null, {})).toBe(null);
    expect(feedbackUrl({ feedbackUrl: '  ' }, null, {})).toBe(null);
  });
});

describe('how it goes', () => {
  const url = 'https://fn.example/feedback';
  const payload = { text: 'hi', files: [], app: { version: '1', os: 'x' } };

  it('posts the payload once, as JSON, and says it went', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    expect(await sendFeedback({ url, payload, fetchImpl })).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [to, init] = fetchImpl.mock.calls[0];
    expect(to).toBe(url);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('refuses in words when this copy has nowhere to send, and sends nothing', async () => {
    const fetchImpl = vi.fn();
    const out = await sendFeedback({ url: null, payload, fetchImpl });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/^[A-Z].*\.$/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checks again before sending, so an empty one never leaves the machine', async () => {
    const fetchImpl = vi.fn();
    const out = await sendFeedback({ url, payload: { ...payload, text: ' ' }, fetchImpl });
    expect(out.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns a refusal from the server into a sentence', async () => {
    const out = await sendFeedback({ url, payload, fetchImpl: async () => ({ ok: false, status: 500 }) });
    expect(out).toEqual({ ok: false, error: expect.stringMatching(/^[A-Z].*\.$/) });
  });

  it('turns a dropped connection into a sentence, not a throw', async () => {
    const out = await sendFeedback({ url, payload, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/connection/);
  });
});

describe('the address is nowhere in the app', () => {
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}/;
  const files = [
    'shared/feedback.mjs',
    'main/feedback.mjs',
    'renderer/src/components/FeedbackCard.tsx',
    'cloud/supabase/functions/feedback/index.ts',
  ];
  it.each(files)('%s carries no email address', (p) => {
    // An example address in a comment would still teach a reader the shape,
    // so the rule is none at all.
    expect(read(p)).not.toMatch(EMAIL);
  });

  it('the server function reads who it goes to from a secret', () => {
    const fn = read('cloud/supabase/functions/feedback/index.ts');
    expect(fn).toContain("Deno.env.get('FEEDBACK_TO')");
    expect(fn).toContain("Deno.env.get('RESEND_API_KEY')");
  });

  it('the server function can be called without a sign-in, since most people have none', () => {
    expect(read('cloud/supabase/config.toml')).toMatch(/\[functions\.feedback\]\s*\nverify_jwt = false/);
  });
});

describe('the card, as approved', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(createElement(FeedbackCard, { onClose: noop, onSend: async () => ({ ok: true }) }));

  it('says who it goes to without saying how', () => {
    expect(html).toContain('Send feedback');
    expect(html).toContain('Goes straight to the Agentbox team.');
  });

  it('has the thread composer’s Send button, with ⌘↵ on it', () => {
    expect(html).toMatch(/<button[^>]*class="dock-send"[^>]*>Send <kbd>⌘↵<\/kbd><\/button>/);
  });

  it('cannot be sent empty', () => {
    expect(html).toMatch(/<button[^>]*class="dock-send"[^>]*disabled=""/);
  });

  it('offers no way to schedule it', () => {
    expect(html).not.toMatch(/schedul|later|tomorrow/i);
  });

  it('says files can be pasted, dropped or picked', () => {
    expect(html).toContain('Attach');
    expect(html).toMatch(/paste/i);
    expect(html).toMatch(/drop/i);
  });
});

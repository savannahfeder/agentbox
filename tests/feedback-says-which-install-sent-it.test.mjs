// FEEDBACK SAYS WHICH INSTALL SENT IT (w-1b3e9b8888, 2026-10-30).
//
// Three feedback emails arrived on 2026-10-29, all from Agentbox 0.1.20 on
// darwin 25.6.0, and nothing in them said whether one person sent all three
// or three people sent one each. The footer carried only the version and the
// OS. The app already keeps one random install id (shared/install-id.mjs),
// so feedback now carries it and the email footer shows its first 8
// characters: enough to tell senders apart, and nothing about the person.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { feedbackPayload } from '../shared/feedback.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the payload carries the install id', () => {
  it('sends the install id beside the version and the OS', () => {
    const p = feedbackPayload({ text: 'hi', app: { version: '0.1.20', os: 'darwin 25.6.0', install: '3f9a2c1e-0000-4000-8000-000000000000' } });
    expect(p.app).toEqual({ version: '0.1.20', os: 'darwin 25.6.0', install: '3f9a2c1e-0000-4000-8000-000000000000' });
  });

  it('sends an empty install when there is none, as the phone website has none', () => {
    expect(feedbackPayload({ text: 'hi', app: { version: '1' } }).app.install).toBe('');
    expect(feedbackPayload({ text: 'hi', app: { version: '1', install: null } }).app.install).toBe('');
  });

  it('cuts anything longer than an id down, so the field cannot carry a message', () => {
    expect(feedbackPayload({ text: 'hi', app: { install: 'x'.repeat(500) } }).app.install).toHaveLength(64);
  });
});

describe('the desktop app sends its own install id', () => {
  it('reads the same id the crash reports and counts use', () => {
    const ipc = read('main/ipc.mjs');
    const handler = ipc.slice(ipc.indexOf("'zero:send-feedback'"), ipc.indexOf("'zero:send-feedback'") + 400);
    expect(handler).toMatch(/install:\s*analytics\.installId/);
  });
});

describe('the email footer shows a short form of it', () => {
  const fn = read('cloud/supabase/functions/feedback/index.ts');
  it('puts the first 8 characters in the footer', () => {
    expect(fn).toMatch(/install\.slice\(0,\s*8\)/);
    expect(fn).toMatch(/footer = .*install/);
  });
  it('leaves the footer as it was when no id came', () => {
    expect(fn).toMatch(/install \? ` · install \$\{install\.slice\(0, 8\)\}` : ''/);
  });
});

// SETTINGS ON THE WEB APP OPENS, AND SAYS WHERE YOUR COMPUTER IS.
//
// What broke (2026-10-26, the web app driven in Chromium against a stand-in
// cloud): Settings opened on "Reading settings…" for good, threw "Cannot read
// properties of null (reading 'ok')", and its Phone page said "Sign in to use
// your phone" to somebody signed in. The bridge answered the settings read with
// null, and the page offered every desktop page, none of which a browser can
// reach. Now it reads, offers the pages a browser can keep, and its Account
// page names the account, signs out, and says whether the computer is there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computerSays } from '../renderer/src/phone-rows';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const NOW = Date.parse('2026-10-26T12:00:00Z');
const MIN = 60_000;

describe('your computer, as the web app\'s Account page says it', () => {
  it('online a moment ago', () => {
    expect(computerSays({ seenAt: NOW - MIN, cloud: false }, NOW)).toEqual({ label: 'Your computer is online', desc: 'New threads and replies start there within a few seconds.' });
  });
  it('away, with Agentbox Cloud carrying on', () => {
    expect(computerSays({ seenAt: NOW - 3 * 60 * MIN, cloud: true }, NOW)).toEqual({ label: 'Your computer was last online 3 hours ago', desc: 'Agentbox Cloud starts your new threads and replies while it is off.' });
  });
  it('away, with nothing to carry on', () => {
    expect(computerSays({ seenAt: NOW - 3 * 60 * MIN, cloud: false }, NOW)).toEqual({ label: 'Your computer was last online 3 hours ago', desc: 'What you send waits for it. To keep agents running with the lid shut, set up Agentbox Cloud on your computer.' });
  });
  it('never connected', () => {
    expect(computerSays({ seenAt: 0, cloud: false }, NOW)).toEqual({ label: 'No computer connected yet', desc: 'Open Agentbox on your computer and sign in to this account in Settings › Phone.' });
  });
});

describe('the page', () => {
  it('reads settings rather than answering null', () => {
    expect(read('renderer/src/cloud-bridge.ts')).toMatch(/settingsRead:\s*async \(\) => \(\{ ok: true/);
  });
  it('offers only the pages a browser can keep, and calls Phone Account', () => {
    const s = read('renderer/src/components/Settings.tsx');
    expect(s).toMatch(/WEB_PAGES = new Set<SettingsPageId>\(\['appearance', 'shortcuts', 'phone'\]\)/);
    expect(s).toContain("onCloudPhone() && p.id === 'phone' ? { ...p, label: 'Account' } : p");
  });
  it('names the account, signs out, and says where the computer is', () => {
    const s = read('renderer/src/components/Settings.tsx');
    expect(s).toContain('function WebAccountPage');
    expect(s).toMatch(/Signed in as \$\{/);
    expect(s).toContain('computerSays(');
    expect(read('renderer/src/App.tsx')).toMatch(/phoneWeb=\{snap\?\.phoneAccount/);
  });
});

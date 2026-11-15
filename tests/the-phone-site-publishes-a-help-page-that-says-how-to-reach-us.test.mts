// THE PHONE SITE PUBLISHES A HELP PAGE THAT SAYS HOW TO REACH US.
//
// App Store Connect asks every app for a support address whose page has
// up-to-date contact details, and guideline 1.2 wants an app where people post
// to publish how to reach its makers. The app had a privacy policy and terms
// (phone-legal/) but no such page, and nothing in the app said where to write.
// Found reading the app as an App Store reviewer on 2026-11-08. Now
// phone-legal/support.html goes out with the other two, filled in from the
// same config, and Settings › General links it as Help.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CLOUD = { url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' };
const FILLED = { contact: 'hello@agentbox.example', operator: 'Example Labs Inc.', governingLaw: 'the State of Delaware, United States' };
let dir, out, build;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-help-'));
  const dist = path.join(dir, 'dist');
  out = path.join(dir, 'out');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
  const icon = path.join(dir, 'icon.png');
  fs.writeFileSync(icon, 'png');
  const configFile = path.join(dir, 'team.config.json');
  build = (c) => { fs.writeFileSync(configFile, JSON.stringify(c)); return buildPhoneSite({ dist, out, configFile, icon, log: () => {} }); };
});

describe('the help page', () => {
  it('is published with the contact address and the operator filled in', () => {
    build({ ...CLOUD, ...FILLED });
    const html = fs.readFileSync(path.join(out, 'support.html'), 'utf8');
    expect(html).not.toContain('{{');
    expect(html).toContain('hello@agentbox.example');
    expect(html).toContain('Example Labs Inc.');
  });
  it('is not published with a blank, like the other two', () => {
    build({ ...CLOUD, operator: FILLED.operator, governingLaw: FILLED.governingLaw });
    expect(fs.existsSync(path.join(out, 'support.html'))).toBe(false);
  });
  it('says how to delete an account and links the privacy policy, loading nothing from elsewhere', () => {
    const src = fs.readFileSync(path.join(root, 'phone-legal', 'support.html'), 'utf8');
    expect(src).toMatch(/Delete account/);
    expect(src).toMatch(/href="\/privacy"/);
    expect(src).not.toMatch(/<script/i);
    expect(src).not.toMatch(/(src|href)="https?:/i);
  });
});

describe('the app', () => {
  it('links it from Settings › General, beside the privacy policy and terms', () => {
    const pages = fs.readFileSync(path.join(root, 'mobile/src/ui/SettingsPages.tsx'), 'utf8');
    expect(pages).toMatch(/<NavRow label="Help" onPress=\{\(\) => void WebBrowser\.openBrowserAsync\(`\$\{site\}\/support`\)\} \/>/);
  });
});

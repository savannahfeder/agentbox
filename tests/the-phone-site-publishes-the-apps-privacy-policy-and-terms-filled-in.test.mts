// THE PHONE SITE PUBLISHES THE APP'S PRIVACY POLICY AND TERMS, FILLED IN.
//
// App Store Connect asks for a privacy policy address, and App Review checks
// it matches what the app does (guidelines 5.1.1(i) and 5.1.2(i)). The pages
// the desktop has say nothing is hosted, and the phone app keeps an account,
// copies of threads, their files and a settings copy online (docs/mobile/
// PLAN.md, w-7a670f07bb). The phone app's own pages live in phone-legal/ and
// go out with the phone site (scripts/build-phone-site.mjs). The operator's
// name, the contact address and the governing law are the owner's to give, in
// the same config file as the cloud's address; a page with a blank in it is
// never published: without all three, neither page goes and the build says why.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let dir, dist, out, configFile, icon, said;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const CLOUD = { url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' };
const FILLED = { contact: 'hello@agentbox.example', operator: 'Example Labs Inc.', governingLaw: 'the State of Delaware, United States' };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-legal-'));
  dist = path.join(dir, 'dist');
  out = path.join(dir, 'out');
  configFile = path.join(dir, 'team.config.json');
  icon = path.join(dir, 'icon.png');
  write(path.join(dist, 'index.html'), '<!doctype html><html><head><title>Agentbox</title></head><body></body></html>');
  write(icon, 'png');
  said = [];
});

const build = (c) => { write(configFile, JSON.stringify(c)); return buildPhoneSite({ dist, out, configFile, icon, log: (l) => said.push(l) }); };
const page = (name) => fs.readFileSync(path.join(out, name), 'utf8');

describe('with the operator, the contact and the governing law given', () => {
  it('publishes both pages with them filled in, and no blank left', () => {
    build({ ...CLOUD, ...FILLED });
    for (const name of ['privacy.html', 'terms.html']) {
      const html = page(name);
      expect(html).not.toContain('{{');
      expect(html).toContain('hello@agentbox.example');
      expect(html).toContain('Example Labs Inc.');
    }
    expect(page('terms.html')).toContain('the State of Delaware, United States');
  });

  it('writes what it is given as words, never as markup', () => {
    build({ ...CLOUD, ...FILLED, operator: 'Bad <script>alert(1)</script> & Co' });
    const html = page('privacy.html');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Bad &lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
  });
});

describe('with one of them missing', () => {
  it('publishes neither page, says which is missing, and builds the rest of the site', () => {
    const { contact: _c, ...noContact } = FILLED;
    const result = build({ ...CLOUD, ...noContact });
    expect(fs.existsSync(path.join(out, 'privacy.html'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'terms.html'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'index.html'))).toBe(true);
    expect(said.join('\n')).toMatch(/contact/);
    expect(result.legal).toBe('skipped');
  });

  it('counts an empty value as missing', () => {
    build({ ...CLOUD, ...FILLED, governingLaw: '  ' });
    expect(fs.existsSync(path.join(out, 'terms.html'))).toBe(false);
    expect(said.join('\n')).toMatch(/governingLaw/);
  });
});

describe('the pages themselves', () => {
  const src = (name) => fs.readFileSync(path.join(root, 'phone-legal', name), 'utf8');

  it('name who holds the data, the agents it goes to, and how to delete your account', () => {
    const privacy = src('privacy.html');
    for (const words of ['Supabase', 'Anthropic', 'OpenAI', 'Delete account', 'Expo']) expect(privacy).toContain(words);
    expect(src('terms.html')).toContain('{{GOVERNING_LAW}}');
  });

  it('load nothing from anywhere else and run no script', () => {
    for (const name of ['privacy.html', 'terms.html']) {
      const html = src(name);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/(src|href)="https?:/i);
    }
  });

  it('are in step with the example config', () => {
    const example = JSON.parse(fs.readFileSync(path.join(root, 'cloud', 'team.config.example.json'), 'utf8'));
    for (const key of ['contact', 'operator', 'governingLaw']) expect(typeof example[key]).toBe('string');
  });
});

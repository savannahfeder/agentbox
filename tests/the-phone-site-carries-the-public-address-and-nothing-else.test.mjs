// What this guards: the phone site (scripts/build-phone-site.mjs) is the
// renderer put on the open web with the team cloud's public address in it.
// Measured on a small stand-in build: what goes in the page, that a config
// value cannot break out of the tag it is written into, that the demo rows and
// the corner tag stay behind, and that the site's headers let the page reach
// its own files and the database and nothing else.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';

let dir, dist, out, configFile, icon;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-site-'));
  dist = path.join(dir, 'dist');
  out = path.join(dir, 'out');
  configFile = path.join(dir, 'team.config.json');
  icon = path.join(dir, 'icon.png');
  write(path.join(dist, 'index.html'), '<!doctype html><html><head><title>Agentbox</title></head><body></body></html>');
  write(path.join(dist, 'assets', 'main.js'), 'console.log(1)');
  write(path.join(dist, 'assets', 'main.js.map'), '{}');
  write(path.join(dist, 'fixtures', 'onboard', 'x.html'), 'demo');
  write(path.join(dist, 'corner-tag.html'), 'tag');
  write(icon, 'png');
});

const config = (c) => write(configFile, JSON.stringify(c));
const build = () => buildPhoneSite({ dist, out, configFile, icon });

describe('the page', () => {
  it('carries the public address and key, and a manifest and icon for the home screen', () => {
    config({ url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890', serviceKey: 'never' });
    build();
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    expect(html).toContain(`<meta name="agentbox-cloud" content='{"url":"https://abc.supabase.co","anonKey":"eyJhbGciOi.public-key_1234567890"}'>`);
    expect(html).not.toContain('never');
    expect(JSON.parse(fs.readFileSync(path.join(out, 'manifest.webmanifest'), 'utf8')).start_url).toBe('/');
    expect(fs.existsSync(path.join(out, 'phone-icon.png'))).toBe(true);
  });

  it('leaves the demo rows, the corner tag and source maps behind', () => {
    config({ url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' });
    build();
    expect(fs.existsSync(path.join(out, 'fixtures'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'corner-tag.html'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'assets', 'main.js.map'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'assets', 'main.js'))).toBe(true);
  });

  it('refuses a config value that could break out of the tag, or an address that is not plain https', () => {
    for (const bad of [
      { url: "https://abc.supabase.co/'><script>alert(1)</script>", anonKey: 'eyJhbGciOi.public-key_1234567890' },
      { url: 'https://abc.supabase.co', anonKey: "x'><script>alert(1)</script>" },
      { url: 'http://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' },
      { url: 'javascript:alert(1)', anonKey: 'eyJhbGciOi.public-key_1234567890' },
      { url: 'https://abc.supabase.co?x=1', anonKey: 'eyJhbGciOi.public-key_1234567890' },
    ]) {
      config(bad);
      expect(() => build(), JSON.stringify(bad)).toThrow();
    }
  });
});

describe('the headers', () => {
  it('let the page reach itself and the database only, keep its address out of every Referer, and refuse framing by any other site', () => {
    config({ url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' });
    build();
    const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8');
    expect(headers).toMatch(/connect-src 'self' https:\/\/abc\.supabase\.co;/);
    expect(headers).toMatch(/script-src 'self';/);
    expect(headers).not.toMatch(/unsafe-eval/);
    // Its own pages only (2026-10-17): Safari holds a page the phone draws from its own copy to this rule too.
    expect(headers).toMatch(/frame-ancestors 'self'/);
    expect(headers).toMatch(/X-Frame-Options: SAMEORIGIN/);
    expect(headers).toMatch(/Referrer-Policy: no-referrer/);
  });
});

describe('where the build finds the cloud', () => {
  it('in the checkout first, then in the home folder, and nowhere else', async () => {
    const { teamConfigFile } = await import('../scripts/phone-site-config.mjs');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    expect(teamConfigFile(repo, home)).toBeNull();
    write(path.join(home, '.agentbox', 'team.config.json'), '{}');
    expect(teamConfigFile(repo, home)).toBe(path.join(home, '.agentbox', 'team.config.json'));
    write(path.join(repo, 'cloud', 'team.config.json'), '{}');
    expect(teamConfigFile(repo, home)).toBe(path.join(repo, 'cloud', 'team.config.json'));
  });
});

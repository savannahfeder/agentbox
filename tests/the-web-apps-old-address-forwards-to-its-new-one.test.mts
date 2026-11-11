// THE WEB APP'S OLD ADDRESS FORWARDS TO ITS NEW ONE.
//
// What was asked (2026-10-27): move the web app from agentbox-phone.pages.dev
// to an address on agentbox.ac, app.agentbox.ac. That address is a custom
// domain on the same Cloudflare Pages project, so both addresses serve the
// same build, and each keeps its own sign-in and its own alerts. Pages'
// `_redirects` cannot redirect by host (domain-level redirects are not
// supported there), and the site's CSP refuses inline scripts, so the build
// writes a small /forward.js, loaded first, that sends a visit on the old
// address to `phoneSite` with its path kept.
//
// It is written only when `phoneSite` names an address other than the Pages
// one, so a ship before the new address is live cannot send anyone to it.
// Preview builds (<hash>.agentbox-phone.pages.dev) and the new address itself
// stay where they are.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildPhoneSite } from '../scripts/build-phone-site.mjs';

let dir, dist, out, configFile, icon;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const CLOUD = { url: 'https://abc.supabase.co', anonKey: 'eyJhbGciOi.public-key_1234567890' };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-forward-'));
  dist = path.join(dir, 'dist');
  out = path.join(dir, 'out');
  configFile = path.join(dir, 'team.config.json');
  icon = path.join(dir, 'icon.png');
  write(path.join(dist, 'index.html'), '<!doctype html><html><head><title>Agentbox</title><script type="module" src="/assets/main.js"></script></head><body></body></html>');
  write(path.join(dist, 'assets', 'main.js'), 'console.log(1)');
  write(icon, 'png');
});

const build = (extra) => {
  write(configFile, JSON.stringify({ ...CLOUD, ...extra }));
  return buildPhoneSite({ dist, out, configFile, icon, log: () => {} });
};
const page = () => fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const forwarder = () => path.join(out, 'forward.js');

/** Where /forward.js sends a visit to `href`, or null when it stays. */
function visit(href) {
  const at = new URL(href);
  let went = null;
  const location = { hostname: at.hostname, pathname: at.pathname, search: at.search, hash: at.hash, replace: (to) => { went = to; } };
  vm.runInNewContext(fs.readFileSync(forwarder(), 'utf8'), { location });
  return went;
}

describe('with the web app moved to app.agentbox.ac', () => {
  beforeEach(() => build({ phoneSite: 'https://app.agentbox.ac' }));

  it('sends a visit on the old address there, keeping the thread, query and hash', () => {
    expect(visit('https://agentbox-phone.pages.dev/')).toBe('https://app.agentbox.ac/');
    expect(visit('https://agentbox-phone.pages.dev/t/w-123?from=qr#reply')).toBe('https://app.agentbox.ac/t/w-123?from=qr#reply');
  });

  it('leaves the new address and preview builds where they are', () => {
    expect(visit('https://app.agentbox.ac/t/w-123')).toBeNull();
    expect(visit('https://4f2a9c1e.agentbox-phone.pages.dev/')).toBeNull();
    expect(visit('https://agentbox-phone.pages.dev.example.com/')).toBeNull();
  });

  it('runs before anything else on the page, as a file the CSP already allows', () => {
    const html = page();
    const tag = html.indexOf('<script src="/forward.js"></script>');
    expect(tag).toBeGreaterThan(html.indexOf('<head>'));
    expect(tag).toBeLessThan(html.indexOf('<script type="module"'));
    expect(tag).toBeLessThan(html.indexOf('<meta name="agentbox-cloud"'));
    expect(fs.readFileSync(path.join(out, '_headers'), 'utf8')).toMatch(/script-src 'self';/);
  });
});

describe('it forwards nothing', () => {
  it('while phoneSite is still the Pages address, with or without a trailing slash', () => {
    for (const phoneSite of ['https://agentbox-phone.pages.dev', 'https://agentbox-phone.pages.dev/']) {
      build({ phoneSite });
      expect(fs.existsSync(forwarder()), phoneSite).toBe(false);
      expect(page()).not.toContain('forward.js');
    }
  });

  it('with no phoneSite at all', () => {
    build({});
    expect(fs.existsSync(forwarder())).toBe(false);
    expect(page()).not.toContain('forward.js');
  });
});

describe('the address it forwards from', () => {
  it('is the Pages project the site is deployed to', () => {
    build({ phoneSite: 'https://phone.team.example', phonePagesProject: 'team-phone' });
    expect(visit('https://team-phone.pages.dev/x')).toBe('https://phone.team.example/x');
    expect(visit('https://agentbox-phone.pages.dev/x')).toBeNull();
  });
});

describe('a phoneSite that is not a plain https address', () => {
  it('stops the build instead of being written into a script', () => {
    for (const phoneSite of ['http://app.agentbox.ac', 'javascript:alert(1)', 'https://app.agentbox.ac/"+alert(1)+"', 'https://app.agentbox.ac?x=1']) {
      expect(() => build({ phoneSite }), phoneSite).toThrow(/phoneSite/);
    }
  });
});

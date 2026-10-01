// SIGNING IN STAYS OUT OF REACH OF ANYTHING BUT THE PERSON.
//
// Three small doors a review found on 2026-10-01, each checked by hand first:
//   - the sign-in page the browser lands on printed error_description, which
//     is anybody's to write into the address, as HTML;
//   - an installed app honoured AGENTBOX_TEAM_CONFIG (another server) and
//     AGENTBOX_TEAM_TEST_LOGIN (signed in as somebody else), which exist for
//     tests run from a checkout;
//   - the headless app kept its refresh token as plain JSON in the store
//     root, the folder people copy, sync and hand to agents.
import { it, expect, describe, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PAGE } from '../main/team/sign-in.mjs';
import { loadCloudConfig, supabaseSession, headlessSessionFile } from '../main/team/session.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'team-reach-'));

describe('the page the browser comes back to', () => {
  it('shows what came back in the address as text, never as markup', () => {
    const html = PAGE('Sign-in did not finish', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('an installed build', () => {
  const was = process.env.AGENTBOX_TEAM_CONFIG;
  afterEach(() => { if (was === undefined) delete process.env.AGENTBOX_TEAM_CONFIG; else process.env.AGENTBOX_TEAM_CONFIG = was; });

  it('reads its own team config, whatever AGENTBOX_TEAM_CONFIG says', () => {
    const appDir = tmp();
    fs.mkdirSync(path.join(appDir, 'cloud'));
    fs.writeFileSync(path.join(appDir, 'cloud', 'team.config.json'), JSON.stringify({ url: 'https://ours.test', anonKey: 'k' }));
    const other = path.join(tmp(), 'other.json');
    fs.writeFileSync(other, JSON.stringify({ url: 'https://theirs.test', anonKey: 'k' }));
    process.env.AGENTBOX_TEAM_CONFIG = other;
    expect(loadCloudConfig(appDir, { packaged: true }).url).toBe('https://ours.test');
    expect(loadCloudConfig(appDir, { packaged: false }).url).toBe('https://theirs.test');
  });

  it('never signs in with a test login', async () => {
    const dir = tmp();
    const session = supabaseSession({ cloudConfig: { url: 'http://127.0.0.1:9', anonKey: 'k' }, sessionFile: path.join(dir, 's'), openExternal: async () => {}, packaged: true, testLogin: 'someone@x.test:pw' });
    expect(await session.restore()).toBeNull();
  });
});

describe('the headless app\'s sign-in', () => {
  it('lives in its own folder, readable by this user only, and an old one in the store is moved there', () => {
    const userDir = tmp();
    const storeRoot = tmp();
    fs.writeFileSync(path.join(storeRoot, '.team-session'), '{"token":"t"}', { mode: 0o644 });
    const file = headlessSessionFile({ userDir, storeRoot });
    expect(path.dirname(file)).toBe(userDir);
    expect(fs.existsSync(path.join(storeRoot, '.team-session'))).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"token":"t"}');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });
});

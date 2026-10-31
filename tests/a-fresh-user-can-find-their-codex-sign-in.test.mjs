// A fresh-user window hid the existing Codex sign-in by changing HOME.
// Share its auth file like Claude's keychain, without bringing in sessions.
// A linked home reproduces macOS paths such as /var resolving to /private/var.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { prepareHome, freshEnv } from '../shared/fresh-user-home.mjs';

const roots = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-codex-'));
  roots.push(root);
  const realHome = path.join(root, 'real');
  const canonicalHome = path.join(root, 'canonical-real');
  fs.mkdirSync(canonicalHome);
  fs.symlinkSync(canonicalHome, realHome, 'dir');
  const fresh = path.join(root, 'fresh');
  const codexHome = path.join(realHome, '.codex-custom');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"test":true}');
  fs.mkdirSync(path.join(codexHome, 'sessions'));
  fs.writeFileSync(path.join(codexHome, 'config.toml'), 'test = true');
  return { realHome, fresh, codexHome };
}

it('makes the existing sign-in visible without copying sessions or settings', () => {
  const { fresh, realHome, codexHome } = fixture();
  prepareHome(fresh, { realHome, codexHome });
  const auth = path.join(fresh, '.codex', 'auth.json');
  expect(fs.existsSync(auth)).toBe(true);
  expect(fs.realpathSync(auth)).toBe(fs.realpathSync(path.join(codexHome, 'auth.json')));
  expect(fs.existsSync(path.join(fresh, '.codex', 'sessions'))).toBe(false);
  expect(fs.existsSync(path.join(fresh, '.codex', 'config.toml'))).toBe(false);
});
it('keeps a new-user-with-no-tools test signed out', () => {
  const { fresh, realHome, codexHome } = fixture();
  prepareHome(fresh, { realHome, codexHome, withTools: false });
  expect(fs.existsSync(path.join(fresh, '.codex', 'auth.json'))).toBe(false);
  expect(freshEnv(fresh, { CODEX_HOME: codexHome }, { ownSignIns: true }).CODEX_HOME).toBe(path.join(fresh, '.codex'));
});
it('uses the configured Codex home when preparing a fresh copy', () => {
  const { fresh, realHome, codexHome } = fixture();
  vi.stubEnv('CODEX_HOME', codexHome);
  prepareHome(fresh, { realHome });
  expect(fs.realpathSync(path.join(fresh, '.codex/auth.json'))).toBe(fs.realpathSync(path.join(codexHome, 'auth.json')));
});
it('uses the ordinary Codex home when none is configured', () => {
  const { fresh, realHome, codexHome } = fixture();
  vi.stubEnv('CODEX_HOME', '');
  fs.renameSync(codexHome, path.join(realHome, '.codex'));
  prepareHome(fresh, { realHome });
  expect(fs.realpathSync(path.join(fresh, '.codex/auth.json'))).toBe(fs.realpathSync(path.join(realHome, '.codex/auth.json')));
});
it('works when there is no existing Codex login', () => {
  const { fresh, realHome, codexHome } = fixture();
  fs.unlinkSync(path.join(codexHome, 'auth.json'));
  expect(() => prepareHome(fresh, { realHome, codexHome })).not.toThrow();
  expect(fs.existsSync(path.join(fresh, '.codex', 'auth.json'))).toBe(false);
});

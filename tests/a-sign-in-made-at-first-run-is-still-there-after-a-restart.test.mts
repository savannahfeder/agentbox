// A SIGN-IN MADE AT FIRST RUN WAS GONE AFTER A RESTART, so the phone lost the computer.
//
// The desktop keeps its phone sign-in at <store>/.team-session. On the next
// launch the connections vault asked sessionFileOutsideStore for
// connections.enc, which did not exist yet, and that helper carried any old
// team sign-in in the store across to whatever file it was asked for: the
// sign-in was renamed to connections.enc and the app opened signed out. A
// second sign-in stuck only because connections.enc then existed. Measured
// here with the helper itself: asking for another file leaves the sign-in
// where it is, while the headless app's own sign-in is still carried across.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sessionFileOutsideStore, headlessSessionFile } from '../main/team/session.mts';

let home: string;
let storeRoot: string;
let userDir: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-home-'));
  storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-store-'));
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-user-'));
});

afterEach(() => {
  for (const d of [home, storeRoot, userDir]) fs.rmSync(d, { recursive: true, force: true });
});

describe('the desktop sign-in in the store', () => {
  for (const name of ['connections.enc', 'github-sign-in.json']) {
    it(`stays put when ${name} is looked up for the first time`, () => {
      fs.writeFileSync(path.join(storeRoot, '.team-session'), '{"sb":"session"}');
      const file = sessionFileOutsideStore({ dir: userDir, name, storeRoot, home, env: {} });
      expect(fs.readFileSync(path.join(storeRoot, '.team-session'), 'utf8')).toBe('{"sb":"session"}');
      expect(fs.existsSync(file)).toBe(false);
    });
  }

  it('stays put when the other file already exists', () => {
    fs.writeFileSync(path.join(storeRoot, '.team-session'), '{"sb":"session"}');
    fs.writeFileSync(path.join(userDir, 'connections.enc'), 'vault');
    sessionFileOutsideStore({ dir: userDir, name: 'connections.enc', storeRoot, home, env: {} });
    expect(fs.existsSync(path.join(storeRoot, '.team-session'))).toBe(true);
    expect(fs.readFileSync(path.join(userDir, 'connections.enc'), 'utf8')).toBe('vault');
  });

  it("is still carried across to the headless app's own sign-in file", () => {
    fs.writeFileSync(path.join(storeRoot, 'team-session.json'), '{"sb":"session"}');
    const file = headlessSessionFile({ userDir, storeRoot, home, env: {} });
    expect(fs.readFileSync(file, 'utf8')).toBe('{"sb":"session"}');
  });
});

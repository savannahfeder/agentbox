// BRINGING IN NEW CHATS IS A SWITCH YOU TURN ON.
//
// The tick on setup's last screen (w-62228098e6, R1) and the switch in
// Settings write the same two keys: `importNew`, and `importNewSince`, the
// moment it went on. The watch (main/new-chats-watch.mjs) only brings in chats
// started after that moment, so the chats you left unticked at setup never
// arrive later on their own. Turning it on again while it is already on must
// not move the moment, or the chats started in between would be skipped.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setWorkspaceSetting } from '../main/settings.mjs';

const world = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-chats-switch-'));
  return { config: { appDir: dir }, supervisor: { onChange() {} }, store: {} };
};

describe('the switch for new chats', () => {
  it('is off until somebody turns it on', () => {
    expect(world().config.importNew).toBeUndefined();
  });

  it('records the moment it was turned on', () => {
    const w = world();
    const before = Date.now();
    setWorkspaceSetting(w, { key: 'importNew', value: true });
    expect(w.config.importNew).toBe(true);
    expect(w.config.importNewSince).toBeGreaterThanOrEqual(before);
    expect(w.config.importNewSince).toBeLessThanOrEqual(Date.now());
  });

  it('keeps that moment when it is turned on again', () => {
    const w = world();
    setWorkspaceSetting(w, { key: 'importNew', value: true });
    const first = w.config.importNewSince;
    w.config.importNewSince = first - 5000;
    setWorkspaceSetting(w, { key: 'importNew', value: true });
    expect(w.config.importNewSince).toBe(first - 5000);
  });

  it('turns off, and a later turn on starts from that later moment', () => {
    const w = world();
    setWorkspaceSetting(w, { key: 'importNew', value: true });
    w.config.importNewSince = 1;
    setWorkspaceSetting(w, { key: 'importNew', value: false });
    expect(w.config.importNew).toBe(false);
    setWorkspaceSetting(w, { key: 'importNew', value: true });
    expect(w.config.importNewSince).toBeGreaterThan(1);
  });
});

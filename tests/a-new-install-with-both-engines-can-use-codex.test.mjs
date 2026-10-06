// A NEW INSTALL WITH BOTH ENGINES CAN USE CODEX.
//
// Found driving the real app on a Mac with Claude Code and Codex both
// installed (w-db6f5e331e, 2026-10-05): the app offered Claude Code alone
// (snapshot engines.choices was [claude]), the model menu held no Codex model,
// and Settings never named Codex. Codex is behind an opt-in, `engineChoice` in
// zero.config.json, a MOMENT from which a row may choose Codex. It exists so
// that rows marked `codex` in one store in August 2026 never quietly move to a
// second engine (tests/the-second-engine-runs-only-once-she-has-turned-it-on).
// But the only way to write it was by hand, so every new person with both
// engines could never use Codex.
//
// A brand-new install (no config file at all, the one honest marker) has no
// old rows, so it writes its own first launch as that moment. An install that
// already has a config is left exactly as it was.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../main/config.mjs';
import { engineChoiceSince } from '../shared/engines.mjs';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'new-install-codex-'));
const saved = (d) => JSON.parse(fs.readFileSync(path.join(d, 'zero.config.json'), 'utf8'));

describe('the Codex opt-in on a new install', () => {
  it('is the moment this install first launched', () => {
    const d = dir();
    const before = Date.now();
    const config = loadConfig(d, { home: d });
    const at = engineChoiceSince(config);
    expect(at).not.toBeNull();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    expect(engineChoiceSince(saved(d))).toBe(at);
  });

  it('is kept the same on the next launch', () => {
    const d = dir();
    const first = engineChoiceSince(loadConfig(d, { home: d }));
    expect(engineChoiceSince(loadConfig(d, { home: d }))).toBe(first);
  });

  it('is not written into an install that already has a config', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'zero.config.json'), JSON.stringify({ accountId: 'existing' }));
    expect(engineChoiceSince(loadConfig(d, { home: d }))).toBeNull();
    expect(saved(d).engineChoice).toBeUndefined();
  });

  it('leaves a moment somebody wrote by hand alone', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'zero.config.json'), JSON.stringify({ accountId: 'x', engineChoice: '2026-09-04' }));
    expect(engineChoiceSince(loadConfig(d, { home: d }))).toBe(Date.parse('2026-09-04'));
  });
});

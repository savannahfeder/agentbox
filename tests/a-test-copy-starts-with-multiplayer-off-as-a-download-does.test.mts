// A downloaded Agentbox has Multiplayer off until someone turns it on, but a
// checkout has it on unless the config says `alphaMultiplayer: false`
// (main/settings.mts, alphaFeatures). Test copies run as a checkout and never
// said so, so a power tester asked to try the app "with multiplayer off" was
// handed the team version. Measured on 2026-11-04: copyConfig({ storeRoot })
// had no alphaMultiplayer key, and alphaFeatures read that as on.
import { describe, it, expect } from 'vitest';

const { copyConfig } = await import('../.claude/skills/verify-agentbox/scripts/live.mjs');
const { alphaFeatures } = await import('../main/settings.mts');

const unpackaged = (config) => alphaFeatures(config, { packaged: false });

describe('a test copy\'s Multiplayer switch', () => {
  it('is off for a plain copy, as in a download', () => {
    const plain = copyConfig({ storeRoot: '/s' });
    expect(plain.alphaMultiplayer).toBe(false);
    expect(unpackaged(plain).multiplayer).toBe(false);
  });

  it('stays off when only other alpha features are named', () => {
    expect(unpackaged(copyConfig({ storeRoot: '/s', alpha: ['teammates', 'rooms'] })).multiplayer).toBe(false);
  });

  it('is on when named', () => {
    expect(unpackaged(copyConfig({ storeRoot: '/s', alpha: ['multiplayer'] })).multiplayer).toBe(true);
  });

  it('is on for a copy signed in to a team, which needs it to see its room', () => {
    const config = copyConfig({ storeRoot: '/s', teamFile: '/t.json' });
    // Rooms comes from being on the team, not from a switch the harness writes.
    expect(alphaFeatures(config, { packaged: false, onTeam: true })).toMatchObject({ multiplayer: true, rooms: true });
    expect(unpackaged(config).rooms).toBe(false);
  });
});

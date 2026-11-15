// AN IPHONE BUILD ALWAYS KNOWS AGENTBOX CLOUD'S ADDRESS AND ITS PRIVACY PAGE.
//
// The phone app learned the cloud's address and the phone site only from
// EXPO_PUBLIC_CLOUD_URL, EXPO_PUBLIC_CLOUD_KEY and EXPO_PUBLIC_PHONE_SITE on
// Expo's build machines, or a team.config.json they never have. A build made
// without them cannot sign in ("This build was made without the cloud's
// address"), and with no phone site Settings drops its Privacy policy and Terms
// rows, which App Review requires (guideline 5.1.1(i)). Both reviewer passes
// on 2026-11-08 (Claude and Codex) flagged it. The address and key are public
// and already ship in shared/cloud-address.mts, so a build with nothing given
// now uses them; whatever is given still wins.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudConfig } from '../mobile/app.config';
import { CLOUD_ADDRESS, PHONE_SITE } from '../shared/cloud-address.mts';

const none = path.join(os.tmpdir(), 'no-such-team-config.json');
const file = (c) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'team-config-')), 'team.config.json'); fs.writeFileSync(f, JSON.stringify(c)); return f; };

describe('a build given nothing', () => {
  it('signs in to Agentbox Cloud and links its phone site', () => {
    expect(cloudConfig({}, [none])).toEqual({ url: CLOUD_ADDRESS.supabaseUrl, anonKey: CLOUD_ADDRESS.anonKey, phoneSite: PHONE_SITE });
  });
});

describe('a build given an address', () => {
  it('the environment wins, phone site and all', () => {
    const env = { EXPO_PUBLIC_CLOUD_URL: 'https://other.supabase.co', EXPO_PUBLIC_CLOUD_KEY: 'k', EXPO_PUBLIC_PHONE_SITE: 'https://phone.other.example' };
    expect(cloudConfig(env, [none])).toEqual({ url: 'https://other.supabase.co', anonKey: 'k', phoneSite: 'https://phone.other.example' });
  });
  it('Agentbox Cloud named with no phone site still links Agentbox Cloud\'s', () => {
    const env = { EXPO_PUBLIC_CLOUD_URL: CLOUD_ADDRESS.supabaseUrl, EXPO_PUBLIC_CLOUD_KEY: CLOUD_ADDRESS.anonKey };
    expect(cloudConfig(env, [none]).phoneSite).toBe(PHONE_SITE);
  });
  it('another team\'s cloud with no phone site gets none, never ours', () => {
    expect(cloudConfig({ EXPO_PUBLIC_CLOUD_URL: 'https://other.supabase.co', EXPO_PUBLIC_CLOUD_KEY: 'k' }, [none]).phoneSite).toBeNull();
  });
  it('a team.config.json comes before the fallback', () => {
    const f = file({ url: 'https://team.supabase.co', anonKey: 't', phoneSite: 'https://phone.team.example' });
    expect(cloudConfig({}, [f])).toEqual({ url: 'https://team.supabase.co', anonKey: 't', phoneSite: 'https://phone.team.example' });
  });
  it('half an environment is not an address', () => {
    expect(cloudConfig({ EXPO_PUBLIC_CLOUD_URL: 'https://other.supabase.co' }, [none]).url).toBe(CLOUD_ADDRESS.supabaseUrl);
  });
});

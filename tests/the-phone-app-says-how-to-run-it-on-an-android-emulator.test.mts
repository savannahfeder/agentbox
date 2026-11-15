// THE PHONE APP SAYS HOW TO RUN IT ON AN ANDROID EMULATOR (QA M-01, 2026-10-28).
//
// mobile/ held AGENTS.md (Expo notes for agents) and nothing for a person:
// no JDK, no Android SDK, no emulator, no run command, and no word on where
// the cloud's address and key come from. QA rebuilt the steps from
// app.config.ts and the plan each time. mobile/README.md now holds them, and
// this keeps it naming what the config actually reads.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe("mobile/README.md", () => {
  const readme = read('mobile/README.md');
  it('names the run command, the JDK, the Android SDK and the emulator', () => {
    expect(readme).toMatch(/npx expo run:android/);
    expect(readme).toMatch(/JDK 17/);
    expect(readme).toMatch(/ANDROID_HOME/);
    expect(readme).toMatch(/emulator -avd/);
  });
  it('names the cloud settings app.config.ts reads', () => {
    const config = read('mobile/app.config.ts');
    for (const name of ['EXPO_PUBLIC_CLOUD_URL', 'EXPO_PUBLIC_CLOUD_KEY', 'team.config.json']) {
      expect(config).toContain(name);
      expect(readme).toContain(name);
    }
  });
  it('names the preview that needs no account', () => {
    expect(readme).toContain('EXPO_PUBLIC_PREVIEW=1');
  });
});

// THE PHONE TESTERS' APP IS BUILT FRESH, NOT FROM A STALE CACHE (w-e4d49a1539).
//
// 2026-11-02 workday, issue 3: General settings opened to a white screen,
// twice. Rechecked on main 2026-11-03: the page threw "phoneSite?.replace is not
// a function", because the built bundle carried `"phoneSite":{}` while
// `expo config` resolved it as "https://app.agentbox.ac". Metro's transform
// cache, shared by every build on the Mac, had kept an old copy of the app's
// config; `expo export --clear` embedded the right one and the page drew. The
// preview is built once per version of mobile/, so building it clear costs
// that one build a minute or two.
import { describe, it, expect } from 'vitest';
import { previewBuildArgv } from '../.claude/skills/product-loop/scripts/workday.mjs';

describe('how the testers\' phone app is built', () => {
  it('clears the bundler cache, so the config it embeds is today\'s', () => {
    expect(previewBuildArgv('/tmp/out')).toEqual(['expo', 'export', '--platform', 'web', '--clear', '--output-dir', '/tmp/out']);
  });
});

// The phone app imports renderer/ 168 times and shared/ 21 times (2026-11-03),
// so a fix there, like the close and Later rows in renderer/src/phone-rows.ts,
// changes the app while mobile/ stays the same. The preview was kept by
// mobile/'s version alone, so testers went on testing the build before the fix.
import { previewKeyOf } from '../.claude/skills/product-loop/scripts/workday.mjs';

describe('which build the testers get', () => {
  const trees = { mobile: 'a'.repeat(40), renderer: 'b'.repeat(40), shared: 'c'.repeat(40) };
  it('a new one when renderer/ changed and mobile/ did not', () => {
    expect(previewKeyOf({ ...trees, renderer: 'd'.repeat(40) })).not.toBe(previewKeyOf(trees));
  });
  it('a new one when shared/ changed', () => {
    expect(previewKeyOf({ ...trees, shared: 'e'.repeat(40) })).not.toBe(previewKeyOf(trees));
  });
  it('the same one when nothing it bundles changed', () => {
    expect(previewKeyOf({ ...trees })).toBe(previewKeyOf(trees));
  });
});

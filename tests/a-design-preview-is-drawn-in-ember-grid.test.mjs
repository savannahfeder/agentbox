// A DESIGN PREVIEW IS DRAWN IN EMBER GRID, NEVER IN PLAIN DARK.
//
// Her words, 2026-10-01, on a preview of the Settings team pane (w-8415594d19)
// that was shot in the standard dark theme: "when it is showing design
// previews, it should always use the Ember grid theme... I don't want us to"
// use the standard dark mode.
//
// The pictures agents send are the only way anyone judges a change, so a
// preview in a look nobody runs is a picture of a different app. Ember Grid is
// the app's own DEFAULT_SKIN, so the fix is that the shot harness defaults to
// it: a script that names no skin now draws what a person opening the app
// sees. A script that genuinely wants another look still names one, which is
// what the theme rounds do.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('the shot harness wears the app’s own look by default', () => {
  it('defaults wear() to ember-grid rather than no skin', () => {
    expect(read('scripts/lib/inbox-harness.mjs')).toContain("skin = 'ember-grid'");
  });

  it('names the same skin the app itself defaults to', () => {
    expect(read('renderer/src/skins.ts')).toContain("export const DEFAULT_SKIN: SkinId = 'ember-grid'");
  });

  it('still lets a script ask for another look, which the theme rounds do', () => {
    expect(read('scripts/lib/inbox-harness.mjs')).toContain('async function wear({ theme');
    expect(read('scripts/shot-hint-plate-looks.mjs')).toContain('skin: look.skin');
  });
});

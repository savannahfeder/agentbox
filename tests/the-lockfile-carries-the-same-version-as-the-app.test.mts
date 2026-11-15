// THE LOCKFILE CARRIES THE SAME VERSION AS THE APP.
//
// d872fdb (2026-10-05) moved package.json to 0.1.8 and left package-lock.json
// at 0.1.7. Every `npm install` in a checkout then rewrote the lockfile to
// match, which left a tracked file edited, and main/source-updater.mts reads an
// edited tracked file as "changes of your own" and stops offering the restart.
// The founder, that evening: "I dont see the restart component in the sidebar
// that occurs when changes have made." Measured in her app folder: the only
// edit apart from the two generated files was those two version lines.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

describe('package.json and package-lock.json', () => {
  it('name the same version, so an install leaves the checkout clean', () => {
    const pkg = read('package.json');
    const lock = read('package-lock.json');
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });
});

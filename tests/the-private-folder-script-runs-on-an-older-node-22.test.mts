// THE PRIVATE FOLDER SCRIPT RUNS ON AN OLDER NODE 22.
//
// On 2026-11-19 the daily phone loop found .claude/skills missing in the app
// folder and ran .agentbox/private-folder.sh, as the script asks. On this
// Mac's Node 22.14 it died with ERR_UNKNOWN_FILE_EXTENSION on
// main/private-folder.mts: Node strips types by itself only from 22.18. The
// script now adds the flag when this Node needs it, as scripts/run.mjs does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const script = fs.readFileSync('.agentbox/private-folder.sh', 'utf8');

describe('.agentbox/private-folder.sh', () => {
  it('adds the type-stripping flag only when this Node lacks it', () => {
    expect(script).toMatch(/process\.features\.typescript/);
    expect(script).toMatch(/--experimental-strip-types/);
  });

  it('asks Node before it loads the back end', () => {
    expect(script.indexOf('process.features.typescript')).toBeLessThan(script.indexOf("import('./main/private-folder.mts')"));
  });
});

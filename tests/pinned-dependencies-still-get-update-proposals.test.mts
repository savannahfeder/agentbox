// September 18: exact terminal pins had no update configuration. A patched
// release must have a route to a tested proposal without automatic merging.
import { it, expect } from 'vitest';
import fs from 'node:fs';
it('checks npm and action dependencies daily without ignoring security fixes', () => {
 const config=fs.readFileSync('.github/dependabot.yml','utf8');
 expect(config).toContain('package-ecosystem: "npm"');
 expect(config).toContain('package-ecosystem: "github-actions"');
 expect(config.match(/interval: "daily"/g)).toHaveLength(2);
 expect(config).not.toMatch(/ignore:|insecure-external-code-execution:|target-branch:/);
});

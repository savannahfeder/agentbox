// THE SECURITY SCAN NAMES ONLY FOLDERS THAT EXIST.
//
// w-9844544e9038, 2026-11-02. `relay/` went with the phone relay in b1d25e0d,
// and this workflow still handed `relay` to semgrep, which answers a path it
// cannot find with "[ERROR] Invalid scanning root: relay" and exit 2. So the
// security check failed on 55 pushes to main over two days without a rule ever
// running: the scan never started.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/security.yml', 'utf8');

// The command is a folded block, so it ends at the next YAML key or list item.
const lines = workflow.split('\n');
const first = lines.findIndex((l) => l.includes('semgrep scan'));
const rest = lines.slice(first).findIndex((l, i) => i > 0 && /^\s*(-\s|\S+:)/.test(l));
const command = lines
  .slice(first, rest === -1 ? undefined : first + rest)
  .join(' ')
  .trim()
  .split(/\s+/);

const takesAValue = new Set(['--config', '--exclude', '--include', '--metrics', '--severity']);
const roots = [];
for (let i = 2; i < command.length; i += 1) {
  if (takesAValue.has(command[i])) i += 1;
  else if (!command[i].startsWith('-')) roots.push(command[i]);
}

describe('the security workflow', () => {
  it('hands semgrep the code that ships', () => {
    expect(roots).toContain('main');
    expect(roots).toContain('shared');
    expect(roots).toContain('renderer/src');
    expect(roots.length).toBeGreaterThan(5);
  });

  it.each(roots)('scans %s, which is in the repository', (root) => {
    expect(fs.existsSync(root)).toBe(true);
  });
});

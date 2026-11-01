// THE SECURITY SCAN NAMES ONLY FOLDERS THAT EXIST.
//
// w-2351330171, 2026-11-01. b1d25e0d deleted the phone relay, `relay/`, but
// security.yml still passed `relay` to semgrep as a folder to scan. Semgrep
// stops with `Invalid scanning root: relay` and exit 2 before reading a file,
// so every push to main from then on showed a red cross with nothing wrong in
// the code. Measured by running the workflow's command with semgrep 1.182.1:
// exit 2 with `relay` in the list, exit 0 and 0 findings without it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/security.yml', 'utf8');

const TAKES_A_VALUE = new Set(['--config', '--exclude', '--metrics', '--include', '--exclude-rule']);

function scanRoots(yml) {
  const lines = yml.split('\n');
  const start = lines.findIndex((l, i) => /^\s*- run: >-?\s*$/.test(l) && /semgrep scan/.test(lines[i + 1] ?? ''));
  if (start < 0) return null;
  const indent = lines[start + 1].match(/^\s*/)[0].length;
  const block = [];
  for (const l of lines.slice(start + 1)) {
    if (l.trim() && l.match(/^\s*/)[0].length < indent) break;
    block.push(l.trim());
  }
  const words = block.join(' ').split(/\s+/).filter(Boolean);
  const roots = [];
  for (let i = words.indexOf('scan') + 1; i < words.length; i++) {
    if (words[i].startsWith('--')) {
      if (TAKES_A_VALUE.has(words[i])) i++;
      continue;
    }
    roots.push(words[i]);
  }
  return roots;
}

describe('the security scan', () => {
  const roots = scanRoots(workflow);

  it('is found in the workflow, with the folders it scans', () => {
    expect(roots).toEqual(expect.arrayContaining(['main', 'shared']));
  });

  it('names only folders and files that are in the repository', () => {
    expect(roots.filter((r) => !fs.existsSync(r))).toEqual([]);
  });

  it('reads an option value as an option, not as a folder', () => {
    expect(roots).not.toContain('p/javascript');
    expect(roots).not.toContain('off');
    expect(roots).not.toContain('node_modules');
  });

  it('would catch a folder that is gone', () => {
    const gone = workflow.replace(' preload.cjs', ' preload.cjs no-such-folder');
    expect(scanRoots(gone).filter((r) => !fs.existsSync(r))).toEqual(['no-such-folder']);
  });
});

// THE DISK-WIDE AGENT SCAN WAITS FOR THE IMPORT CARD.
//
// The scan lists the folder beside her project, and when that is under
// ~/Desktop macOS asks for the Desktop. It used to run one beat early, on the
// ⌘K card, so the panel landed over a screen that says nothing about agents.
//
// The renderer cannot be imported by node, so this pins the source: the effect
// that calls `api.agentFolders` is gated on the 'done' step and on nothing
// earlier.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'components', 'Onboarding.tsx'), 'utf8');

function effectAround(marker) {
  const at = src.indexOf(marker);
  expect(at, `${marker} is in Onboarding.tsx`).toBeGreaterThan(-1);
  const start = src.lastIndexOf('useEffect(() => {', at);
  return src.slice(start, at);
}

describe('the disk-wide agent scan', () => {
  const effect = effectAround('api.agentFolders()');

  it('runs on the import card and on no earlier step', () => {
    expect(effect).toMatch(/if \(run\.step !== 'done'\) return;/);
    expect(effect).not.toMatch(/'command'/);
  });

  it('is the only reader of the folders beside her project', () => {
    expect(src.split('api.agentFolders()').length - 1).toBe(1);
  });
});

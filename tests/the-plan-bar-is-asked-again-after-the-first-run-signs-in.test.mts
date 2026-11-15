// THE INBOX SAID AGENTS COULD NOT START AFTER CLAUDE CODE WAS SIGNED IN (F-198).
//
// QA batch 013, Debian 13, 0.1.22: a fresh user signed in to Claude Code on the
// first-run screen (footer CLAUDE CODE READY), opened the inbox, and the bar
// read "Agents cannot start until they have a plan to run on." with Sign in to
// Claude and Sign in to ChatGPT, while Settings showed the account signed in
// and a Claude task ran fine. The inbox asked once, when the app opened, which
// was under the first-run screen and before the sign-in; nothing asked again.
//
// The rule: the inbox asks when the first run hands over, not before, and asks
// again when the window comes back while the bar is up, because a sign-in
// somewhere else is exactly what makes it false.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

describe('when the inbox asks whether a plan can run agents', () => {
  const effect = app.match(/useEffect\(\(\) => \{[^\n]*checkPlan\(\);[^\n]*\}, \[[^\]]*\]\);/)?.[0] ?? '';

  it('is found', () => {
    expect(effect).not.toBe('');
  });

  it('does not ask while the first run is up', () => {
    expect(effect).toMatch(/!fresh/);
  });

  it('asks again when the first run hands over', () => {
    expect(effect).toMatch(/\[[^\]]*\bfresh\b[^\]]*\]/);
  });

  it('still waits for the walk, as it did', () => {
    expect(effect).toMatch(/!run/);
  });

  it('asks again when the window comes back while the bar is up', () => {
    const focus = app.match(/useEffect\(\(\) => \{\s*if \(!planWords\) return[\s\S]{0,400}?\}, \[planWords, checkPlan\]\);/)?.[0] ?? '';
    expect(focus).toMatch(/checkPlan\(\)/);
    expect(focus).toMatch(/addEventListener\('focus'/);
  });
});

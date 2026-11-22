// FINISHING SETUP IS COUNTED, AND ONLY FINISHING IT.
//
// `first_run_finished` has been on the approved list and the privacy page since
// 2026-08-19, and nothing ever sent it until 2026-10-06 (zero events from 33
// installs). The old walk sent it from its finishing function; since that walk
// went (2026-11-21) the split view's walkthrough sends it on its first real send,
// which is the end of setting up. Leaving without one is not finishing.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_NAMES } from '../shared/analytics-events.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '../renderer/src/App.tsx'), 'utf8');

describe('finishing setup is counted', () => {
  it('is one of the approved events', () => {
    expect(EVENT_NAMES).toContain('first_run_finished');
  });

  it('is sent once, on the walkthrough\'s first send', () => {
    const sends = app.match(/track\?\.\('first_run_finished'\)/g) ?? [];
    expect(sends).toHaveLength(1);
    expect(app).toMatch(/if \(first\) \{ firstSend\.current = true; setTour\(noteSent\(tour!\)\); try \{ window\.zero\?\.track\?\.\('first_run_finished'\); \} catch \{\} \}/);
  });
});

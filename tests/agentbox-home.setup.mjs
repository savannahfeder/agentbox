// NO TEST MAY WRITE INTO THE REAL APP HOME.
//
// The app's records moved out of the product folder and into the app's own home
// (main/store/home.mjs). That home is a real path on a real Mac, and a suite
// that used a temp store but the developer's actual home would quietly append
// to her ledgers while pretending to be hermetic.
//
// One temp home per test FILE, because vitest runs setup files per file and
// files run in parallel workers. Cleaned up after, so a full run leaves nothing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { setAppHome } from './app-home.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-home-'));
// UNDER EVERY NAME THIS APP HAS HAD, not just one. An agent session inherits
// the store root under all of them, the newest one wins inside `appHome`, and
// this line setting only the oldest is how a hermetic suite came to write into
// her real store. tests/app-home.mjs carries the measurement.
setAppHome(home);

// ONE CLOCK ZONE FOR EVERY RUN. The tests that check a time in words ("7:21 PM
// today") are written in Pacific time, and passed only on a Mac set to it: on
// GitHub's runners, which are on UTC, they read "2:21 AM today" and main was
// red on every push (measured 2026-10-01, three tests in two files). Node
// reads TZ whenever it changes, and this runs before each test file loads.
process.env.TZ = 'America/Los_Angeles';

afterAll(() => {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
});

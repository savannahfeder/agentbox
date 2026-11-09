// AN INVITE NEEDS NO SECOND SIGN-IN.
//
// The team setup page told a person waiting for an invite to sign out and in
// again, which was true until the sync learned to take up a late invite on its
// own (2026-09-30). Signing out would also have left anyone on a login without
// Google sign-in unable to get back in, since Google sign-in is not on yet.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/team/TeamPage.tsx', import.meta.url), 'utf8');

// Since 2026-10-01 an invite is asked, never taken up on its own (review: an
// automatic join let a stranger's team take your work), so the page says the
// invite shows up, and the person answers it with Join or Not now.
it('tells a person waiting for an invite that it shows up on its own', () => {
  expect(page).not.toMatch(/sign out and in again/);
  expect(page).toMatch(/It shows up here within a few seconds/);
  expect(page).toMatch(/>Join</);
  expect(page).toMatch(/>Not now</);
});

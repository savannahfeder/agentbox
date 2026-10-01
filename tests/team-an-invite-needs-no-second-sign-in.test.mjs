// AN INVITE NEEDS NO SECOND SIGN-IN.
//
// The team setup page told a person waiting for an invite to sign out and in
// again, which was true until the sync learned to take up a late invite on its
// own (2026-09-30). Signing out of the test login she was given to try the team
// version would also have left her unable to sign back in before Google is on.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../renderer/src/team/TeamPage.tsx', import.meta.url), 'utf8');

it('tells a person waiting for an invite that they join on their own', () => {
  expect(page).not.toMatch(/sign out and in again/);
  expect(page).toMatch(/You join within a few seconds/);
});

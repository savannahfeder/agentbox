// THE PHONE APP'S SIGN-UP ASKS YOUR NAME, as the phone site's does.
//
// The site's sign-up (renderer/src/team/SignInPage.tsx) asks a name, will not
// create the account without one, and says why it asks: teammates see it
// beside your threads. The app's sign-up had no name field and sent an empty
// name to the cloud; Codex's parity audit found it. The screen is React
// Native, which these tests do not draw, so they read the screen's source for
// the three things that must hold, and the sign-in that must not ask a name.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const screen = fs.readFileSync(new URL('../mobile/src/app/sign-in.tsx', import.meta.url), 'utf8');
const site = fs.readFileSync(new URL('../renderer/src/team/SignInPage.tsx', import.meta.url), 'utf8');

describe('creating an account on the phone', () => {
  it('asks a name, on the sign-up form only', () => {
    expect(screen).toMatch(/mode === 'sign-up' && <Field label="Name"/);
  });

  it('will not create the account without one, and sends the one typed', () => {
    expect(screen).toMatch(/canSubmit = [^;]*\(mode !== 'sign-up' \|\| !!name\.trim\(\)\)/);
    expect(screen).toMatch(/signUp\(name\.trim\(\), email\.trim\(\), password, phoneSite\)/);
    expect(screen).not.toMatch(/signUp\(''/);
  });

  it('says why it asks, in the site\'s words', () => {
    const why = 'Your teammates will see this name beside your threads and messages.';
    expect(site).toContain(why);
    expect(screen).toContain(why);
  });
});

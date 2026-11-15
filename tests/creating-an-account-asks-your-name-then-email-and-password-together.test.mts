// CREATING AN ACCOUNT ASKS YOUR NAME, THEN EMAIL AND PASSWORD TOGETHER (w-fbe5e95dea, 2026-11-10).
//
// The founder first found the account step cluttered: Google, a divider,
// three fields, a button, the terms and a switch at once. It became one field
// per screen. On those screens she then said the name screen "doesn't look
// clean and lacks a keyboard shortcut to move forward", that its button
// "looks like the button is fully clickable even with nothing in the input",
// and that email and password "should def not be one at a time" and looked
// poor beside other sign-ups. So: Google or email first, then your name, then
// email and password on one labelled screen. Each button is the setup's own
// with its ↵ key, and it reads as not ready until its fields are filled.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { nextSignUpPart, partMissing, partReady, SIGN_UP_PARTS } from '../renderer/src/team/sign-up-parts.ts';

const page = fs.readFileSync(new URL('../renderer/src/team/SignInPage.tsx', import.meta.url), 'utf8');
const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');

describe('the parts of a sign-up', () => {
  it('go Google or email, then your name, then email and password together', () => {
    expect(SIGN_UP_PARTS).toEqual(['start', 'name', 'login']);
    expect(nextSignUpPart('start', 1)).toBe('name');
    expect(nextSignUpPart('name', 1)).toBe('login');
    expect(nextSignUpPart('login', 1)).toBe(null);
  });
  it('go back one at a time, and out of the step from the first', () => {
    expect(nextSignUpPart('login', -1)).toBe('name');
    expect(nextSignUpPart('name', -1)).toBe('start');
    expect(nextSignUpPart('start', -1)).toBe(null);
  });
});

describe('when a part is ready to go on', () => {
  const blank = { name: '', email: '', password: '' };
  it('the name part needs a name, not spaces', () => {
    expect(partReady('name', blank)).toBe(false);
    expect(partReady('name', { ...blank, name: '   ' })).toBe(false);
    expect(partReady('name', { ...blank, name: 'Sam Rivera' })).toBe(true);
  });
  it('the login part needs an email and a password the cloud will take', () => {
    expect(partReady('login', { ...blank, email: 'sam@example.com', password: '123456' })).toBe(true);
    expect(partReady('login', { ...blank, email: 'sam@example.com', password: '12345' })).toBe(false);
    expect(partReady('login', { ...blank, email: 'sam', password: '123456' })).toBe(false);
    expect(partReady('login', { ...blank, email: '', password: '123456' })).toBe(false);
  });
  it('the first part has nothing to fill', () => {
    expect(partReady('start', blank)).toBe(true);
  });
  it('says which field is not ready, so an early press is never silent', () => {
    expect(partMissing('name', blank)).toEqual({ field: 'name', say: 'Enter your name.' });
    expect(partMissing('login', { ...blank, password: '123456' })).toEqual({ field: 'email', say: 'Enter your email address.' });
    expect(partMissing('login', { ...blank, email: 'sam', password: '123456' })).toEqual({ field: 'email', say: 'Enter a full email address.' });
    expect(partMissing('login', { ...blank, email: 'sam@example.com', password: '12345' })).toEqual({ field: 'password', say: 'Use a password of at least 6 characters.' });
    expect(partMissing('login', { ...blank, email: 'sam@example.com', password: '123456' })).toBe(null);
  });
});

describe('the setup account step', () => {
  it('asks for email and password on one screen, each with its label', () => {
    expect(page).toMatch(/part === 'login' && <>[\s\S]{0,700}type="email"[\s\S]{0,900}passwordField\('new-password', 'Password'/);
    expect(page).toMatch(/placeholder="you@company\.com"/);
    expect(page).toMatch(/placeholder="First and last name"/);
  });
  it('shows quiet dots in the empty password field, and Show only once there is something to show', () => {
    // The founder: "this looks super weird and sketch. Pretty sure password fields are ****". The
    // empty field read "6 or more characters" in plain text, as if a password were showing. Left
    // empty, she asked for "******* but more lowkey": faint dots, the placeholder's own colour.
    expect(page).toMatch(/passwordField\('new-password', 'Password', false, '••••••••'\)\}/);
    expect(page).not.toMatch(/6 or more characters/);
    expect(page).toMatch(/\{password && <button type="button" className="si-pw-show"/);
  });
  it('moves on with the setup’s own button and its ↵ key, which reads as not ready until the fields are filled', () => {
    expect(page).toMatch(/className=\{`ss-go\$\{ready \? '' : ' ss-not-yet'\}`\} aria-disabled=\{!ready \|\| undefined\}/);
    expect(page).toMatch(/<span className="ss-keys"><span className="ss-key">↵<\/span><\/span>/);
    expect(css).toMatch(/\.setup-split \.ss-go\.ss-not-yet \{[^}]*color: var\(--text-faint\)/);
  });
  it('still names what is missing when the button is pressed early, rather than saying nothing', () => {
    expect(page).toMatch(/if \(!ready\) \{ setMissing\(partMissing\(part, \{ name, email, password \}\)\); return; \}/);
  });
  it('lets the sign-in page own Back and Enter on this step', () => {
    expect(split).toMatch(/<SignInPage purpose="team" startOn="sign-up" inSetup onSignedIn=\{next\} onBack=\{back \?\? undefined\} primaryRef=\{accountPrimary\} termsAt=\{foot\} \/>/);
    expect(split).toMatch(/\{back && step !== 'account' && <button type="button" className="ss-back"/);
  });
  it('gives a step that draws no button of its own no stale Enter', () => {
    expect(split).toMatch(/primary\.current = step === 'account' \? \(\) => accountPrimary\.current\?\.\(\) : \(\) => \{\};/);
  });
});

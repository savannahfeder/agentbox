// THE CLOUD SIGN-IN PAGE SAYS WHAT IT WAITS ON, AND WHAT THE EMAIL LINK IS FOR.
//
// QA batch 004 (F-98, F-99, w-aaedc8f711): on Create account with Name left
// empty, the button sat dimmed and a click did nothing. No message, no marked
// field, nothing saying a name was wanted, on the first step of the paid cloud
// funnel. Name reads optional next to Email and Password, so the tester took
// the dead button for a broken sign-up.
//
// And "Check your email" said "Follow it on this computer and Agentbox signs
// you in" straight after the person had chosen a password, which reads like a
// passwordless link. The link confirms the address.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SignInPage, checkEmailLede } from '../renderer/src/team/SignInPage.tsx';
import { whatIsMissing } from '../renderer/src/team/what-is-missing.ts';

const draw = (props) => renderToStaticMarkup(React.createElement(SignInPage, props));
const full = { mode: 'sign-up', name: 'Sam', email: 'sam@example.com', password: 'hunter2' };

describe('which field a sign-up is waiting on', () => {
  it('is the name when it is empty', () => {
    expect(whatIsMissing({ ...full, name: '' })?.field).toBe('name');
    expect(whatIsMissing({ ...full, name: '   ' })?.field).toBe('name');
  });
  it('and says so in words', () => {
    expect(whatIsMissing({ ...full, name: '' })?.say).toBe('Enter your name.');
  });
  it('is the email when that is empty, whatever the name', () => {
    expect(whatIsMissing({ ...full, email: '' })?.field).toBe('email');
    expect(whatIsMissing({ ...full, name: '', email: '' })?.field).toBe('name');
  });
  it('is the password when that is empty', () => {
    expect(whatIsMissing({ ...full, password: '' })?.field).toBe('password');
    expect(whatIsMissing({ ...full, password: ' ' })).toBe(null); // a space is a password someone typed
  });
  it('and is nothing at all once the three are filled in', () => {
    expect(whatIsMissing(full)).toBe(null);
  });
});

describe('signing in wants no name', () => {
  const signIn = { mode: 'sign-in', name: '', email: 'sam@example.com', password: 'hunter2' };
  it('so an empty name holds nothing up', () => {
    expect(whatIsMissing(signIn)).toBe(null);
  });
  it('but an empty email or password still does', () => {
    expect(whatIsMissing({ ...signIn, email: '' })?.field).toBe('email');
    expect(whatIsMissing({ ...signIn, password: '' })?.field).toBe('password');
  });
});

describe('the button on an empty form', () => {
  const signUp = draw({ purpose: 'cloud', startOn: 'sign-up', onClose: () => {} });
  const signIn = draw({ purpose: 'cloud', onClose: () => {} });
  it('can be pressed, so pressing it can say what is missing', () => {
    expect(signUp).toMatch(/class="si-primary"[^>]*>Create account</);
    expect(signUp).not.toMatch(/class="si-primary" disabled/);
    expect(signIn).not.toMatch(/class="si-primary" disabled/);
  });
});

describe('the cloud "Check your email" line', () => {
  const cloud = checkEmailLede('sam@example.com', true);
  it('names the address the link went to', () => {
    expect(cloud).toContain('sam@example.com');
  });
  it('says the link confirms the address, not that it signs you in', () => {
    expect(cloud).toContain('to confirm your address');
    expect(cloud).not.toContain('signs you in');
  });
  it('and still says the link belongs on this computer, where the app is waiting', () => {
    expect(cloud).toContain('on this computer');
  });
  it('the team version, whose link lands in a browser, asks for a sign-in after it', () => {
    expect(checkEmailLede('sam@example.com', false)).toContain('sign in here');
  });
});

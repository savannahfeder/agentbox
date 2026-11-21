// A CLOUD RUN SIGNS IN BY BROWSER BEFORE IT ASKS FOR A TOKEN.
//
// What broke (2026-11-10): cloud agents asked the person to paste a Supabase
// access token when they would rather sign in through the browser, as they do
// in Claude Code. The cloud brief offered the "paste a token" card first and
// mentioned the browser sign-in after it, and Supabase's login could not run
// there at all: it refuses to start without a terminal, then waits for a code
// Supabase's page shows, which no card could send back. Measured on a cloud
// machine: under `script` with `--agent no --output-format text` it prints the
// link, and a code written into its input with `\r` reaches Supabase (`\n`
// does nothing). These tests hold the brief's order and the card's code box.

import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cloudNote, CLOUD_NOTE } from '../main/cloud/run.mts';
import { cleanSignIn, cleanSignInAnswer } from '../shared/sign-in-ask.mts';

const { SignInCard } = await import('../renderer/src/components/SignInCard.tsx');

const note = cloudNote({ keys: ['VERCEL_TOKEN'] });

describe('the cloud brief', () => {
  it('sends the agent to the browser sign-in before either line that asks for a token', () => {
    const browser = note.indexOf('sign_in tool');
    expect(browser).toBeGreaterThan(-1);
    expect(browser).toBeLessThan(note.indexOf('AGENTBOX-NEEDS: sign-in SERVICE'));
    expect(browser).toBeLessThan(note.indexOf('AGENTBOX-NEEDS: key VARIABLE'));
  });

  it('says the sign-in line asks for a pasted token, and only when the browser cannot be used', () => {
    expect(note).toMatch(/`AGENTBOX-NEEDS: sign-in SERVICE \| what it is for` asks them to paste the service's access token/);
    expect(note).toMatch(/only when the service has no browser sign-in here, or they chose Not now/i);
    expect(note).not.toContain('connects a service');
  });

  it('says how to run Supabase\'s login, which needs a terminal and a code', () => {
    expect(note).toContain('script -qfc "supabase login --no-browser --agent no --output-format text"');
    expect(note).toContain('printf \'%s\\r\' CODE > /tmp/sb-in');
    expect(note).toContain('asksForCode');
  });

  it('is left out of a run that cannot be given keys', () => {
    expect(CLOUD_NOTE).not.toContain('AGENTBOX-NEEDS: sign-in');
    expect(CLOUD_NOTE).not.toContain('asksForCode');
  });
});

describe('a sign-in that waits for a code', () => {
  const base = { id: 's-abcdef12', service: 'Supabase', url: 'https://supabase.com/dashboard/cli/login', at: 1 };

  it('keeps asksForCode only when it is true', () => {
    expect(cleanSignIn({ ...base, asksForCode: true })?.asksForCode).toBe(true);
    expect(cleanSignIn({ ...base, asksForCode: 'yes' })).not.toHaveProperty('asksForCode');
    expect(cleanSignIn(base)).not.toHaveProperty('asksForCode');
  });

  it('takes a trimmed code, and refuses a blank or missing one', () => {
    expect(cleanSignInAnswer({ id: base.id, said: 'code', code: '  8f3a2b1c \n' })?.code).toBe('8f3a2b1c');
    expect(cleanSignInAnswer({ id: base.id, said: 'code', code: '   ' })).toBeUndefined();
    expect(cleanSignInAnswer({ id: base.id, said: 'code' })).toBeUndefined();
  });

  it('carries no code on any other answer', () => {
    expect(cleanSignInAnswer({ id: base.id, said: 'signed-in', code: '8f3a2b1c' })).not.toHaveProperty('code');
    expect(cleanSignInAnswer({ id: base.id, said: 'skipped', code: '8f3a2b1c' })).not.toHaveProperty('code');
  });
});

describe('the card', () => {
  const draw = (ask) => renderToStaticMarkup(h(SignInCard, { ask, cloud: true, open: () => {}, answer: async () => null, copy: () => {} }));
  const ask = { id: 's-abcdef12', service: 'Supabase', url: 'https://supabase.com/dashboard/cli/login' };

  it('takes the code in place of I\'ve signed in, and still offers Not now', () => {
    const html = draw({ ...ask, asksForCode: true });
    expect(html).toContain('placeholder="Paste the code Supabase shows"');
    expect(html).not.toContain('I&#x27;ve signed in');
    expect(html).toContain('>Not now<');
  });

  it('has no code box when the login does not wait for one', () => {
    const html = draw(ask);
    expect(html).not.toContain('Paste the code');
    expect(html).toContain('>I&#x27;ve signed in<');
  });
});

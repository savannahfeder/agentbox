// A NEW TEAMMATE CAN STILL MAKE AN ACCOUNT ON THE TEAM CLOUD.
//
// This file said the opposite for an hour (w-db6f5e331e, 2026-10-05): the
// settings were switched to `enable_signup = false` and shipped as 7acc2a8.
// The founder then decided to leave sign-up open: someone who signs up
// "is using the product very actively", and opening up is "where we're going
// directionally next week".
//
// And it has to be open for the team to work at all. An invite is a row of an
// email address (team_invites); the person makes their own account, and
// accept_invites() joins them to every team that invited that address the
// first time they sign in. With sign-up off, nobody new could ever join.
// The access rules are what keep each team to itself, not this switch.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const toml = fs.readFileSync(new URL('../cloud/supabase/config.toml', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../cloud/supabase/migrations/20261001000000_team.sql', import.meta.url), 'utf8');

/** The value of `key` inside `[section]`, read off the file as written. */
function setting(section, key) {
  const start = toml.indexOf(`\n[${section}]\n`);
  if (start < 0) return undefined;
  const rest = toml.slice(start + section.length + 4);
  const end = rest.search(/\n\[/);
  const body = end < 0 ? rest : rest.slice(0, end);
  const m = body.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}

describe('the team cloud lets an invited person make their own account', () => {
  it('keeps sign-up on for the project and for email', () => {
    expect(setting('auth', 'enable_signup')).toBe('true');
    expect(setting('auth.email', 'enable_signup')).toBe('true');
  });
  it('because joining a team is an invite to an email, accepted after sign-in', () => {
    expect(migration).toContain('create or replace function public.accept_invites()');
    expect(migration).toMatch(/from public\.team_invites where lower\(email\) = lower\(me_email\)/);
  });
  it('and still lets nobody in anonymously', () => {
    expect(setting('auth', 'enable_anonymous_sign_ins')).toBe('false');
  });
});

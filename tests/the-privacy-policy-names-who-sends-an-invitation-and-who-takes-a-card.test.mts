// THE PRIVACY POLICY NAMES WHO SENDS AN INVITATION AND WHO TAKES A CARD.
//
// Inviting someone hands their email address to Resend, which sends the
// invitation (cloud/supabase/functions/_shared/team-invite.mjs), and paying
// hands a card to Stripe. The web app's privacy page named neither, so it did
// not say where an invited person's address goes, a line the onboarding
// checklist carried as not done since 2026-11-16.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync('phone-legal/privacy.html', 'utf8');
const section = (n: number) => page.split(/<h2>/).find((s) => s.startsWith(`${n}.`)) ?? '';

describe('the privacy page', () => {
  it('lists Resend among who receives what, with the invited address', () => {
    expect(section(5)).toMatch(/<strong>Resend<\/strong>[^<]*email address of each person you invite/);
  });

  it('lists Stripe, which takes the card, and says we never see the number', () => {
    expect(section(5)).toMatch(/<strong>Stripe<\/strong>[^<]*card/);
    expect(section(5)).toMatch(/never see your card number/);
  });

  it('says in Teams what happens to the address of someone you invite', () => {
    expect(section(6)).toMatch(/invite someone[^.]*email address[^.]*Resend/);
  });

  it('the code still sends invitations through Resend, so the page stays true', () => {
    expect(fs.readFileSync('cloud/supabase/functions/_shared/team-invite.mjs', 'utf8')).toMatch(/RESEND_API_KEY/);
  });
});

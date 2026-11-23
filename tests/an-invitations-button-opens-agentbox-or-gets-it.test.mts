// AN INVITATION'S BUTTON OPENS AGENTBOX, OR GETS IT.
//
// The invitation email's "Join <team>" button went to the download page, so
// someone who already had Agentbox was sent to download it again (onboarding
// checklist, "the invite button does not accept in one press"). It now goes to
// /invited on the web app, which opens the app, where the invitation waits in
// Needs you, or gets it for someone who has never had it. The invitation is
// kept against the address, so the link carries nothing about the team.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { inviteEmail, DOWNLOAD, JOIN_PAGE } from '../cloud/supabase/functions/_shared/team-invite.mjs';
import { invitedPageOf } from '../renderer/src/invited/invited.ts';
import { ourLink } from '../shared/room-links.mts';
import { WEB_APP } from '../shared/cloud-address.mts';

const mail = inviteEmail({ email: 'theo@northwind.test', team: 'Northwind', inviter: 'Dana Reyes' }, { from: 'Agentbox <hi@agentbox.ac>' });

describe('the email', () => {
  it("its button goes to the web app's invitation page, with nothing about the team in the address", () => {
    expect(JOIN_PAGE).toBe(`${WEB_APP}/invited`);
    expect(mail.html).toContain(`<a href="${JOIN_PAGE}"`);
    expect(mail.html).not.toContain(`<a href="${DOWNLOAD}"`);
  });
  it('its plain text still says how to get Agentbox for someone who has never had it', () => {
    expect(mail.text).toContain(`1. Download Agentbox: ${DOWNLOAD}`);
  });
});

describe('the page', () => {
  it('is /invited on the web app and nowhere else', () => {
    expect(invitedPageOf('/invited', true)).toBe(true);
    expect(invitedPageOf('/invited/', true)).toBe(true);
    expect(invitedPageOf('/invited', false)).toBe(false);
    expect(invitedPageOf('/invitedx', true)).toBe(false);
    expect(invitedPageOf('/t/invited/x', true)).toBe(false);
  });
  it('opens before the web app asks anyone to sign in', () => {
    const boot = fs.readFileSync('renderer/src/main.tsx', 'utf8');
    expect(boot.indexOf('bootInvited(')).toBeGreaterThan(-1);
    expect(boot.indexOf('bootInvited(')).toBeLessThan(boot.indexOf('else if (!theDoorNeedsItsKey()) boot();'));
  });
  it('opens the app with a link every release already brings to the front, and offers the download', () => {
    const page = fs.readFileSync('renderer/src/invited/InvitedPage.tsx', 'utf8');
    expect(page).toMatch(/href=\{`\$\{JOIN_SCHEME\}:\/\/cloud`\}/);
    expect(ourLink('agentbox://cloud')).toBe(true);
    expect(fs.readFileSync('main/main.mts', 'utf8')).toMatch(/app\.on\('open-url', \(e, url\) => \{ e\.preventDefault\(\); if \(ourLink\(url\)\) showWindow\(\);/);
    expect(page).toMatch(/href=\{SITE\}/);
    expect(fs.readFileSync('renderer/src/shared-file/SharedFilePage.tsx', 'utf8')).toContain(`export const SITE = '${DOWNLOAD}';`);
  });
});

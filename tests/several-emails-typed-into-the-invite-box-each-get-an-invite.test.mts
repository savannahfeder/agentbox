// SEVERAL EMAILS TYPED INTO THE INVITE BOX EACH GET AN INVITE.
//
// On the Nov 26 onboarding call a team owner typed the addresses she
// remembered into Settings › Team › Invite people, separated by commas, and
// got "… is not an email address": the box took one address per press, so a
// team of ten was ten rounds. Measured by reading the box's submit, which
// trimmed the whole text and sent it as one email, and the phone's and the
// shared-file box's, which did the same.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { inviteEach, pastedInvites, splitInvites } from '../renderer/src/team/invite-list.ts';

const read = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('reading the box', () => {
  it('splits on commas, semicolons, spaces and new lines', () => {
    expect(splitInvites('a@x.co, b@x.co;c@x.co d@x.co\ne@x.co').emails).toEqual(['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co', 'e@x.co']);
  });
  it('takes the address out of a pasted "Name <address>" line, names with commas too', () => {
    expect(splitInvites('Jane Doe <jane@x.co>, "Roe, Rick" <rick@x.co>\nmailto:sam@x.co').emails).toEqual(['jane@x.co', 'rick@x.co', 'sam@x.co']);
  });
  it('still takes one address on its own', () => {
    expect(splitInvites('  dana@x.co ')).toEqual({ emails: ['dana@x.co'], onTeam: [], notEmails: [] });
  });
  it('asks once for an address typed twice, whatever its case', () => {
    expect(splitInvites('Dana@x.co, dana@X.co').emails).toEqual(['dana@x.co']);
  });
  it('leaves out people already on the team and people already invited', () => {
    const got = splitInvites('maya@x.co, jo@x.co, new@x.co', { onTeam: ['Maya@x.co'], invited: ['jo@x.co'] });
    expect(got.emails).toEqual(['new@x.co']);
    expect(got.onTeam).toEqual(['maya@x.co']);
  });
  it('keeps what is not an email apart, as typed', () => {
    expect(splitInvites('frank, a@x.co, bob@').notEmails).toEqual(['frank', 'bob@']);
  });
  it('reads nothing in an empty box', () => {
    expect(splitInvites(' ,  ; \n')).toEqual({ emails: [], onTeam: [], notEmails: [] });
  });
});

describe('pasting a list', () => {
  it('turns new lines into commas, since a one-line box would join the addresses', () => {
    expect(pastedInvites('a@x.co\r\nb@x.co\nc@x.co\n')).toBe('a@x.co, b@x.co, c@x.co');
  });
  it('leaves a one-line paste alone', () => {
    expect(pastedInvites('a@x.co')).toBeNull();
  });
});

describe('inviting each', () => {
  const asked: string[] = [];
  const ok = async (e: string) => { asked.push(e); return null; };

  it('invites every address, one call each, and empties the box', async () => {
    asked.length = 0;
    expect(await inviteEach('a@x.co, b@x.co', {}, ok)).toEqual({ invited: ['a@x.co', 'b@x.co'], left: '', problem: null });
    expect(asked).toEqual(['a@x.co', 'b@x.co']);
  });
  it('invites the good ones and leaves the rest in the box, named', async () => {
    expect(await inviteEach('a@x.co, frank, bob', {}, ok)).toEqual({ invited: ['a@x.co'], left: 'frank, bob', problem: 'frank and bob are not email addresses.' });
    expect((await inviteEach('frank', {}, ok)).problem).toBe('frank is not an email address.');
  });
  it('stops at the first refusal and keeps what was not sent, with the refusal', async () => {
    const limit = async (e: string) => (e === 'b@x.co' ? 'You have sent 20 invitations today, the most for one day. Try again tomorrow.' : null);
    expect(await inviteEach('a@x.co, b@x.co, c@x.co', {}, limit)).toEqual({
      invited: ['a@x.co'], left: 'b@x.co, c@x.co', problem: 'You have sent 20 invitations today, the most for one day. Try again tomorrow.',
    });
  });
  it('says so when everyone typed is already on the team', async () => {
    expect(await inviteEach('maya@x.co', { onTeam: ['maya@x.co'] }, ok)).toEqual({ invited: [], left: '', problem: 'maya@x.co is already on the team.' });
  });
});

describe('every invite box reads it this way', () => {
  it('the Team page', () => {
    const page = read('renderer/src/team/TeamPage.tsx');
    expect(page).toMatch(/inviteEach\(email,/);
    expect(page).toMatch(/onPaste=/);
    expect(page).toContain('placeholder="Their emails"');
  });
  it('the Team page says what was not sent under the box, not at the foot of a long page', () => {
    const page = read('renderer/src/team/TeamPage.tsx');
    expect(page).toMatch(/<\/form>\}\n\s*\{inviteProblem && <p className="tm-invite-problem">\{inviteProblem\}<\/p>\}/);
  });
  it('the phone’s Team page', () => {
    const phone = read('mobile/src/ui/TeamPage.tsx');
    expect(phone).toMatch(/inviteEach\(email,/);
    expect(phone).toContain('placeholder="Their emails"');
  });
  it('the box that adds people to a shared file', () => {
    const share = read('renderer/src/components/ShareLink.tsx');
    expect(share).toMatch(/inviteEach\(adding,/);
    expect(share).not.toContain('type="email"');
  });
});

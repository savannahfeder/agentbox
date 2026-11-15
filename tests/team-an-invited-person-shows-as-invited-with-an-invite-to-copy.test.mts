// AN INVITED PERSON WHO HAS NOT JOINED SHOWS AS INVITED, WITH AN INVITE TO COPY.
//
// Maya invited jordan@lumen.test, typed "jordan"
// into New thread > To > Find a person and read "Nobody on the team matches
// that." The Team page said "Invited. They join when they sign in with this
// email." and offered nothing to send him, so she wrote the invite by hand in
// her own mail. Measured by searching the To list and the Team page for any
// use of the team's sent invites: the To list read none, the page only listed them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { findInvited } from '../renderer/src/threads/composer-rules.ts';
import { inviteWords } from '../renderer/src/team/invite-words.ts';

const sent = [{ email: 'jordan@lumen.test', invitedBy: 'p-maya' }, { email: 'sofia@lumen.test', invitedBy: 'p-maya' }];
const people = [{ id: 'p-maya', name: 'Maya Costa', email: 'maya@lumen.test' }, { id: 'p-sofia', name: 'Sofia', email: 'Sofia@lumen.test' }];

describe('finding an invited person in To', () => {
  it('finds them by the start of their email', () => {
    expect(findInvited(sent, people, 'jordan')).toEqual(['jordan@lumen.test']);
    expect(findInvited(sent, people, 'JO')).toEqual(['jordan@lumen.test']);
  });
  it('does not match the domain the whole team shares', () => {
    expect(findInvited(sent, people, 'lumen')).toEqual([]);
  });
  it('leaves out someone who has joined since, whatever the case of their email', () => {
    expect(findInvited(sent, people, 'sofia')).toEqual([]);
  });
  it('shows nobody until something is typed', () => {
    expect(findInvited(sent, people, '  ')).toEqual([]);
    expect(findInvited(undefined, people, 'jordan')).toEqual([]);
  });
});

describe('the To list', () => {
  const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
  it('draws an invited person as a row nobody can pick, saying why', () => {
    expect(card).toMatch(/findInvited\(team\?\.state\.sent/);
    expect(card).toMatch(/Invited, not joined yet/);
  });
  it('says nobody matches only when no invited person does either', () => {
    expect(card).toMatch(/!found\.length && !invitedFound\.length && <span className="tc-none">Nobody on the team matches that\./);
  });
});

describe('the invite to copy', () => {
  it('says who invited them, to which team, and how they join', () => {
    expect(inviteWords({ from: 'Maya Costa', team: 'Lumen', email: 'jordan@lumen.test' }))
      .toBe('Maya invited you to Lumen on Agentbox. To join, download Agentbox from https://agentbox.ac/download and sign in with jordan@lumen.test.');
  });
  it('still reads with no name for who sent it', () => {
    expect(inviteWords({ from: null, team: 'Lumen', email: 'jordan@lumen.test' })).toMatch(/^You are invited to Lumen on Agentbox\. /);
  });
  it('is a Copy invite on each invited person on the Team page', () => {
    const page = fs.readFileSync(new URL('../renderer/src/team/TeamPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/navigator\.clipboard\?\.writeText\(inviteWords\(/);
    expect(page).toMatch(/'Copied' : 'Copy invite'/);
  });
});

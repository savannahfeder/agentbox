// AN INVITATION IS EMAILED TO THE PERSON INVITED (w-1e52420829, 2026-11-13).
//
// Asked to test that invite emails arrive, the finding was that there were
// none. Inviting someone wrote a row in team_invites and told nobody: the
// person learned of it only by signing in to Agentbox with that address. The
// setup said "Send 1 invite" and then "1 teammate invited".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { DOWNLOAD, inviteEmail, readInviteConfig, sendInvites } from '../cloud/supabase/functions/_shared/team-invite.mjs';

const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const config = { from: 'Agentbox <hello@example.test>', key: 'k'.repeat(24), resendKey: 're_x' };
const invite = { team_id: 't1', email: 'theo@northwind.test', team: 'Northwind', inviter: 'Dana Whitfield' };

describe('the email', () => {
  const mail = inviteEmail(invite, config);
  it('goes to the person invited, from the address replies go to', () => {
    expect(mail.to).toEqual(['theo@northwind.test']);
    expect(mail.from).toBe(config.from);
    expect(mail.reply_to).toBe('hello@example.test');
  });
  it('says who invited them and to which team, in its subject', () => {
    expect(mail.subject).toBe('Dana Whitfield invited you to Northwind on Agentbox');
  });
  it('says how to join in three steps, with the address to sign in with', () => {
    expect(mail.text).toContain(`1. Download Agentbox: ${DOWNLOAD}`);
    expect(mail.text).toContain('2. Sign in with theo@northwind.test.');
    expect(mail.text).toContain('3. Accept the invitation to Northwind.');
  });
  // Read before it was ever sent: "I don't like this phrasing" of a line describing the product,
  // and "shouldn't it have an invite link or button?"
  it('does not describe the product in words nobody approved', () => {
    expect(mail.text).not.toMatch(/in one place|in the background/);
    expect(mail.text.split('\n')[0]).toBe('Dana Whitfield invited you to join Northwind on Agentbox.');
    expect(mail.text.split('\n')[2]).toBe('To join:');
  });
  it('has a button that goes where Agentbox is downloaded, which is a page that exists', () => {
    expect(mail.html).toContain(`<a href="${DOWNLOAD}"`);
    expect(mail.html).toContain('>Get Agentbox</a>');
    expect(mail.html).toContain('border-radius');
    expect(mail.html).toContain('Sign in with theo@northwind.test and your invitation to Northwind is waiting.');
  });
  it('writes a name into the page as text, never as markup', () => {
    const odd = inviteEmail({ ...invite, inviter: 'Dana "<b>" & co', team: 'A&B' }, config);
    expect(odd.html).not.toMatch(/<b>/);
    expect(odd.html).toContain('A&amp;B');
  });
  it('is plain words: no dashes for pauses, nothing it cannot back', () => {
    expect(mail.text).not.toMatch(/—|–|!/);
    expect(mail.text).not.toMatch(/free|unlimited|best/i);
  });
  it('still reads when the inviter has no name, or the team has none', () => {
    expect(inviteEmail({ ...invite, inviter: '' }, config).subject).toBe('You are invited to Northwind on Agentbox');
    expect(inviteEmail({ ...invite, team: '' }, config).subject).toBe('Dana Whitfield invited you to their team on Agentbox');
  });
  it('carries no line break or angle bracket a name could smuggle into a header', () => {
    const odd = inviteEmail({ ...invite, inviter: 'Dana\r\nBcc: x@y.test', team: 'North<wind>' }, config);
    expect(odd.subject).not.toMatch(/[\r\n<>]/);
  });
});

describe('the switch', () => {
  it('is off until every secret is set', () => {
    expect(readInviteConfig(() => '')).toBe(null);
    expect(readInviteConfig((n: string) => ({ TEAM_INVITE_FROM: config.from, TEAM_INVITE_KEY: config.key, RESEND_API_KEY: 're_x' } as Record<string, string>)[n])).toEqual(config);
  });
  it('refuses a key too short to be a secret', () => {
    expect(readInviteConfig((n: string) => ({ TEAM_INVITE_FROM: config.from, TEAM_INVITE_KEY: 'short', RESEND_API_KEY: 're_x' } as Record<string, string>)[n])).toBe(null);
  });
});

describe('sending', () => {
  const db = (rows: typeof invite[]) => {
    const state = { claimed: [] as string[], released: [] as string[] };
    return {
      state,
      waiting: async () => rows,
      claim: async (i: typeof invite) => { if (state.claimed.includes(i.email)) return false; state.claimed.push(i.email); return true; },
      release: async (i: typeof invite) => { state.released.push(i.email); },
    };
  };
  it('sends each waiting invitation once', async () => {
    const d = db([invite, { ...invite, email: 'lena@northwind.test' }]);
    const sent: string[] = [];
    const out = await sendInvites({ db: d, config, send: async (m: { to: string[] }) => { sent.push(m.to[0]); return { ok: true }; } });
    expect(sent).toEqual(['theo@northwind.test', 'lena@northwind.test']);
    expect(out).toEqual({ sent: 2, failed: 0 });
  });
  it('does not send one another call already took', async () => {
    const d = db([invite]);
    d.state.claimed.push(invite.email);
    const out = await sendInvites({ db: d, config, send: async () => ({ ok: true }) });
    expect(out).toEqual({ sent: 0, failed: 0 });
  });
  it('gives a failed one back so the next call tries it again, and says how many failed', async () => {
    const d = db([invite]);
    const out = await sendInvites({ db: d, config, send: async () => ({ ok: false, error: 'down' }) });
    expect(d.state.released).toEqual(['theo@northwind.test']);
    expect(out).toEqual({ sent: 0, failed: 1, error: 'down' });
  });
  it('sends nothing on a dry run, and says how many are waiting', async () => {
    const d = db([invite]);
    const out = await sendInvites({ db: d, config, dryRun: true, send: async () => { throw new Error('sent'); } });
    expect(out).toEqual({ sent: 0, failed: 0, waiting: 1 });
    expect(d.state.claimed).toEqual([]);
  });
});

describe('the database', () => {
  const sql = read('cloud/supabase/migrations/20261113000000_an_invitation_is_emailed.sql');
  it('marks when an invitation was emailed, so none goes twice', () => {
    expect(sql).toMatch(/alter table public\.team_invites add column if not exists emailed_at timestamptz;/);
  });
  it('calls the function when someone is invited, and only once its address and key are set', () => {
    expect(sql).toMatch(/after insert on public\.team_invites/);
    expect(sql).toMatch(/if target is null or knock is null then\s+return new;/);
  });
  it('never holds up or fails the invitation itself', () => {
    expect(sql).toMatch(/exception when others then\s+return new;/);
  });
  it('gives up on an invitation a week old', () => {
    expect(sql).toMatch(/created_at > now\(\) - interval '7 days'/);
  });
});

describe('the function', () => {
  const fn = read('cloud/supabase/functions/team-invite/index.ts');
  it('answers only to the database’s own key, and is off until configured', () => {
    expect(fn).toMatch(/if \(!config\) return json\(\{ ok: false, error: 'not configured' \}, 503\);/);
    expect(fn).toMatch(/keysMatch\(req\.headers\.get\('x-team-invite-key'\), config\.key\)/);
  });
  it('has a deadline on every call it makes', () => {
    expect([...fn.matchAll(/fetch\(/g)].length).toBe([...fn.matchAll(/AbortSignal\.timeout\(CALL_MS\)/g)].length);
  });
  it('is registered to be called without a sign-in', () => {
    expect(read('cloud/supabase/config.toml')).toMatch(/\[functions\.team-invite\]\nverify_jwt = false/);
  });
});

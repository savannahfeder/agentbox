// THE EMAIL AN INVITED PERSON GETS: its words and who it goes to. No network
// and no database here, so the tests run it as it is; ../team-invite/index.ts
// is the part that talks to both.

/** Where someone who has never had Agentbox gets it. */
export const DOWNLOAD = 'https://agentbox.ac';

const addressIn = (from) => /<([^<>\s]+)>/.exec(String(from))?.[1] ?? String(from).trim();
// A name is somebody else's text going into a subject line.
const plain = (s) => String(s ?? '').replace(/[\r\n<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function keysMatch(given, expected) {
  const a = String(given ?? '');
  const b = String(expected ?? '');
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Null until every secret is set, which is how the email is switched off.
export function readInviteConfig(get) {
  const v = (name) => String(get(name) ?? '').trim();
  const config = { from: v('TEAM_INVITE_FROM'), key: v('TEAM_INVITE_KEY'), resendKey: v('RESEND_API_KEY') };
  return config.from && config.key.length >= 24 && config.resendKey ? config : null;
}

export function inviteEmail({ email, team, inviter }, { from }) {
  const who = plain(inviter);
  const where = plain(team);
  const to = String(email).trim();
  const subject = who
    ? `${who} invited you to ${where || 'their team'} on Agentbox`
    : `You are invited to ${where || 'a team'} on Agentbox`;
  const first = `${who || 'Someone'} invited you to join ${where || 'their team'} on Agentbox.`;
  const last = 'If you were not expecting this, you can ignore it.';
  const text = [
    first,
    '',
    'To join:',
    `1. Download Agentbox: ${DOWNLOAD}`,
    `2. Sign in with ${to}.`,
    `3. Accept the invitation to ${where || 'the team'}.`,
    '',
    last,
  ].join('\n');
  // The invitation is kept against the address, so the button has no token to carry: it goes where
  // Agentbox is downloaded, and signing in with this address is what finds the invitation.
  const waiting = `Sign in with ${to} and your invitation to ${where || 'the team'} is waiting.`;
  const p = 'margin:0 0 20px;font:16px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a';
  const html = [
    '<div style="max-width:480px;margin:0 auto;padding:32px 24px">',
    `<p style="${p}">${escapeHtml(first)}</p>`,
    `<p style="margin:0 0 20px"><a href="${DOWNLOAD}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#1a1a1a;color:#ffffff;text-decoration:none;font:600 16px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">Get Agentbox</a></p>`,
    `<p style="${p}">${escapeHtml(waiting)}</p>`,
    `<p style="${p.replace('#1a1a1a', '#6b6b6b').replace('16px', '14px')}">${escapeHtml(last)}</p>`,
    '</div>',
  ].join('');
  return { from, to: [to], reply_to: addressIn(from), subject, text, html };
}

/** Sends every invitation that is waiting, each once. A failed one is given back for the next call. */
export async function sendInvites({ db, send, config, dryRun = false }) {
  const waiting = await db.waiting();
  if (dryRun) return { sent: 0, failed: 0, waiting: waiting.length };
  let sent = 0;
  let failed = 0;
  let error;
  for (const invite of waiting) {
    if (!(await db.claim(invite))) continue;
    const out = await send(inviteEmail(invite, config), invite);
    if (out.ok) { sent += 1; continue; }
    failed += 1;
    error = out.error;
    await db.release(invite);
  }
  return { sent, failed, ...(error ? { error } : {}) };
}

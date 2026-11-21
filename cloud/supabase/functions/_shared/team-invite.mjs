// THE EMAIL AN INVITED PERSON GETS: its words, its look and who it goes to. No
// network and no database here, so the tests run it as it is;
// ../team-invite/index.ts is the part that talks to both.

/** Where someone who has never had Agentbox gets it. */
export const DOWNLOAD = 'https://agentbox.ac';
/** The button's page: it opens Agentbox for someone who has it, and gets it for someone who does not. */
export const JOIN_PAGE = 'https://app.agentbox.ac/invited';

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
  // With no address of its own it sends from the one the thank-you note uses, which the mail service already knows.
  const noteAddress = v('FOUNDER_NOTE_FROM') ? addressIn(v('FOUNDER_NOTE_FROM')) : '';
  const config = { from: v('TEAM_INVITE_FROM') || (noteAddress ? `Agentbox <${noteAddress}>` : ''), key: v('TEAM_INVITE_KEY'), resendKey: v('RESEND_API_KEY') };
  return config.from && config.key.length >= 24 && config.resendKey ? config : null;
}

// THE LOOK IS THE ONE APPROVED on 2026-11-13 (the light letter). Mail apps drop
// grid, flex, font files and often pictures, so the mark is nine round cells
// in a table and the type is the app's font where a computer has it.
const FONT = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = '#1a1817';
const PAPER = '#f7f5f0';
const dot = (hot) => `<td style="padding:0 3px 3px 0"><div style="width:6px;height:6px;border-radius:50%;background:${hot ? '#ee6018' : '#b9b4ab'};font-size:0;line-height:0">&nbsp;</div></td>`;
const MARK = `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${[0, 1, 2].map((row) => `<tr>${[0, 1, 2].map((col) => dot(row === 0 && col === 2)).join('')}</tr>`).join('')}</table>`;

export function inviteEmail({ email, team, inviter }, { from }) {
  const who = plain(inviter);
  const where = plain(team);
  const to = String(email).trim();
  const subject = who
    ? `${who} invited you to ${where || 'their team'} on Agentbox`
    : `You are invited to ${where || 'a team'} on Agentbox`;
  const line = who
    ? `${who} invited you to join ${where || 'their team'}.`
    : `You are invited to join ${where || 'a team'}.`;
  const join = `Join ${where || 'the team'}`;
  const text = [
    `${who || 'Someone'} invited you to join ${where || 'their team'} on Agentbox.`,
    '',
    'To join:',
    `1. Download Agentbox: ${DOWNLOAD}`,
    `2. Sign in with ${to}.`,
    `3. Accept the invitation to ${where || 'the team'}.`,
    '',
    'If you were not expecting this, you can ignore it.',
  ].join('\n');
  // The invitation is kept against the address, so the button has no token to carry: signing in
  // with this address is what finds the invitation.
  const html = [
    `<div style="padding:24px 12px"><div style="max-width:560px;margin:0 auto;padding:44px;background:${PAPER};border:1px solid #e4e0d8;border-radius:16px">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:3px 5px 0 0;vertical-align:middle">${MARK}</td><td style="vertical-align:middle;font:500 15px/1 ${FONT};color:${INK}">Agentbox</td></tr></table>`,
    `<h1 style="margin:40px 0 0;font:500 34px/1.15 ${FONT};letter-spacing:-0.02em;color:${INK}">${escapeHtml(line)}</h1>`,
    `<p style="margin:30px 0 0"><a href="${JOIN_PAGE}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:${INK};color:${PAPER};text-decoration:none;font:500 16px/1.2 ${FONT}">${escapeHtml(join)}</a></p>`,
    `<p style="margin:28px 0 0;font:13px/1.6 ${FONT};color:#8a857c">${escapeHtml(`Sign in with ${to} and the invitation is waiting.`)}<br>Not expecting this? Ignore it.</p>`,
    '</div></div>',
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

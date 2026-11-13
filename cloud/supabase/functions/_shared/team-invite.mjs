// THE EMAIL AN INVITED PERSON GETS: its words and who it goes to. No network
// and no database here, so the tests run it as it is; ../team-invite/index.ts
// is the part that talks to both.

/** Where someone who has never had Agentbox gets it. */
export const DOWNLOAD = 'https://agentbox.ac';

const addressIn = (from) => /<([^<>\s]+)>/.exec(String(from))?.[1] ?? String(from).trim();
// A name is somebody else's text going into a subject line.
const plain = (s) => String(s ?? '').replace(/[\r\n<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

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
  const text = [
    `${who || 'Someone'} invited you to join ${where || 'their team'} on Agentbox.`,
    '',
    'Agentbox is one inbox for your team and its agents. Threads, tasks and files are in one place, and agents work in the background until they need you.',
    '',
    'To join:',
    `1. Download Agentbox: ${DOWNLOAD}`,
    `2. Sign in with ${to}.`,
    `3. Accept the invitation to ${where || 'the team'}.`,
    '',
    'If you were not expecting this, you can ignore it.',
  ].join('\n');
  return { from, to: [to], reply_to: addressIn(from), subject, text };
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

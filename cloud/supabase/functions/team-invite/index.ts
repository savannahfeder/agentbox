// AN INVITATION IS EMAILED TO THE PERSON INVITED (w-1e52420829).
//
// The database calls this when a row lands in team_invites
// (migrations/20261113000000_an_invitation_is_emailed.sql), knocking with its
// own key. It sends every invitation of the last week that has not been
// emailed, through Resend. The words are in ../_shared/team-invite.mjs.
//
// The address is a secret, never a line here, because the repository is public:
//
//   TEAM_INVITE_FROM   "Agentbox <the address replies go to>"
//   TEAM_INVITE_KEY    what the database knocks with, 24 characters or more
//   RESEND_API_KEY     shared with the feedback function
//
// Until all three are set it refuses with "not configured", which is the off
// switch. POST {"dryRun": true} says how many are waiting and sends nothing.
import { keysMatch, readInviteConfig, sendInvites } from '../_shared/team-invite.mjs';

const CALL_MS = 20_000;
const AT_ONCE = 20;

type Invite = { team_id: string; email: string; team: string; inviter: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// What comes back lands in the database's log, which should not hold an address.
const noAddresses = (s: string) => s.replace(/[^\s<>"'`]+@[^\s<>"'`]+/g, '[address]').slice(0, 300);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const config = readInviteConfig((name: string) => Deno.env.get(name));
  if (!config) return json({ ok: false, error: 'not configured' }, 503);
  if (!keysMatch(req.headers.get('x-team-invite-key'), config.key)) return json({ ok: false, error: 'wrong key' }, 401);
  const body = await req.json().catch(() => ({})) as { dryRun?: unknown };

  const base = `${Deno.env.get('SUPABASE_URL')}/rest/v1`;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const rest = (route: string, init: RequestInit = {}) => fetch(`${base}${route}`, {
    ...init,
    headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(CALL_MS),
  });
  const must = async (res: Response, what: string) => {
    if (!res.ok) throw new Error(`${what}: ${res.status} ${noAddresses(await res.text())}`);
    return res;
  };
  const one = (i: Invite) => `team_id=eq.${encodeURIComponent(i.team_id)}&email=eq.${encodeURIComponent(i.email)}`;

  const db = {
    async waiting(): Promise<Invite[]> {
      const res = await must(await rest('/rpc/team_invites_to_email', { method: 'POST', body: JSON.stringify({ how_many: AT_ONCE }) }), 'reading who was invited');
      return await res.json();
    },
    async claim(i: Invite) {
      const res = await must(await rest(`/team_invites?${one(i)}&emailed_at=is.null`, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ emailed_at: new Date().toISOString() }),
      }), 'marking an invitation');
      return (await res.json()).length === 1;
    },
    async release(i: Invite) {
      await must(await rest(`/team_invites?${one(i)}`, { method: 'PATCH', body: JSON.stringify({ emailed_at: null }) }), 'unmarking an invitation');
    },
  };

  const send = async (mail: unknown) => {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${config.resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(mail),
        signal: AbortSignal.timeout(CALL_MS),
      });
      if (res.ok) return { ok: true };
      const why = await res.json().catch(() => ({})) as { name?: string; message?: string };
      return { ok: false, error: noAddresses([why.name, why.message].filter(Boolean).join(': ') || `Resend said ${res.status}`) };
    } catch (err) {
      return { ok: false, error: noAddresses(String((err as Error)?.message ?? err)) };
    }
  };

  try {
    const out = await sendInvites({ db, send, config, dryRun: body.dryRun === true });
    return json({ ok: !out.failed, ...out }, out.failed ? 502 : 200);
  } catch (err) {
    return json({ ok: false, error: noAddresses(String((err as Error)?.message ?? err)) }, 502);
  }
});

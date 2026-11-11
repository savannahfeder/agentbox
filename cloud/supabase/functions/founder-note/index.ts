// THE FOUNDER'S THANK-YOU NOTE, ONCE TO EACH NEW ACCOUNT (w-5efd743952).
//
// The database's daily job (migrations/20261110000000_a_thank_you_note_from_the_founder.sql)
// calls this with its own key. It finds the accounts that signed up 3 to 7
// days ago and have not had the note, and sends each one through Resend.
// The rules are in ../_shared/founder-note.mjs.
//
// Every address and name is a secret, never a line here, because the
// repository is public:
//
//   FOUNDER_NOTE_FROM    "Name from Agentbox <the address replies go to>"
//   FOUNDER_NOTE_NAME    the name it is signed with
//   FOUNDER_NOTE_OWNERS  the sender's own account ids, comma separated: they
//                        and their teammates never get it
//   FOUNDER_NOTE_KEY     what the daily job knocks with
//   RESEND_API_KEY       shared with the feedback function
//
// Until all five are set it refuses with "not configured", which is the off
// switch. POST {"dryRun": true} says who is due and sends nothing;
// {"previewTo": an owner's account id, "version": "name" or "lowercase"}
// sends that account the note in that version.
import { VERSIONS, keysMatch, previewFor, readNoteConfig, sendFounderNotes } from '../_shared/founder-note.mjs';

const CALL_MS = 20_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Resend's reason can quote the address it refused; this function's answer
// lands in the database's job log, which should not hold one.
const noAddresses = (s: string) => s.replace(/[^\s<>"'`]+@[^\s<>"'`]+/g, '[address]').slice(0, 300);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const config = readNoteConfig((name: string) => Deno.env.get(name));
  if (!config) return json({ ok: false, error: 'not configured' }, 503);
  if (!keysMatch(req.headers.get('x-founder-note-key'), config.key)) return json({ ok: false, error: 'wrong key' }, 401);
  const body = await req.json().catch(() => ({})) as { dryRun?: unknown; previewTo?: unknown; version?: unknown };

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

  const db = {
    async due({ owners, oldestDays, youngestDays, limit }: { owners: string[]; oldestDays: number; youngestDays: number; limit: number }) {
      const res = await must(await rest('/rpc/founder_note_due', {
        method: 'POST',
        body: JSON.stringify({ owners, oldest_days: oldestDays, youngest_days: youngestDays, how_many: limit }),
      }), 'reading who is due');
      return await res.json();
    },
    async claim(id: string, version: string) {
      const res = await must(await rest('/founder_notes', {
        method: 'POST',
        headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify({ person_id: id, version }),
      }), 'marking a note');
      return (await res.json()).length === 1;
    },
    async release(id: string) {
      await must(await rest(`/founder_notes?person_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }), 'unmarking a note');
    },
  };

  const send = async (note: unknown, id: string) => {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${config.resendKey}`, 'content-type': 'application/json', 'idempotency-key': `founder-note-${id}` },
        body: JSON.stringify(note),
        signal: AbortSignal.timeout(CALL_MS),
      });
      if (res.ok) return { ok: true };
      const why = await res.json().catch(() => ({})) as { name?: string; message?: string };
      return { ok: false, error: noAddresses([why.name, why.message].filter(Boolean).join(': ') || `Resend said ${res.status}`) };
    } catch (err) {
      return { ok: false, error: noAddresses(String((err as Error)?.message ?? err)) };
    }
  };

  if (body.previewTo !== undefined) {
    const id = String(body.previewTo);
    const found = config.owners.includes(id)
      ? await (await rest(`/people?select=id,email&id=eq.${encodeURIComponent(id)}`)).json().catch(() => [])
      : [];
    if (!VERSIONS.includes(String(body.version))) return json({ ok: false, error: `version is one of ${VERSIONS.join(', ')}` }, 400);
    const note = previewFor(found[0], config, String(body.version));
    if (!note) return json({ ok: false, error: 'a preview only goes to an owner' }, 400);
    const res = await send(note, `preview-${Date.now()}`);
    return json(res.ok ? { ok: true, preview: true } : { ok: false, error: res.error }, res.ok ? 200 : 502);
  }

  try {
    return json({ ok: true, ...(await sendFounderNotes({ db, send, config, dryRun: body.dryRun === true })) });
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 502);
  }
});

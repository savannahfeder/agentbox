// FEEDBACK FROM THE APP, FORWARDED BY EMAIL (w-1b574413db, 2026-10-04).
//
// The Feedback card posts here (main/feedback.mjs): what the person wrote,
// what they attached, and the app's version. This forwards it as one email
// through Resend.
//
// WHO IT GOES TO IS A SECRET, never a line in this file. The repository is
// public and the ask was that nobody using Agentbox can see the address
// anywhere, so every address lives in the project's secrets:
//
//   supabase secrets set FEEDBACK_TO=…  FEEDBACK_FROM=…  RESEND_API_KEY=…
//   supabase functions deploy feedback
//
// FEEDBACK_FROM is the sender Resend allows for the account, written the way
// a mail header writes one ("Agentbox Feedback <…>").
//
// It takes no sign-in (config.toml, [functions.feedback]), because most
// people sending feedback have no account. So it checks everything itself:
// the same limits as shared/feedback.mjs, and a request too big to be one of
// ours is refused before it is read.

const LIMITS = { text: 20_000, files: 10, bytes: 8 * 1024 * 1024 };
// Base64 is four characters for every three bytes, plus the JSON around it.
const MAX_REQUEST = Math.ceil((LIMITS.bytes * 4) / 3) + LIMITS.text * 6 + 64 * 1024;

type File = { name: string; type: string; data: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const to = Deno.env.get('FEEDBACK_TO');
  const from = Deno.env.get('FEEDBACK_FROM');
  const key = Deno.env.get('RESEND_API_KEY');
  if (!to || !from || !key) return json({ ok: false, error: 'not configured' }, 503);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_REQUEST) return json({ ok: false, error: 'too large' }, 413);

  let body: { text?: unknown; files?: unknown; app?: { version?: unknown; os?: unknown } };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'not JSON' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const files: File[] = Array.isArray(body.files)
    ? body.files.filter((f): f is File => !!f && typeof f.name === 'string' && typeof f.data === 'string')
      .map((f) => ({ name: f.name.slice(0, 200), type: typeof f.type === 'string' ? f.type : 'application/octet-stream', data: f.data }))
    : [];
  const bytes = files.reduce((n, f) => n + Math.floor((f.data.length * 3) / 4), 0);
  if (!text && !files.length) return json({ ok: false, error: 'empty' }, 400);
  if (text.length > LIMITS.text || files.length > LIMITS.files || bytes > LIMITS.bytes) return json({ ok: false, error: 'too large' }, 413);

  const version = String(body.app?.version ?? '').slice(0, 40);
  const os = String(body.app?.os ?? '').slice(0, 80);
  const first = text.split('\n')[0].slice(0, 70);
  const subject = `Agentbox feedback: ${first || `${files.length} file${files.length === 1 ? '' : 's'}`}`;
  const footer = `Agentbox ${version || 'unknown version'} · ${os || 'unknown OS'}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: `${text || '(no words, files only)'}\n\n--\n${footer}`,
      html: `<div style="white-space:pre-wrap">${escape(text || '(no words, files only)')}</div><hr><small>${escape(footer)}</small>`,
      attachments: files.map((f) => ({ filename: f.name, content: f.data })),
    }),
  });
  if (!res.ok) return json({ ok: false, error: 'mail refused' }, 502);
  return json({ ok: true });
});

// A SIGN-IN AN AGENT PUTS IN FRONT OF THE PERSON, WHILE IT WAITS.
//
// Every service an agent needs already has a browser sign-in: an MCP server's
// own OAuth (Claude Code's `authenticate` tool, `codex mcp login`), or a
// command-line login that prints a link and a code (gh, vercel, supabase,
// wrangler). In Claude Code or Codex the person clicks that link. Here the
// agent hands the link to the `sign_in` tool (mcp/tools.mjs), the thread draws
// it as a card (renderer/src/components/SignInCard.tsx), and the answer comes
// back to the agent, which is still running.
//
// Two fields on the thread, both latest-wins:
//   signIn        { id, service, url, code?, why?, at, done? }   the agent's ask
//   signInAnswer  { id, said, url?, at }                          the answer to it
// `said` is 'signed-in' (they finished in the browser), 'landed' (with the
// address the browser was sent back to, for a login waiting on another
// machine) or 'skipped'.

const SAID = ['signed-in', 'landed', 'skipped'];
const ID = /^s-[a-z0-9]{6,24}$/;
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const link = (v) => {
  if (typeof v !== 'string' || v.length > 4000) return null;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
};

/** The `signIn` field as it is kept, or undefined. */
export function cleanSignIn(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ID.test(value.id ?? '')) return undefined;
  const url = link(value.url);
  const service = text(value.service, 60);
  if (!url || !service) return undefined;
  const out = { id: value.id, service, url, at: Number.isFinite(value.at) ? Math.trunc(value.at) : 0 };
  const code = text(value.code, 40);
  const why = text(value.why, 300);
  if (code) out.code = code;
  if (why) out.why = why;
  if (value.done === true) out.done = true;
  return out;
}

/** The `signInAnswer` field as it is kept, or undefined. */
export function cleanSignInAnswer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ID.test(value.id ?? '') || !SAID.includes(value.said)) return undefined;
  const out = { id: value.id, said: value.said, at: Number.isFinite(value.at) ? Math.trunc(value.at) : 0 };
  if (value.said === 'landed') {
    const url = link(value.url);
    if (!url) return undefined;
    out.url = url;
  }
  return out;
}

/** The sign-in this thread still waits on, or null. */
export function openSignIn(item) {
  const ask = item?.signIn;
  if (!ask?.id || ask.done || item.status === 'done') return null;
  return item.signInAnswer?.id === ask.id ? null : ask;
}

/** The answer to the ask `id`, once there is one. */
export function answerTo(item, id) {
  return item?.signInAnswer?.id === id ? item.signInAnswer : null;
}

export const newSignInId = () => `s-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Where the sign-in sends the browser back to when that is this machine
 * (`http://localhost:<port>/<path>`), read off the link's redirect_uri, or null.
 */
export function comesBackTo(url) {
  let back;
  try { back = new URL(new URL(url).searchParams.get('redirect_uri') ?? ''); } catch { return null; }
  if (back.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(back.hostname)) return null;
  const port = Number(back.port);
  return Number.isInteger(port) && port > 0 && port < 65536 ? { port, path: back.pathname || '/' } : null;
}

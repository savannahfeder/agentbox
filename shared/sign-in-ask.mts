// A SIGN-IN AN AGENT PUTS IN FRONT OF THE PERSON, WHILE IT WAITS.
//
// Every service an agent needs already has a browser sign-in: an MCP server's
// own OAuth (Claude Code's `authenticate` tool, `codex mcp login`), or a
// command-line login that prints a link and a code (gh, vercel, supabase,
// wrangler). In Claude Code or Codex the person clicks that link. Here the
// agent hands the link to the `sign_in` tool (mcp/tools.mts), the thread draws
// it as a card (renderer/src/components/SignInCard.tsx), and the answer comes
// back to the agent, which is still running.
//
// Two fields on the thread, both latest-wins:
//   signIn        { id, service, url, code?, why?, at, done? }   the agent's ask
//   signInAnswer  { id, said, url?, at }                          the answer to it
// `said` is 'signed-in' (they finished in the browser), 'landed' (with the
// address the browser was sent back to, for a login waiting on another
// machine), 'skipped', or 'replied' (they wrote on the thread instead, which
// ends the wait so the agent can take what they wrote).

export interface SignInAsk { id: string; service: string; url: string; code?: string; why?: string; at: number; done?: true }
export type SignInSaid = 'signed-in' | 'landed' | 'skipped' | 'replied';
export interface SignInAnswer { id: string; said: SignInSaid; url?: string; at: number }

const SAID: readonly string[] = ['signed-in', 'landed', 'skipped', 'replied'];
const ID = /^s-[a-z0-9]{6,24}$/;
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const link = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 4000) return null;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
};
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);

/** The `signIn` field as it is kept, or undefined. */
export function cleanSignIn(value: unknown): SignInAsk | undefined {
  const v = record(value);
  if (!v || typeof v.id !== 'string' || !ID.test(v.id)) return undefined;
  const url = link(v.url);
  const service = text(v.service, 60);
  if (!url || !service) return undefined;
  const out: SignInAsk = { id: v.id, service, url, at: whole(v.at) };
  const code = text(v.code, 40);
  const why = text(v.why, 300);
  if (code) out.code = code;
  if (why) out.why = why;
  if (v.done === true) out.done = true;
  return out;
}

/** The `signInAnswer` field as it is kept, or undefined. */
export function cleanSignInAnswer(value: unknown): SignInAnswer | undefined {
  const v = record(value);
  if (!v || typeof v.id !== 'string' || !ID.test(v.id) || typeof v.said !== 'string' || !SAID.includes(v.said)) return undefined;
  const out: SignInAnswer = { id: v.id, said: v.said as SignInSaid, at: whole(v.at) };
  if (v.said === 'landed') {
    const url = link(v.url);
    if (!url) return undefined;
    out.url = url;
  }
  return out;
}

type HasSignIn = { signIn?: unknown; signInAnswer?: unknown; status?: string } | null | undefined;

/** The sign-in this thread still waits on, or null. */
export function openSignIn(item: HasSignIn): SignInAsk | null {
  const ask = item?.signIn as SignInAsk | undefined;
  if (!ask?.id || ask.done || item?.status === 'done') return null;
  return (item?.signInAnswer as SignInAnswer | undefined)?.id === ask.id ? null : ask;
}

/** The answer to the ask `id`, once there is one. */
export function answerTo(item: HasSignIn, id: string): SignInAnswer | null {
  const answer = item?.signInAnswer as SignInAnswer | undefined;
  return answer?.id === id ? answer : null;
}

export const newSignInId = (): string => `s-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Where the sign-in sends the browser back to when that is this machine
 * (`http://localhost:<port>/<path>`), read off the link's redirect_uri, or null.
 */
export function comesBackTo(url: string): { port: number; path: string } | null {
  let back: URL;
  try { back = new URL(new URL(url).searchParams.get('redirect_uri') ?? ''); } catch { return null; }
  if (back.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(back.hostname)) return null;
  const port = Number(back.port);
  return Number.isInteger(port) && port > 0 && port < 65536 ? { port, path: back.pathname || '/' } : null;
}

// WHAT A CLOUD RUN NEEDS FROM THE PERSON, AND HOW IT ASKS. A run that cannot
// go on without something only they can give ends its answer with one marked
// line per thing (main/cloud/run.mts cloudNote), and the thread draws each as a
// card (renderer/src/components/NeedCard.tsx):
//
//   AGENTBOX-NEEDS: sign-in supabase | to apply the storage rules to the Northwind database
//   AGENTBOX-NEEDS: key SENTRY_AUTH_TOKEN | a Sentry auth token, from sentry.io/settings/account/api/auth-tokens
//   AGENTBOX-NEEDS: file ~/Movies/launch-film-original.mov | the cut is made from the original
//   AGENTBOX-NEEDS: code npm | the one-time password for npm publish
//
// A sign-in or a key is kept in the cloud and given to every later cloud run
// (main/cloud/keys.mts). A file goes with the thread's next cloud turn, at the
// same path. A code goes back as the reply.
import { keyAsks, keyWords } from './cloud-keys.mts';

export const NEED = 'AGENTBOX-NEEDS:';
// A closing backtick is taken off only when the line opened with one: the reason may hold inline code.
const NEED_LINE = /^\s*(`?)AGENTBOX-NEEDS:\s*(sign-in|key|file|code)\s+([^|`]+?)\s*(?:\|\s*(.*?))?\s*\1\s*$/i;

export interface Service {
  id: string;
  name: string;
  keys: { name: string; label: string }[];
  tokenUrl: string;
}

export type Need =
  | { kind: 'sign-in'; service: Service; why: string }
  | { kind: 'key'; name: string; what: string }
  | { kind: 'file'; path: string; why: string }
  | { kind: 'code'; about: string; why: string };

/** The parts of a thread's row these read. */
export interface NeedsItem {
  id?: string;
  product?: string;
  status?: string;
  agent?: unknown;
  answer?: string | null;
  result?: string | null;
  wrote?: Record<string, { ts?: number } | undefined>;
}

// The services a sign-in can name, each with the variables its tools read and
// the page where a person makes a token.
export const SERVICES: readonly Service[] = Object.freeze([
  { id: 'supabase', name: 'Supabase', keys: [{ name: 'SUPABASE_ACCESS_TOKEN', label: 'Supabase access token' }], tokenUrl: 'https://supabase.com/dashboard/account/tokens' },
  { id: 'vercel', name: 'Vercel', keys: [{ name: 'VERCEL_TOKEN', label: 'Vercel token' }], tokenUrl: 'https://vercel.com/account/tokens' },
  { id: 'github', name: 'GitHub', keys: [{ name: 'GH_TOKEN', label: 'GitHub token' }], tokenUrl: 'https://github.com/settings/tokens' },
  { id: 'stripe', name: 'Stripe', keys: [{ name: 'STRIPE_SECRET_KEY', label: 'Stripe secret key' }], tokenUrl: 'https://dashboard.stripe.com/apikeys' },
  { id: 'sentry', name: 'Sentry', keys: [{ name: 'SENTRY_AUTH_TOKEN', label: 'Sentry auth token' }], tokenUrl: 'https://sentry.io/settings/account/api/auth-tokens/' },
  { id: 'expo', name: 'Expo', keys: [{ name: 'EXPO_TOKEN', label: 'Expo access token' }], tokenUrl: 'https://expo.dev/settings/access-tokens' },
  { id: 'aws', name: 'AWS', keys: [{ name: 'AWS_ACCESS_KEY_ID', label: 'Access key ID' }, { name: 'AWS_SECRET_ACCESS_KEY', label: 'Secret access key' }], tokenUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials' },
  { id: 'npm', name: 'npm', keys: [{ name: 'NPM_TOKEN', label: 'npm access token' }], tokenUrl: 'https://www.npmjs.com/settings/~/tokens' },
  { id: 'netlify', name: 'Netlify', keys: [{ name: 'NETLIFY_AUTH_TOKEN', label: 'Netlify token' }], tokenUrl: 'https://app.netlify.com/user/applications#personal-access-tokens' },
  { id: 'cloudflare', name: 'Cloudflare', keys: [{ name: 'CLOUDFLARE_API_TOKEN', label: 'Cloudflare API token' }], tokenUrl: 'https://dash.cloudflare.com/profile/api-tokens' },
  { id: 'fly', name: 'Fly.io', keys: [{ name: 'FLY_API_TOKEN', label: 'Fly.io token' }], tokenUrl: 'https://fly.io/user/personal_access_tokens' },
  { id: 'linear', name: 'Linear', keys: [{ name: 'LINEAR_API_KEY', label: 'Linear API key' }], tokenUrl: 'https://linear.app/settings/account/security' },
]);
export const serviceById = (id: string | null | undefined): Service | null => SERVICES.find((s) => s.id === String(id ?? '').trim().toLowerCase()) ?? null;

const tidy = (s: string | null | undefined): string => String(s ?? '').trim().replace(/^[\u2014\u2013:\s-]+/, '');

/**
 * What a message asks for, in order and once each:
 * { kind: 'sign-in', service, why } | { kind: 'key', name, what } | { kind: 'file', path, why } | { kind: 'code', about, why }.
 * A sign-in to a service not on the list is left out: the run is told to ask for a key instead.
 */
export function needsIn(text: string | null | undefined): Need[] {
  const out: Need[] = [];
  const seen = new Set<string>();
  const add = (need: Need, id: string) => { if (!seen.has(id)) { seen.add(id); out.push(need); } };
  for (const line of String(text ?? '').split('\n')) {
    const m = NEED_LINE.exec(line);
    if (!m) continue;
    const kind = m[2].toLowerCase() as Need['kind'];
    const arg = m[3].trim();
    const why = tidy(m[4]);
    if (kind === 'sign-in') {
      const service = serviceById(arg);
      if (service) add({ kind, service, why }, `sign-in:${service.id}`);
    } else if (kind === 'key') {
      const [name, ...rest] = arg.split(/\s+/);
      if (/^[A-Z][A-Z0-9_]{1,79}$/.test(name)) add({ kind, name, what: why || tidy(rest.join(' ')) }, `key:${name}`);
    } else if (kind === 'file') {
      if (/^(~\/|\/)/.test(arg)) add({ kind, path: arg, why }, `file:${arg}`);
    } else {
      add({ kind, about: arg, why }, `code:${arg}`);
    }
  }
  for (const a of keyAsks(text)) add({ kind: 'key', name: a.name, what: a.what }, `key:${a.name}`);
  return out;
}

/** Whether `line` is one of those asks, in either form. */
export const isNeedLine = (line: string | null | undefined): boolean => needsIn(line).length > 0;

/** One name for a need, the same in the thread and atop Needs you. */
export const needId = (need: Need): string => (need.kind === 'sign-in' ? `sign-in:${need.service.id}` : need.kind === 'key' ? `key:${need.name}` : need.kind === 'file' ? `file:${need.path}` : `code:${need.about}`);

/** The variables a sign-in or a key asks to be saved; none for a file or a code. */
export const keysOf = (need: Need): string[] => (need.kind === 'sign-in' ? need.service.keys.map((k) => k.name) : need.kind === 'key' ? [need.name] : []);

const spokenSince = (item: NeedsItem): boolean => item.answer !== '(withdrawn)' && (item.wrote?.answer?.ts ?? 0) > (item.wrote?.result?.ts ?? 0);

/**
 * What an open thread still waits on: its latest answer's asks less the
 * sign-ins and keys already saved. Nothing once it has been answered since.
 */
export function needsLeft(item: NeedsItem | null | undefined, saved: Iterable<string> = []): Need[] {
  if (!item || item.status !== 'open' || spokenSince(item)) return [];
  const have = new Set(saved);
  return needsIn(item.result).filter((n) => { const k = keysOf(n); return !k.length || !k.every((x) => have.has(x)); });
}

/** The few words a thread's row says while it waits on these. */
export function needsWord(needs: readonly Need[]): string | null {
  const first = needs[0];
  if (!first) return null;
  // Round ten: a row said "Needs Vercel" for a thread waiting on three things.
  if (needs.length > 1) return `Needs ${needs.length} things`;
  if (first.kind === 'sign-in') return `Needs ${first.service.name}`;
  if (first.kind === 'file') return 'Needs a file';
  if (first.kind === 'code') return 'Needs a code';
  return 'Needs a key';
}

const listed = (words: string[]): string => (words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** What goes back to a thread once its sign-ins and keys are all saved. */
export function connectedReply(needs: readonly Need[]): string {
  const signIns = needs.filter((n) => n.kind === 'sign-in').map((n) => n.service.name);
  const keys = needs.filter((n) => n.kind === 'key').map((n) => (keyWords(n.what) ? `the ${keyWords(n.what)}` : n.name));
  const said = [signIns.length ? `connected ${listed(signIns)}` : null, keys.length ? `saved ${listed(keys)}` : null].filter(Boolean).join(' and ');
  return `I ${said}. Carry on.`;
}

/** The reply for a key given after the person answered its ask in words: the thread may have moved on, so no "Carry on". */
export function lateReply(needs: readonly Need[]): string {
  return `${connectedReply(needs).replace(/\. Carry on\.$/, '')} after all, so you can use it now.`;
}

/**
 * The threads a saved key lets carry on: open, their latest answer asking only
 * for sign-ins and keys that are now all saved, and nothing said to them since.
 * Each with the reply that sends it on.
 */
export function threadsKeysFree<T extends NeedsItem>(items: readonly T[] | null | undefined, saved: Iterable<string>): { product: T['product']; id: string; answer: string }[] {
  const have = new Set(saved);
  const out: { product: T['product']; id: string; answer: string }[] = [];
  for (const item of items ?? []) {
    if (!item?.id || item.status !== 'open' || item.agent) continue;
    const needs = needsIn(item.result);
    if (!needs.length || needs.some((n) => n.kind === 'file' || n.kind === 'code')) continue;
    if (!needs.every((n) => keysOf(n).every((k) => have.has(k)))) continue;
    // A withdrawn reply is no answer (round six: GitHub never carried on after one).
    if (spokenSince(item)) continue;
    out.push({ product: item.product, id: item.id, answer: connectedReply(needs) });
  }
  return out;
}

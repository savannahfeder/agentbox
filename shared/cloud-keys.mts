// KEYS SAVED FOR CLOUD RUNS. A cloud run that needs a key it was not given
// asks for it on one marked line per key (main/cloud/run.mts cloudNote); the
// thread draws each as a field, and what is pasted there is kept in the cloud
// and handed to every later cloud run as an environment variable
// (main/cloud/keys.mts, cloud/sandbox/server.mjs placeKeys).
export { keyNameRefused, HIDE_FROM, KEY_VALUE_MAX } from './cloud-key-names.mts';

export const KEY_ASK = 'AGENTBOX-NEEDS-A-KEY:';
const ASK_LINE = /^\s*AGENTBOX-NEEDS-A-KEY:\s*([A-Z][A-Z0-9_]{1,79})\b[\s:\u2014\u2013-]*(.*)$/;

export interface KeyAsk {
  name: string;
  what: string;
}

/** The keys a message asks for, in order and once each: [{ name, what }]. */
export function keyAsks(text: string | null | undefined): KeyAsk[] {
  const out: KeyAsk[] = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = ASK_LINE.exec(line.replace(/^`+|`+$/g, ''));
    if (m && !out.some((a) => a.name === m[1])) out.push({ name: m[1], what: m[2].replace(/`+$/, '').trim() });
  }
  return out;
}

/** Whether `line` is one of those asks. */
export const isKeyAsk = (line: string | null | undefined): boolean => ASK_LINE.test(String(line ?? '').replace(/^`+|`+$/g, ''));

// What the agent said the key is, as a short name for Settings: "your Stripe
// secret key, from dashboard.stripe.com/apikeys" is "Stripe secret key".
export function keyWords(what: string | null | undefined): string | null {
  return String(what ?? '').split(/,\s*from\b|\s+from\s+\S+\.\w|\s+from\s+`|\s*`|\s*\(|\.\s/i)[0].replace(/^\s*(your|an?|the)\s+/i, '').trim().slice(0, 80) || null;
}
export function keyLabel(what: string | null | undefined): string | null {
  const t = keyWords(what);
  return t ? t[0].toUpperCase() + t.slice(1) : null;
}

/**
 * What goes back to a thread once every key its answer asked for is saved,
 * in the words the agent used for each ("the Supabase access token"); its
 * variable's name only where it said nothing. Rounds three and four: "I saved
 * SUPABASE_ACCESS_TOKEN" read as code someone else had typed in their name.
 */
export function savedReply(asks: readonly (string | KeyAsk)[]): string {
  const words = asks.map((a) => (typeof a === 'string' ? a : keyWords(a.what) ? `the ${keyWords(a.what)}` : a.name));
  const list = words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `I saved ${list}. Carry on.`;
}

// Which threads a saved key frees is shared/cloud-needs.mts `threadsKeysFree`.

// Under logins/ because that is the one prefix the bucket keeps for good and
// the cloud server never links for reading on a Mac.
export const keyObjectKey = (id: string): string => `logins/keys/${id}.json`;
export const isKeyObject = (key: string | null | undefined): boolean => /^logins\/keys\/[A-Za-z0-9-]{8,64}\.json$/.test(String(key ?? ''));

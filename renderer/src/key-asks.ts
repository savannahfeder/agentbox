import { isKeyAsk, keyAsks, keyWords, savedReply } from '../../shared/cloud-keys.mts';
import { stripOptionsSection } from './format';
import { needsIn } from '../../shared/cloud-needs.mts';

export const NEED_BLOCK = 'agentbox-need';

/** A message with each thing a cloud run asked for turned into a block the thread draws as a card (NeedCard.tsx). */
export function needsAsBlocks(text: string): string {
  if (!text.includes('AGENTBOX-NEEDS')) return text;
  return text.split('\n').map((line) => {
    const [need] = needsIn(line);
    return need ? ['', '```' + NEED_BLOCK, JSON.stringify(need), '```', ''].join('\n') : line;
  }).join('\n');
}

export const KEY_BLOCK = 'agentbox-key';

/** A message with each key a cloud run asked for turned into a block the thread draws as a field. */
export function keyAsksAsBlocks(text: string): string {
  if (!text.includes('AGENTBOX-NEEDS-A-KEY:')) return text;
  return text.split('\n').map((line) => {
    if (!isKeyAsk(line)) return line;
    const [ask] = keyAsks(line);
    return ['', '```' + KEY_BLOCK, ask.name, ask.what, '```', ''].join('\n');
  }).join('\n');
}

/** The block's name and what the agent said it is. */
export function keyBlock(source: string): { name: string; what: string } {
  const [name = '', ...rest] = source.replace(/\n$/, '').split('\n');
  return { name: name.trim(), what: rest.join(' ').trim() };
}

/** What the screen says once a key is saved: whether this thread carries on, and how many others with it. */
export function keySavedWords(said: string, { asks, saved, freed, thread, cloudOff = false, done = 'saved', left = null }: { asks: string[]; saved: string[]; freed: string[]; thread: string; cloudOff?: boolean; done?: 'saved' | 'connected'; left?: string[] | null }): string {
  const head = `${said} ${done}.`;
  if (cloudOff) return `${head} Threads use it once the cloud is on.`;
  // Everything the ask still waits on, files and codes too (round eight: "One more key to go" with a film still to send).
  if (left?.length) return `${head} Still to give: ${left.length < 3 ? left.join(' and ') : `${left.slice(0, -1).join(', ')} and ${left[left.length - 1]}`}.`;
  const keysLeft = asks.filter((n) => !saved.includes(n)).length;
  if (keysLeft) return `${head} ${keysLeft === 1 ? 'One more key' : `${keysLeft} more keys`} to go.`;
  const others = freed.filter((id) => id !== thread).length;
  if (!freed.includes(thread)) return others ? `${head} ${others} waiting thread${others === 1 ? '' : 's'} carry on.` : head;
  return others ? `${head} This thread and ${others} other${others === 1 ? '' : 's'} carry on.` : `${head} This thread carries on.`;
}

// Not a link, a path or a file name, which are long and carry dashes too.
const keyShaped = (w: string) => w.length >= 12 && !/^https?:\/\//i.test(w) && !/^\.{0,2}\/|\.[A-Za-z]{1,5}$/.test(w) && /[0-9_-]/.test(w) && /[A-Za-z]/.test(w);

/**
 * A key pasted into the reply box of a thread that asked for one: the name to
 * save it under and the key itself, or null when the reply reads as words. A
 * short reply ("here you go sk_live_…") with one key-shaped run in it counts.
 */
export function keyFromReply(text: string, asks: string[], saved: string[]): { name: string; value: string; words: boolean } | null {
  const open = asks.filter((n) => !saved.includes(n));
  if (open.length !== 1) return null;
  const words = text.trim().split(/\s+/).map((w) => w.replace(/^[`'"(<]+|[`'".,)>:;!]+$/g, '')).filter(Boolean);
  const keys = words.filter(keyShaped);
  if (keys.length !== 1) return null;
  if (words.length <= 12 && (words.length === 1 || keys[0].length >= 16)) return { name: open[0], value: keys[0], words: false };
  // Round six: a token inside a longer reply was sent to the thread as words,
  // in plain sight. One marked as the asked key's own is kept, and the words go on without it.
  return BEGINS[open[0]]?.test(keys[0]) ? { name: open[0], value: keys[0], words: true } : null;
}

/**
 * Whether a message the thread draws is the thread's newest answer, though the
 * thread draws it with its Options taken off (Focus.tsx cleanMessage). Round
 * three of the power test: compared as written, no ask matched and every key
 * box was gone; round four, the same for an answer drawn from the run's log.
 */
export function isNewestAnswer(text: string, result: string | null | undefined): boolean {
  // Spacing aside too: a run's log keeps its lines but not the blank ones between them.
  const plain = (t: string) => stripOptionsSection(t).replace(/^##\s*Gist\s*\n+/i, '').replace(/\s+/g, ' ').trim();
  // And in part: the newest answer is drawn with its bold first line apart from the rest (round five).
  const shown = plain(text);
  return !!result && !!shown && plain(result).includes(shown);
}

// Keys whose issuers give them a shape, and the names each belongs under.
const SHAPES: [RegExp, string, RegExp][] = [
  [/^(sk|rk)_(live|test)_/, 'a Stripe secret key', /^STRIPE_/],
  [/^pk_(live|test)_/, 'a Stripe publishable key', /^STRIPE_(PUBLISHABLE|PUBLIC)/],
  [/^sbp_/, 'a Supabase access token', /^SUPABASE_/],
  [/^(ghp_|gho_|ghs_|github_pat_)/, 'a GitHub token', /^(GH_|GITHUB_)/],
  [/^sntry[su]_/, 'a Sentry token', /^SENTRY_/],
  [/^(AKIA|ASIA)[0-9A-Z]{16}$/, 'an AWS access key ID', /^AWS_ACCESS_KEY_ID$/],
  [/^xox[abposr]-/, 'a Slack token', /^SLACK_/],
  [/^sk-ant-/, 'an Anthropic key', /^(?!)/],
  [/^sk-/, 'an OpenAI key', /^OPENAI_/],
  // Round four: a project's anon or service role key, kept as the account token.
  [/^eyJ[A-Za-z0-9_-]+\./, 'a Supabase project key (anon or service role)', /^(?!SUPABASE_ACCESS_TOKEN$)/],
];

/**
 * Why a pasted key looks like it belongs under another name, or null. Round
 * two and three: a Stripe publishable key was kept as the secret key, and a
 * Stripe key as the Sentry token, for every later thread, without a word.
 */
export function keyLooksWrong(name: string, value: string, what?: string): string | null {
  const v = value.trim();
  const wanted = keyWords(what) ? `the ${keyWords(what)}` : name;
  // Round seven: a live key, asked for to try test mode, went to every cloud thread without a word.
  if (/^(sk|rk)_live_/.test(v) && /^STRIPE_/.test(name)) return 'That is a live Stripe key: every cloud thread could make real charges with it. Press Save again to keep it anyway.';
  const hit = SHAPES.find(([shape]) => shape.test(v));
  if (hit && !hit[2].test(name)) return `That looks like ${hit[1]}, not ${wanted}. Press Save again to keep it anyway.`;
  // Round six: an account password was kept as the Vercel token, and only the
  // first cloud run that used it found out.
  const begins = BEGINS[name];
  if (/\s/.test(v) || v.length < 16 || (begins && !begins.test(v))) return `That does not look like ${wanted}. Press Save again to keep it anyway.`;
  return null;
}

// How the keys whose issuers mark them begin.
const BEGINS: Record<string, RegExp> = {
  SUPABASE_ACCESS_TOKEN: /^sbp_/,
  GH_TOKEN: /^(ghp_|gho_|ghu_|ghs_|github_pat_)/,
  STRIPE_SECRET_KEY: /^(sk|rk)_(live|test)_/,
  NPM_TOKEN: /^npm_/,
  LINEAR_API_KEY: /^lin_api_/,
  AWS_ACCESS_KEY_ID: /^(AKIA|ASIA)/,
};

/** Why a typed one-time code looks wrong, or null: these codes are six digits. */
export function codeLooksWrong(code: string): string | null {
  const c = code.trim();
  if (/^\d{6}$/.test(c)) return null;
  return /^\d+$/.test(c) ? `That is ${c.length} digits; these codes are 6. Press Send again to send it anyway.` : 'These codes are 6 digits. Press Send again to send it anyway.';
}

export { keyAsks, savedReply };

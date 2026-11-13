// WHERE ON THIS COMPUTER A KEY A CLOUD RUN ASKS FOR LIVES: a Keychain item, a
// file under the home folder (whole, or one line of an .env file), or a
// variable in the person's login shell. The card says it in these words and
// main/cloud/key-source.mts reads exactly this, so a yes is about what is shown.
import { pathHoldsSignIns, keychainItemHoldsSignIns } from './sign-in-places.mts';

export type KeySource = { place: 'keychain' | 'file' | 'shell'; from: string; entry?: string };
export const KEY_PLACES = Object.freeze(['keychain', 'file', 'shell'] as const);

const VARIABLE = /^[A-Za-z_][A-Za-z0-9_]{0,79}$/;
const ITEM = /^[^\0-\x1f\x7f]{1,200}$/;

/** Whether the place asked for is where a sign-in lives, which no card may read. */
export function sourceHoldsSignIns({ place, from }: { place?: unknown; from?: unknown } = {}): boolean {
  const at = String(from ?? '').trim();
  return (place === 'keychain' && keychainItemHoldsSignIns(at)) || (place === 'file' && pathHoldsSignIns(at));
}

/** { place, from, entry? } when it is a place a key can be read from, else null. */
export function keySource({ place, from, entry }: { place?: unknown; from?: unknown; entry?: unknown } = {}): KeySource | null {
  const at = String(from ?? '').trim();
  if (sourceHoldsSignIns({ place, from: at })) return null;
  if (place === 'keychain') return ITEM.test(at) ? { place, from: at } : null;
  if (place === 'shell') return VARIABLE.test(at) ? { place, from: at } : null;
  if (place !== 'file' || !ITEM.test(at) || !(at.startsWith('~/') || at.startsWith('/'))) return null;
  if (entry == null || entry === '') return { place, from: at };
  return VARIABLE.test(String(entry)) ? { place, from: at, entry: String(entry) } : null;
}

/**
 * The third part of an ask line: `keychain posthog-read-key`,
 * `file ~/app/.env POSTHOG_KEY`, `shell POSTHOG_KEY`. Null for anything else.
 */
export function keySourceFromWords(text: string | null | undefined): KeySource | null {
  const m = /^\s*(keychain|file|shell)\s*:?\s+(.+?)\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const place = m[1].toLowerCase();
  if (place !== 'file') return keySource({ place, from: m[2] });
  const f = /^(\S+)(?:\s+([A-Za-z_][A-Za-z0-9_]*))?$/.exec(m[2]);
  return f ? keySource({ place, from: f[1], entry: f[2] }) : null;
}

/** The same place written back as that third part. */
export const keySourceLine = (src: KeySource) => [src.place, src.from, src.entry].filter(Boolean).join(' ');

/** Where it is, as the card says it. */
export function keySourceWords(src: KeySource): string {
  if (src.place === 'keychain') return `your Keychain, as ${src.from}`;
  if (src.place === 'shell') return `${src.from} in your shell`;
  return src.entry ? `${src.entry} in ${src.from}` : src.from;
}

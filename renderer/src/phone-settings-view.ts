// What a Settings row reads while a change from the phone or the web app is on
// its way: the copy the computer sent (shared/phone-settings.mjs), with the
// commands left for it laid over it until a newer copy arrives.
import type { PhoneRows } from './phone-rows';

export interface Change { scope: 'workspace' | 'project'; key: string; value?: unknown; product?: string }
export interface SettingsRow { device: string; name: string; updated_at: string; settings: any }
export interface Reading { value: any; waiting: boolean; refused: string | null }
export type Changes = Map<string, Reading>;

const REFUSAL_SHOWN_MS = 10 * 60_000;
const TAKEN_BACK = 'refused: taken back on the phone';

export const changeKey = (c: Change) => `${c.scope}:${c.scope === 'project' ? c.product ?? '' : ''}:${c.key}`;

/** The computer heard from last; the page is about that one. */
export const computerOf = (rows: SettingsRow[]): SettingsRow | null =>
  [...rows].sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))[0] ?? null;

export function changesOn(computer: SettingsRow | null, commands: PhoneRows['commands'], now = Date.now()): Changes {
  const out: Changes = new Map();
  if (!computer) return out;
  const copyAt = Date.parse(computer.updated_at) || 0;
  const mine = commands
    .filter((c) => c.kind === 'setting' && c.device === computer.device && c.outcome !== TAKEN_BACK && c.payload?.key)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const c of mine) {
    const key = changeKey(c.payload);
    const takenAt = c.taken_at ? Date.parse(c.taken_at) || 0 : null;
    if (takenAt === null) out.set(key, { value: c.payload.value, waiting: true, refused: null });
    else if (c.outcome?.startsWith('refused')) {
      if (now - takenAt < REFUSAL_SHOWN_MS) out.set(key, { value: undefined, waiting: false, refused: c.outcome.replace(/^refused:\s*/, '') });
      else out.delete(key);
    } else if (takenAt > copyAt) out.set(key, { value: c.payload.value, waiting: false, refused: null });
    else out.delete(key);
  }
  return out;
}

/** A row's value: the change left for the computer when there is one, else the computer's copy. */
export function readingOf(changes: Changes, scope: Change['scope'], key: string, copy: unknown, product?: string): Reading {
  const hit = changes.get(changeKey({ scope, key, product }));
  if (!hit) return { value: copy, waiting: false, refused: null };
  return hit.refused ? { value: copy, waiting: false, refused: hit.refused } : hit;
}

// REPEATING TASKS ON A PHONE, for the web app (cloud-bridge.ts) and the phone
// app alike: each computer's rules from its settings copy
// (main/phone-inbox.mjs), with what the phone sent and the computer has not
// taken drawn as if it had.

import { phoneSlug, type PhoneRows } from './phone-rows';
import type { RepeatRule } from './types';

type Command = PhoneRows['commands'][number];
export interface RepeatSettingsRow { device: string; settings?: { repeats?: unknown } | null; updated_at?: string }
export type PhoneRepeat = RepeatRule & { waiting?: true };

// As long as phone-rows.ts shows a reply that landed before its thread's new copy.
const LANDING_SHOWN_MS = 2 * 3600_000;
const isRepeatSetting = (c: Command) => c.kind === 'setting' && c.payload?.scope === 'repeat' && typeof c.payload?.product === 'string';

export function phoneRepeats(settings: RepeatSettingsRow[], commands: Command[], projects: PhoneRows['projects'], now = Date.now()): PhoneRepeat[] {
  const names = new Map(projects.map((p) => [phoneSlug(p.device, p.project), p.name]));
  const copyAt = new Map<string, number>();
  const out: PhoneRepeat[] = [];
  for (const row of settings) {
    // Newest first: an older row of the same computer is not read again.
    if (copyAt.has(row.device)) continue;
    copyAt.set(row.device, Date.parse(row.updated_at ?? '') || 0);
    const list = Array.isArray(row.settings?.repeats) ? row.settings!.repeats as any[] : [];
    for (const r of list) {
      const product = phoneSlug(row.device, String(r?.product ?? ''));
      if (typeof r?.id !== 'string' || !names.has(product)) continue;
      out.push({ ...r, product, productName: names.get(product)!, misses: Number(r.misses) || 0, alerted: Number(r.alerted) || 0, served: String(r.served ?? '') });
    }
  }
  const sent = commands.filter(isRepeatSetting).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const c of sent) {
    const takenAt = c.taken_at ? Date.parse(c.taken_at) || 0 : null;
    const standing = takenAt === null ? !c.outcome : c.outcome === 'done' && (copyAt.get(c.device) ?? 0) < takenAt && now - takenAt < LANDING_SHOWN_MS;
    if (!standing) continue;
    const p = c.payload;
    const product = phoneSlug(c.device, p.product);
    if (!names.has(product)) continue;
    const at = out.findIndex((r) => r.product === product && r.id === p.id);
    if (p.key === 'end') { if (at >= 0) out.splice(at, 1); continue; }
    if (p.key === 'change') { if (at >= 0) out[at] = { ...out[at], ...p.value, waiting: true }; continue; }
    if (p.key === 'new') {
      const created = Date.parse(c.created_at) || now;
      out.push({ priority: 5, ...p.value, id: `phone-${c.id}`, product, productName: names.get(product)!, createdAt: created, served: '', misses: 0, alerted: 0, waiting: true });
    }
  }
  return out;
}

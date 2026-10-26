// The moments "Later" offers, for the desktop's picker (components/Snooze.tsx)
// and the phone app's sheet.

export interface LaterPreset { label: string; ts: number }

export function laterPresets(now = Date.now()): LaterPreset[] {
  const list: LaterPreset[] = [];
  list.push({ label: 'In 30 minutes', ts: now + 30 * 60_000 });
  list.push({ label: 'In 4 hours', ts: now + 4 * 3_600_000 });
  const evening = new Date(now); evening.setHours(18, 0, 0, 0);
  if (evening.getTime() > now) list.push({ label: 'This evening', ts: evening.getTime() });
  const tomorrow = new Date(now + 86_400_000); tomorrow.setHours(8, 0, 0, 0);
  list.push({ label: 'Tomorrow', ts: tomorrow.getTime() });
  const monday = new Date(now);
  monday.setDate(monday.getDate() + ((( 1 - monday.getDay()) + 7) % 7 || 7));
  monday.setHours(8, 0, 0, 0);
  // On a Sunday the coming Monday is tomorrow, already offered.
  if (monday.getTime() === tomorrow.getTime()) monday.setDate(monday.getDate() + 7);
  list.push({ label: 'Next week', ts: monday.getTime() });
  return list;
}

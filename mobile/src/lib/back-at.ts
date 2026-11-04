// When an account out of usage is back, with its day: "until 6:19pm" read late
// in the evening could be tomorrow or stale.
const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
const dayStart = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

export function backAt(resetsAt: number | null | undefined, now = Date.now()): string | null {
  if (!resetsAt || resetsAt <= now) return null;
  const d = new Date(resetsAt);
  const days = Math.round((dayStart(resetsAt) - dayStart(now)) / 86_400_000);
  const day = days === 0 ? '' : days === 1 ? 'tomorrow ' : days < 7
    ? `${d.toLocaleDateString('en-US', { weekday: 'short' })} `
    : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} `;
  return `Out of usage until ${day}${clock(d)}`;
}

// A moment as a person reads it on the phone, with its day: "until 6:19pm" read
// late in the evening could be tomorrow or stale.
const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
const dayStart = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** "6:19pm", "tomorrow 6:19pm", "Fri 9:00am", or "Nov 12 9:00am". */
export function dayClock(at: number, now = Date.now()): string {
  const d = new Date(at);
  const days = Math.round((dayStart(at) - dayStart(now)) / 86_400_000);
  const day = days === 0 ? '' : days === 1 ? 'tomorrow ' : days > 1 && days < 7
    ? `${d.toLocaleDateString('en-US', { weekday: 'short' })} `
    : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} `;
  return `${day}${clock(d)}`;
}

export function backAt(resetsAt: number | null | undefined, now = Date.now()): string | null {
  if (!resetsAt || resetsAt <= now) return null;
  return `Out of usage until ${dayClock(resetsAt, now)}`;
}

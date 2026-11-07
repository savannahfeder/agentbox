/** "Chief of staff to Dev Patel, in 8s" over the words it will send. */
export function sendingWords(h: { from: string; to: string; text: string; until: number }, now: number): { title: string; line: string } {
  const left = Math.max(1, Math.ceil((h.until - now) / 1000));
  return { title: `${h.from} to ${h.to}, in ${left}s`, line: h.text.length > 160 ? `${h.text.slice(0, 159)}…` : h.text };
}

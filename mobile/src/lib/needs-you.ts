// Needs you in the order the inbox draws it: teammates' questions, then chat
// mentions, then threads (app/index.tsx). A row that opens no thread page is
// kept with an empty product, so it counts in the header and the arrows step over it.
type Keyed = { product: string; id: string };

export function needsYouOrder(
  asks: readonly { question: { id: string }; thread: Keyed | null }[],
  mentions: readonly { id: string }[],
  rows: readonly Keyed[],
): Keyed[] {
  return [
    ...asks.map((a) => a.thread ?? { product: '', id: `ask:${a.question.id}` }),
    ...mentions.map((m) => ({ product: '', id: `mention:${m.id}` })),
    ...rows.map((r) => ({ product: r.product, id: r.id })),
  ];
}

const same = (a: Keyed, b: Keyed) => a.product === b.product && a.id === b.id;

export function needsYouSpot(order: readonly Keyed[], here: Keyed): { pos: number; total: number } | null {
  const at = order.findIndex((r) => same(r, here));
  return at < 0 ? null : { pos: at + 1, total: order.length };
}

export function stepOver(order: readonly Keyed[], here: Keyed, dir: 1 | -1): Keyed | null {
  for (let i = order.findIndex((r) => same(r, here)) + dir; i >= 0 && i < order.length; i += dir) {
    if (order[i].product) return order[i];
  }
  return null;
}

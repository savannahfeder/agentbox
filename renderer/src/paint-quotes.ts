import { findQuote } from '../../shared/artifact-marks.mts';

export const canPaintQuotes = () => !!(CSS as unknown as { highlights?: unknown }).highlights;

/** Paints each quoted passage without touching the page, which React or the editor drew. */
export function paintQuotes(root: HTMLElement | null, quotes: { id: string; text: string }[], activeId: string | null, draft: string | null) {
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const Highlight = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  const found = new Map<string, Range>();
  if (!root || !highlights || !Highlight) return found;
  const nodes: { node: Text; start: number }[] = [];
  let all = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push({ node, start: all.length });
    all += node.data;
  }
  const rangeOf = (text: string) => {
    const hit = findQuote(all, text);
    if (!hit) return null;
    const at = (offset: number) => {
      let i = nodes.length - 1;
      while (i > 0 && nodes[i].start > offset) i -= 1;
      return { node: nodes[i].node, offset: offset - nodes[i].start };
    };
    const a = at(hit.start);
    const b = at(hit.end);
    const range = new Range();
    range.setStart(a.node, Math.min(a.offset, a.node.length));
    range.setEnd(b.node, Math.min(b.offset, b.node.length));
    return range;
  };
  const rest: Range[] = [];
  const on: Range[] = [];
  for (const q of quotes) {
    const range = rangeOf(q.text);
    if (!range) continue;
    found.set(q.id, range);
    if (q.id === activeId) on.push(range); else rest.push(range);
  }
  if (draft) { const range = rangeOf(draft); if (range) on.push(range); }
  highlights.set('av-quote', new Highlight(...rest));
  highlights.set('av-quote-on', new Highlight(...on));
  return found;
}

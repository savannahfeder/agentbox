// Ticket IDs are global; the visible snapshot is the only lookup source.
// Do not reinterpret URLs, filenames, or partial IDs as navigation promises.
const REFERENCE = /^(?:agentbox\/)?(w-[a-f0-9]{10})(?:-[a-z0-9-]+)?$/i;
const IN_TEXT = /(?<![\w/.:@-])(?:agentbox\/)?w-[a-f0-9]{10}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?(?![\w/-]|\.[a-z0-9])/gi;
export const TICKET_HREF = '#ticket/';

export function ticketReference(value: string): string | null {
  return value.trim().match(REFERENCE)?.[1].toLowerCase() ?? null;
}

/** The thread a link's address names: its id, the ticket form, or agentbox://work-item(s)/<id> as agents write it. */
export function threadOfHref(href: string | null | undefined): string | null {
  const h = href ?? '';
  return ticketReference(h.startsWith(TICKET_HREF) ? h.slice(TICKET_HREF.length) : h.replace(/^agentbox:\/\/work-items?\//i, ''));
}

export function ticketQuery(value: string): string | null {
  const match = value.trim().match(/^(?:agentbox\/)?(w-[a-f0-9]{1,10})(-[a-z0-9]+(?:-[a-z0-9]+)*)?$/i);
  if (!match || (match[2] && match[1].length !== 12)) return null;
  return match[1].toLowerCase();
}

export function resolveTicket<T extends { id: string; product?: string }>(items: T[], id: string, product?: string): T | null {
  return items.find(i => i.id === id && i.product === product) ?? items.find(i => i.id === id) ?? null;
}

export function ticketPieces(text: string): { text: string; id?: string }[] {
  const out: { text: string; id?: string }[] = [];
  let at = 0;
  for (const match of text.matchAll(IN_TEXT)) {
    if (match.index! > at) out.push({ text: text.slice(at, match.index) });
    out.push({ text: match[0], id: ticketReference(match[0])! });
    at = match.index! + match[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

type Node = { type: string; value?: string; url?: string; children?: Node[] };
const SKIP = new Set(['link', 'linkReference', 'image', 'imageReference', 'definition', 'code', 'html']);
export function linkTicketReferences(node: Node): void {
  if (!node.children) return;
  node.children = node.children.flatMap(child => {
    if (child.type === 'text' && child.value) {
      return ticketPieces(child.value).map(p => p.id
        ? { type: 'link', url: TICKET_HREF + p.id, children: [{ type: 'text', value: p.text }] }
        : { type: 'text', value: p.text });
    }
    if (child.type === 'inlineCode' && child.value) {
      const id = ticketReference(child.value);
      if (id) return [{ type: 'link', url: TICKET_HREF + id, children: [child] }];
    }
    if (!SKIP.has(child.type)) linkTicketReferences(child);
    return [child];
  });
}
export function remarkTicketReferences() {
  return (tree: Node) => linkTicketReferences(tree);
}

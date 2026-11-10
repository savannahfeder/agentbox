// 2026-10-07: one reported ticket existed but its ID was neither linked nor
// searched. Cover direct lookup, mentions, branch names, and false references.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { searchItems } from '../renderer/src/search.ts';
import { ticketReference, ticketPieces, linkTicketReferences, resolveTicket } from '../renderer/src/ticket-references';

const id = 'w-a123456789';
const target = { id, product: 'demo', title: 'Shared engine', status: 'done', updatedAt: 1 };
const mention = { id: 'w-b123456789', product: 'demo', title: 'Planning', body: `See ${id}.`, updatedAt: 2 };

describe('search finds the ticket itself before newer mentions', () => {
  it.each([id, 'agentbox/' + id, 'agentbox/' + id + '-engine', id.toUpperCase(), 'w-a123'])('finds %s', query => {
    const hits = searchItems([mention, target], query);
    expect(hits[0]?.item).toBe(target);
    expect(hits[0]?.summary).toContain(id);
  });
  it('still includes threads mentioning the ticket', () => expect(searchItems([mention, target], id)).toHaveLength(2));
  it.each(['w-c123456789', 'a123456788', 'agentbox/w-c123456789'])('does not return unrelated IDs: %s', query => expect(searchItems([target], query)).toEqual([]));
});

describe('references are doors into visible tickets', () => {
  it.each([id, 'agentbox/' + id, 'agentbox/' + id + '-engine'])('recognizes %s', value => expect(ticketReference(value)).toBe(id));
  it.each(['w-a123', id + '0', 'https://example.com/' + id, 'src/' + id + '.ts', 'x' + id])('leaves other text alone: %s', value => expect(ticketReference(value)).toBeNull());
  it('splits references without eating punctuation or surrounding prose', () => {
    expect(ticketPieces(`See (${id}), then agentbox/${id}-engine.`).filter(p => p.id).map(p => p.text)).toEqual([id, `agentbox/${id}-engine`]);
  });
  it('does not link URLs or file paths containing IDs', () => expect(ticketPieces(`https://example.com/${id} src/${id}.ts ${id}0`).filter(p => p.id)).toEqual([]));
  it('does not turn a branch filename or an unfinished ID into a ticket', () => {
    expect(ticketPieces(`${id}-engine.ts agentbox/${id}/src ${id}-`).filter(p => p.id)).toEqual([]);
    expect(searchItems([target], 'agentbox/w-a-engine')).toEqual([]);
  });
  it('links prose and inline code but leaves code blocks and existing links alone', () => {
    const tree = { type: 'root', children: [
      { type: 'text', value: `See ${id}.` }, { type: 'inlineCode', value: id },
      { type: 'code', value: id }, { type: 'link', url: 'https://example.com', children: [{ type: 'text', value: id }] },
    ] };
    linkTicketReferences(tree);
    expect(tree.children.filter(n => n.type === 'link')).toHaveLength(3);
    expect(tree.children.find(n => n.type === 'code')?.value).toBe(id);
    expect(tree.children.at(-1).children[0].type).toBe('text');
  });
  it('opens across projects and includes closed tickets', () => expect(resolveTicket([target], id, 'other')).toBe(target));
  it('cannot resolve tickets absent from the visible snapshot', () => expect(resolveTicket([mention], id, 'demo')).toBeNull());
  it('connects message links and summary links to the same thread navigation', () => {
    const focus = readFileSync(new URL('../renderer/src/components/Focus.tsx', import.meta.url), 'utf8');
    expect(focus).toContain('<TicketNavigation.Provider');
    expect(focus).toMatch(/\[remarkGfm, remarkTicketReferences,/);
    expect(focus).toContain('resolveTicket(referenceItems, id, item.product)');
    expect(focus).toContain('<TicketLink');
  });
});

import { matchedSentence, parseQuery, searchItems, searchScore } from '../search';
import { searchText } from '../format';
import { isDirect, messageLine } from './page-rules';
import type { Person, Product, WorkItem } from '../types';

export interface SearchContext { products: Product[]; people: Person[]; me: string | null }

// A context changes when the snapshot's projects or people change. While a
// person types, retain the projected text so search's own cache can reuse it.
const indexes = new WeakMap<SearchContext, WeakMap<WorkItem, { searchable: WorkItem; names: string; people: string[]; latest: string; chat: boolean }>>();

function indexed(item: WorkItem, context: SearchContext) {
  let index = indexes.get(context);
  if (!index) { index = new WeakMap(); indexes.set(context, index); }
  const cached = index.get(item);
  if (cached) return cached;
  const product = context.products.find(p => p.slug === item.product);
  const chat = isDirect(product);
  const line = chat ? messageLine(item, product, context.me,
    id => context.people.find(p => p.id === id)?.name.split(' ')[0] || 'Someone') : null;
  const names = (line?.people ?? [])
    .map(id => context.people.find(p => p.id === id)?.name)
    .filter(Boolean).join(' . ');
  const history = item.talk ? [
    ...item.talk.chat.map(m => m.text),
    ...Object.values(item.talk.threads).flatMap(t => [t.text, ...t.replies.map(m => m.text)]),
  ] : [];
  // Full stops preserve the existing rule: a quoted phrase cannot straddle
  // two fields, two people, or two separate messages.
  const searchable = chat ? {
    ...item,
    label: [names, item.label].filter(Boolean).join(' . '),
    body: [item.body, ...history].filter(Boolean).join(' . '),
  } : item;
  const value = { searchable, names, people: line?.people ?? [], latest: line?.text ?? '', chat };
  index.set(item, value);
  return value;
}

export function searchThreads(items: WorkItem[], query: string, context: SearchContext) {
  const originals = new Map<WorkItem, WorkItem>();
  const projections = items.map(item => {
    const { searchable } = indexed(item, context);
    originals.set(searchable, item);
    return searchable;
  });
  const q = parseQuery(query);
  return searchItems(projections, query).map(hit => {
    const item = originals.get(hit.item)!;
    const { names, latest, chat } = indexed(item, context);
    const named = !!names && searchScore({ id: item.id, title: names }, query) > 0;
    const matched = chat ? matchedSentence(searchText(hit.item.body), q.terms, q.phrase) : '';
    const subject = chat ? matchedSentence([item.label, item.title].filter(Boolean).join(' . '), q.terms, q.phrase) : '';
    const subjectMatch = searchScore({ id: item.id, title: [item.label, item.title].filter(Boolean).join(' . ') }, query) >= 2;
    return { item, summary: chat ? ((subjectMatch ? subject : matched) || subject || latest || hit.summary) : hit.summary, named };
  }).sort((a, b) => Number(b.named) - Number(a.named))
    .map(({ item, summary }) => ({ item, summary }));
}

export function threadSearchDetails(item: WorkItem, context: SearchContext) {
  const { chat, names, people } = indexed(item, context);
  const title = chat ? (names.replace(/ \. /g, ', ') || 'Conversation') : item.label || item.title;
  return { title, kind: chat ? 'chat' : 'agent', people };
}

export type ThreadSearchDetails = ReturnType<typeof threadSearchDetails>;

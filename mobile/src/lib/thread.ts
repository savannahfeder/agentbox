// ONE THREAD ON THE PHONE APP: the desktop's conversation (item-thread.ts)
// from the copy a Mac sent, laid out as components/ItemThread.tsx and
// Thread.tsx lay it out, with the options it still offers and the threads it
// filed.

import { itemThread } from '../../../renderer/src/item-thread';
import { itemOptions, offerIsLive, optionsFrom, stripOptionsSection, type ParsedOption } from '../../../renderer/src/format';
import { rowTitle } from '../../../renderer/src/list-rules';
import { askLine } from '../../../renderer/src/ask-line';
import { phoneHistory, type PhoneRows, type phoneView } from '../../../renderer/src/phone-rows';
import { recapFor, resultLeads } from '../../../renderer/src/recap';
import { withoutTrailingWork } from '../../../renderer/src/trailing-work';
import { herTurnEnds, herTurnStarts } from '../../../renderer/src/her-turns';
import { filedOnTurn } from '../../../renderer/src/filed-in-thread';
import { approvableFiled, threadsMade } from '../../../renderer/src/threads-made';
import { closeAsk } from '../../../renderer/src/close-asks-first';
import { conversationGap, gapIndex } from '../../../shared/agents.mjs';
import { groupWork } from '../../../shared/work-lines.mjs';
import type { ThreadStateWord } from '../../../renderer/src/types';
import type { Row, TabId } from './tabs';

type View = ReturnType<typeof phoneView>;

export interface FiledRow { id: string; title: string; state: ThreadStateWord | null; approve: boolean; at: number; item: any }

/** Which tab each thread is in, the later lists winning, as App.tsx's `tabState` has it. */
export function tabStates(tabs: Record<TabId, Row[]>): Map<string, ThreadStateWord> {
  const state = new Map<string, ThreadStateWord>();
  const order: [TabId, ThreadStateWord][] = [['done', 'done'], ['snoozed', 'scheduled'], ['progress', 'running'], ['inbox', 'waiting']];
  for (const [tab, word] of order) for (const r of tabs[tab] ?? []) state.set(r.key, word);
  return state;
}

export function threadOf(rows: PhoneRows, view: View, product: string, id: string, { whole = false, tabs }: { whole?: boolean; tabs?: Record<TabId, Row[]> } = {}) {
  const item = view.items.find((i: any) => i.product === product && i.id === id) ?? null;
  if (!item) return null;
  const { lines } = phoneHistory(rows, product, id, view.aliases);
  const mine = view.waiting.filter((w) => w.product === product && w.id === id);
  const pending = mine.map((w) => ({ at: w.at, text: w.text, ...(w.refused ? { refused: w.refused } : {}) }));
  // A reply Agentbox Cloud took with the computer away says so (shared/cloud-kit.mjs).
  const inCloud = new Set(mine.filter((w) => w.cloud).map((w) => w.at));
  const session = view.running.find((r: { itemId: string; product: string }) => r.itemId === id && r.product === product) ?? null;
  const built = itemThread(lines, [], null, { whole, pending });
  // The offer's own list comes out of the text while it is drawn as buttons
  // (Focus.tsx `cleanMessage`); "## Gist" is a heading old workers wrote.
  const live = offerIsLive(item);
  const offered = live ? String(item[optionsFrom(item)] ?? '').trim() : null;
  const clean = (text: string) => (live && text.trim() === offered ? stripOptionsSection(text) : text).replace(/^##\s*Gist\s*\n+/i, '');
  const said = built.events.map((e) => (e.kind === 'work' ? e : { ...e, text: clean(e.text ?? ''), ...(e.pending && !e.refused && inCloud.has(e.at) ? { cloud: true } : {}) }));
  // While a run is up the live line speaks for its newest steps (ItemThread.tsx).
  const shown = session ? withoutTrailingWork(said) : said;

  const parent = item.parent ? view.items.find((i: any) => i.product === product && i.id === item.parent) ?? null : null;
  const recap = recapFor(item, parent, parent ? phoneHistory(rows, product, parent.id, view.aliases).lines : undefined);
  const opening = recap?.kind === 'said' ? { at: recap.at, who: 'you' as const, text: recap.text, on: recap.on } : null;
  const events: any[] = opening ? [opening, ...shown] : shown;

  const gapAfter = gapIndex(events, built.omitted);
  const nodes = groupWork(events.map((e, i) => ({ ...e, i })), { min: 1 }) as any[];
  const lastOf = (n: any) => (n.kind === 'run' ? n.items[n.items.length - 1]?.i : n.i);
  const cutAt = nodes.findIndex((n) => lastOf(n) === gapAfter);

  const states = tabs ? tabStates(tabs) : new Map<string, ThreadStateWord>();
  const filed: FiledRow[] = threadsMade(view.items, item).map((i: any) => {
    const state = states.get(`${i.product}/${i.id}`) ?? null;
    return { id: i.id, title: i.label || i.title, state, approve: approvableFiled(i, state), at: i.createdAt ?? 0, item: i };
  });
  const placed = filedOnTurn(events, filed);
  const waitingFiled = filed.filter((f) => f.approve);

  const outcome = built.outcome ? { ...built.outcome, text: clean(built.outcome.text) } : null;
  return {
    item,
    title: rowTitle(item),
    projectName: view.products.find((p) => p.slug === product)?.name ?? '',
    running: !!session,
    session,
    inProgress: (tabs?.progress ?? []).some((r) => r.key === `${product}/${id}`),
    events,
    nodes,
    turnStarts: herTurnStarts(nodes, cutAt),
    turnEnds: herTurnEnds(nodes, cutAt),
    /** The last event before the left-out middle, or -1 when nothing is left out. */
    gapAfter,
    omitted: built.omitted,
    gapWords: conversationGap(built.omitted),
    // A result an agent finished the thread on leads unlabelled (ItemThread.tsx).
    outcome: outcome && { ...outcome, label: resultLeads(item) && outcome.field === 'result' ? null : outcome.field === 'result' ? 'Result' : 'Latest checkpoint' },
    after: built.after,
    options: (live ? itemOptions(item) : []) as ParsedOption[],
    // The question the options answer, the options card's heading (OptionsOffer.tsx).
    ask: live ? askLine(item) : '',
    parent,
    filed,
    filedOnTurn: placed.onTurn,
    filedAtFoot: placed.atFoot,
    waitingFiled,
    closeAsk: closeAsk(waitingFiled.length),
  };
}

export type Thread = NonNullable<ReturnType<typeof threadOf>>;

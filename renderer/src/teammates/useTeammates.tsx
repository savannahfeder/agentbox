// Which teammates page is up, and the pieces App draws for it: the sidebar
// rows, the title, the right end of the top bar and the page. Kept apart from
// useRooms, whose every field App reads is pinned by its own tests.
import { useMemo, useState, type ReactNode } from 'react';
import type { Product, RunningSession, TeammatesView, WorkItem } from '../types';
import { TeammateMenu, TeammatesPage, TeammatesTitle, shownOf, type TeammateModels } from './TeammatesPage';
import { SidebarGroups } from '../team/rooms/GroupsSidebar';
import { api } from '../api';
import { asksYou, heldFor } from './chat-lines';
import type { TabView } from '../threads/Pages';

/** `new`, a teammate's id, or `log:`, `about:` or `book:` one of its pages; 'team' opens the first chat. */
export type TeammatesOpen = string | null;

export function useTeammates({ items = [], view: stored, asking = [], running = [], products, engines, models, me, mePic = null, onEnter, onOpenThread, tabOf, onOpenList, onChanged }: {
  /** Every thread the app holds, so what a teammate sent you is drawn as its inbox row. */
  items?: WorkItem[];
  models?: TeammateModels;
  mePic?: string | null;
  view: TeammatesView | null | undefined;
  /** The agents running now (`snapshot.supervisor.running`). */
  running?: RunningSession[];
  /** Threads waiting for you to allow or deny a command. */
  asking?: (string | null)[];
  products: Product[];
  engines: { id: string; label: string }[];
  me: string;
  /** Leave whatever page is up, so this one can be. */
  onEnter: () => void;
  onOpenThread: (product: string, id: string) => void;
  /** The inbox tab a thread sits in, and a way to open the inbox at one. */
  tabOf?: (item: WorkItem) => TabView | null;
  onOpenList?: (view: TabView) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<TeammatesOpen>(null);
  const askingKey = asking.filter(Boolean).sort().join(' ');
  const view = useMemo(() => {
    if (!stored) return stored;
    const ids = new Set(askingKey ? askingKey.split(' ') : []);
    return {
      ...stored,
      list: stored.list.map((t) => {
        if (t.running && ids.has(t.running.id)) return { ...t, asking: true, now: 'Asking you to allow a command' };
        if (asksYou(stored, t.id)) return { ...t, question: true, now: 'Has a question for you' };
        if (heldFor(stored, t.id)) return { ...t, held: true, now: 'Holding work for your go-ahead' };
        return t;
      }),
    };
  }, [stored, askingKey]);
  const live = !!view;
  const sessions = useMemo(() => new Map(running.map((r) => [r.itemId, r])), [running]);
  const go = (which: string) => { onEnter(); setOpen(which); };
  const leave = () => setOpen(null);
  // 'team' and 'roster' were pages of their own; they open the first chat now.
  const shownOpen = live && open ? open : null;
  const team = view?.list ?? [];
  const shown = shownOpen ? shownOf(shownOpen, team) : null;
  const mate = shown && shown.kind !== 'new' ? team.find((t) => t.id === shown.id) ?? null : null;
  const page: ReactNode = shownOpen && view
    ? <TeammatesPage view={view} items={items} open={shownOpen} products={products} engines={engines} me={me}
        onOpen={go} onOpenThread={onOpenThread} tabOf={tabOf} onOpenList={onOpenList} onChanged={onChanged} sessions={sessions} models={models} mePic={mePic} />
    : null;
  const call = async (op: string, args: Record<string, unknown>) => { const r = await api.teammates(op, args); if (r.ok) onChanged(); return r.ok; };
  return {
    live,
    open: shownOpen,
    go,
    leave,
    /** Escape: from About, its Log or a playbook back to its chat; from a chat, out of Chats. */
    back: () => (shown && (shown.kind === 'about' || shown.kind === 'log' || shown.kind === 'book') ? go(shown.id) : leave()),
    list: team,
    onNew: () => go('new'),
    /** The wide sidebar's one Chats row; with Groups on, the Groups row is it. */
    rail: (lit: boolean) => (live ? <SidebarGroups label="Chats" onGroupsPage={lit} onGroups={() => go(open === 'new' || !open ? (team[0]?.id ?? 'new') : open)} /> : null),
    title: shownOpen ? <TeammatesTitle view={view ?? null} open={shownOpen} /> : null,
    right: mate && shown ? <div className="th-right"><TeammateMenu t={mate} shown={shown} onOpen={go} call={call} /></div> : null,
    page,
  };
}

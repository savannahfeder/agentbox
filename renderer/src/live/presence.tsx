// WHO IS IN A LIVE FILE AND WHERE: cursors in the words, and around the page
// the people and agents in the room. Five ways of drawing it are kept while
// one is chosen; `presenceLook` picks the one shown.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import { Extension, type AnyExtension } from '@tiptap/core';
import { yCursorPlugin, ySyncPluginKey } from '@tiptap/y-tiptap';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Awareness } from 'y-protocols/awareness';
import { Face } from '../team/people';
import type { LiveSession } from './live-session';
import './presence.css';

export type PresenceLook = 'flags' | 'rail' | 'gutter' | 'tint';
export const PRESENCE_LOOKS: PresenceLook[] = ['flags', 'rail', 'gutter', 'tint'];

export function presenceLook(): PresenceLook {
  try {
    const v = localStorage.getItem('live-presence-look');
    if (v && (PRESENCE_LOOKS as string[]).includes(v)) return v as PresenceLook;
  } catch { /* no storage */ }
  return 'flags';
}

export interface LiveUser { name: string; color: string; kind?: 'person' | 'agent'; person?: string | null }

// With a hundred people moving many times a second, "the few who moved last"
// changes faster than a name can be read. So a name, and a drawn cursor, holds
// a place for a while once it has one, and the next to move takes a free place.
class Places {
  private held = new Map<number, number>();
  constructor(private most: number, private holdMs: number, private renew: boolean) {}
  private expire(now: number) { for (const [id, at] of this.held) if (now - at > this.holdMs) this.held.delete(id); }
  moved(id: number, now = Date.now()) {
    this.expire(now);
    if (this.held.has(id) ? this.renew : this.held.size < this.most) this.held.set(id, now);
  }
  drop(id: number) { this.held.delete(id); }
  has(id: number, now = Date.now()) { this.expire(now); return this.held.has(id); }
  count(now = Date.now()) { this.expire(now); return this.held.size; }
}
// Three names at a time, each up long enough to read: two people's and an
// agent's, since agents land whole sentences and would take every place.
class Names {
  private people = new Places(2, 2000, false);
  private agents = new Places(1, 2000, false);
  moved(id: number, agent: boolean) { (agent ? this.agents : this.people).moved(id); }
  drop(id: number) { this.people.drop(id); this.agents.drop(id); }
  has(id: number) { return this.people.has(id) || this.agents.has(id); }
}
const named = new WeakMap<Awareness, Names>();
// Past thirty, more cursors are noise to read and cost every window a redraw of each on every move.
const MOST_CARETS = 30;
const namedIn = (a: Awareness) => { let p = named.get(a); if (!p) { p = new Names(); named.set(a, p); } return p; };

function caretFor(user: Record<string, unknown>, clientId: number, fresh = false): HTMLElement {
  const u = user as unknown as LiveUser;
  const caret = document.createElement('span');
  caret.dataset.client = String(clientId);
  caret.className = `lv-caret${u.kind === 'agent' ? ' is-agent' : ''}${fresh ? ' is-fresh' : ''}`;
  caret.style.setProperty('--lv', u.color || '#7aa2ff');
  caret.dataset.name = u.name ?? '';
  caret.dataset.kind = u.kind ?? 'person';
  const flag = document.createElement('span');
  flag.className = 'lv-flag';
  flag.textContent = u.name ?? '';
  caret.append(flag);
  return caret;
}

/** The editor's part: the shared words and everyone's cursor in them. */
export function liveExtensions(session: LiveSession): AnyExtension[] {
  return [
    Collaboration.configure({ document: session.doc }),
    LiveCarets.configure({
      awareness: session.live.awareness,
      user: { name: session.me.name, color: session.me.color, kind: session.me.kind, person: session.me.person },
    }),
    YourCaret,
  ];
}

// With a dozen coloured cursors on the page a person lost their own and typed
// into someone else's sentence. Theirs says "You" as they move or type, and is
// never one of the colours the others wear.
const youKey = new PluginKey<number>('liveYou');
const YourCaret = Extension.create({
  name: 'liveYou',
  addProseMirrorPlugins() {
    return [new Plugin<number>({
      key: youKey,
      state: {
        init: () => 0,
        apply: (tr, was) => (tr.getMeta(ySyncPluginKey) || !(tr.selectionSet || tr.docChanged) ? was : Date.now()),
      },
      props: {
        decorations(state) {
          const at = youKey.getState(state) ?? 0;
          if (!at || !state.selection.empty) return null;
          return DecorationSet.create(state.doc, [Decoration.widget(state.selection.head, () => {
            const el = document.createElement('span');
            el.className = 'lv-you';
            const flag = document.createElement('span');
            flag.className = 'lv-flag';
            flag.textContent = 'You';
            el.append(flag);
            return el;
          }, { key: `you-${at}`, side: 1 })]);
        },
      },
    })];
  },
});

// The cursor plugin itself rather than CollaborationCaret, which drops the
// client id a cursor needs to say who moved last.
const LiveCarets = Extension.create<{ awareness: Awareness | null; user: LiveUser | null }>({
  name: 'liveCarets',
  addOptions() { return { awareness: null, user: null }; },
  addProseMirrorPlugins() {
    const { awareness, user } = this.options;
    if (!awareness) return [];
    awareness.setLocalStateField('user', user);
    // Heard before the cursor plugin hears it, so a cursor drawn for a move knows it moved.
    const names = namedIn(awareness);
    const moved = new Map<number, number>();
    awareness.on('change', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const now = Date.now();
      for (const id of [...added, ...updated]) {
        if (id !== awareness.clientID) moved.set(id, now);
      }
      for (const id of removed) { moved.delete(id); names.drop(id); }
    });
    // The cursors drawn are the ones that moved last; everyone else is counted by the faces.
    let drawn = new Set<number>();
    let drawnAt = 0;
    const isDrawn = (me: number, id: number) => {
      if (id === me) return false;
      if (moved.size <= MOST_CARETS) return true;
      const now = Date.now();
      if (now - drawnAt > 100) {
        drawnAt = now;
        drawn = new Set([...moved].sort((a, b) => b[1] - a[1]).slice(0, MOST_CARETS).map(([c]) => c));
      }
      return drawn.has(id) || names.has(id);
    };
    return [yCursorPlugin(awareness, {
      awarenessStateFilter: isDrawn,
      cursorBuilder: (u: Record<string, unknown>, clientId: number) => caretFor(u, clientId, names.has(clientId)),
      selectionBuilder: (u: Record<string, unknown>) => ({ class: 'lv-sel', style: `--lv: ${String(u.color ?? '#7aa2ff')}` }),
    })];
  },
});

/** Names show on the cursors of the few people who moved last, and fade from the rest. */
function useFreshFlags(session: LiveSession, column: HTMLElement | null) {
  useEffect(() => {
    if (!column) return undefined;
    // The editor keeps a cursor's element as it moves, so the name is shown or hidden on it here.
    let frame = 0;
    // A cursor can move a moment before the words it points into arrive, and is
    // drawn only once they have, so a move is looked at again for a second.
    const movedNow = new Map<number, number>();
    const paint = () => {
      frame = 0;
      const names = namedIn(session.live.awareness);
      const now = Date.now();
      // A name is only worth a place on a cursor the person can see.
      for (const [id, at] of movedNow) {
        const el = column.querySelector<HTMLElement>(`.lv-caret[data-client="${id}"]`);
        const r = el?.getBoundingClientRect();
        if (el && r && r.bottom > 0 && r.top < window.innerHeight) { names.moved(id, el.dataset.kind === 'agent'); movedNow.delete(id); }
        else if (el || now - at > 1000) movedNow.delete(id);
      }
      for (const el of column.querySelectorAll<HTMLElement>('.lv-caret')) el.classList.toggle('is-fresh', names.has(Number(el.dataset.client)));
    };
    const soon = ({ added = [], updated = [] }: { added?: number[]; updated?: number[] } = {}) => {
      for (const id of [...added, ...updated]) if (id !== session.doc.clientID) movedNow.set(id, Date.now());
      frame ||= requestAnimationFrame(paint);
    };
    session.live.awareness.on('change', soon);
    const sweep = window.setInterval(() => soon(), 200);
    return () => { session.live.awareness.off('change', soon); window.clearInterval(sweep); if (frame) cancelAnimationFrame(frame); };
  }, [session.live, column]);
}

interface Here { id: number; name: string; color: string; agent: boolean; person: string | null; me: boolean }

/** Everyone in the room, one entry each, you first. */
function useHere(session: LiveSession): Here[] {
  const [here, setHere] = useState<Here[]>([]);
  useEffect(() => {
    const { awareness } = session.live;
    let frame = 0;
    const read = () => {
      frame = 0;
      const seen = new Map<string, Here>();
      for (const [id, s] of awareness.getStates()) {
        const u = (s.user ?? s.who) as LiveUser | undefined;
        if (!u?.name) continue;
        const key = u.person ? `${u.person}:${u.kind ?? 'person'}` : `c${id}`;
        const me = id === session.doc.clientID;
        if (seen.has(key) && !me) continue;
        seen.set(key, { id, name: u.name, color: u.color, agent: u.kind === 'agent', person: u.person ?? null, me });
      }
      setHere([...seen.values()].sort((a, b) => Number(b.me) - Number(a.me)));
    };
    // Hundreds of cursors move many times a second; who is here is read a few times a second.
    const soon = () => { frame ||= window.setTimeout(read, HERE_EVERY_MS) as unknown as number; };
    read();
    awareness.on('change', soon);
    return () => { awareness.off('change', soon); if (frame) window.clearTimeout(frame); };
  }, [session.live, session.doc]);
  return here;
}

interface Spot { name: string; color: string; agent: boolean; top: number; block: number; blockH: number; section: string }

/** Where each cursor is on the page, measured off the cursors the editor drew. */
function useSpots(editor: Editor | null, column: HTMLElement | null, session: LiveSession, wanted: boolean): Spot[] {
  const [spots, setSpots] = useState<Spot[]>([]);
  useEffect(() => {
    if (!editor || !column || !wanted) { setSpots([]); return undefined; }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = column.getBoundingClientRect();
      const out: Spot[] = [];
      for (const el of column.querySelectorAll<HTMLElement>('.lv-caret')) {
        const r = el.getBoundingClientRect();
        let block: HTMLElement | null = el.parentElement;
        while (block && block.parentElement && !block.parentElement.classList.contains('ProseMirror')) block = block.parentElement;
        let section = '';
        for (let b: Element | null = block; b; b = b.previousElementSibling) {
          if (/^H[1-3]$/.test(b.tagName)) { const c = b.cloneNode(true) as Element; for (const x of c.querySelectorAll('.lv-caret, .lv-you')) x.remove(); section = c.textContent ?? ''; break; }
        }
        out.push({
          name: el.dataset.name ?? '',
          color: el.style.getPropertyValue('--lv'),
          agent: el.dataset.kind === 'agent',
          top: r.top - box.top,
          block: block ? block.getBoundingClientRect().top - box.top : r.top - box.top,
          blockH: block ? block.getBoundingClientRect().height : r.height,
          section,
        });
      }
      setSpots(out);
    };
    const soon = () => { frame ||= requestAnimationFrame(measure); };
    measure();
    editor.on('transaction', soon);
    session.live.awareness.on('change', soon);
    window.addEventListener('resize', soon);
    return () => {
      editor.off('transaction', soon);
      session.live.awareness.off('change', soon);
      window.removeEventListener('resize', soon);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor, column, session.live, wanted]);
  return spots;
}

const MOST_FACES = 5;
const HERE_EVERY_MS = 400;
const MOST_SQUARES = 5;

function Faces({ here }: { here: Here[] }) {
  const shown = here.slice(0, MOST_FACES);
  return (
    <div className="lv-faces" title={here.map((h) => h.name).join(', ')}>
      {shown.map((h) => (
        <span key={h.id} className="lv-face" style={{ ['--lv' as string]: h.color }}>
          <Face name={h.name} agent={h.agent} me={h.me} size={22} />
        </span>
      ))}
      {here.length > MOST_FACES && <span className="lv-more">+{here.length - MOST_FACES}</span>}
    </div>
  );
}

/** Who is here, as faces, for a surface that marks places itself (a table). */
export function LiveFaces({ session }: { session: LiveSession }) {
  const here = useHere(session);
  if (here.length < 2) return null;
  return <Faces here={here} />;
}

/** What is drawn around the page: who is here, and where they are. */
export function LivePresence({ session, editor, column, look }: { session: LiveSession; editor: Editor | null; column: HTMLElement | null; look: PresenceLook }) {
  const here = useHere(session);
  useFreshFlags(session, column);
  const spots = useSpots(editor, column, session, look !== 'flags');
  const others = here.filter((h) => !h.me);
  const height = column?.scrollHeight ?? 1;
  const byBlock = useMemo(() => {
    const m = new Map<number, Spot[]>();
    for (const s of spots) { const k = Math.round(s.block); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m];
  }, [spots]);
  if (!others.length) return null;
  return (
    <>
      <Faces here={here} />
      {look === 'rail' && (
        <div className="lv-rail" aria-hidden="true">
          {spots.map((s, i) => <span key={i} className={`lv-tick${s.agent ? ' is-agent' : ''}`} style={{ top: `${(s.top / height) * 100}%`, ['--lv' as string]: s.color }} title={s.name} />)}
        </div>
      )}
      {look === 'gutter' && byBlock.map(([top, list]) => (
        <div key={top} className="lv-gutter" style={{ top }} aria-hidden="true">
          {list.slice(0, MOST_SQUARES).map((s, i) => <span key={i} className={`lv-sq${s.agent ? ' is-agent' : ''}`} style={{ ['--lv' as string]: s.color }} title={s.name} />)}
          {list.length > MOST_SQUARES && <span className="lv-sq-more">+{list.length - MOST_SQUARES}</span>}
        </div>
      ))}
      {look === 'tint' && byBlock.map(([top, list]) => (
        <div key={top} className={`lv-tint${list.some((s) => s.agent) ? ' is-agent' : ''}`} style={{ top, height: list[0].blockH, ['--lv' as string]: list[0].color }} aria-hidden="true" />
      ))}
    </>
  );
}

// WHO IS IN A LIVE FILE AND WHERE: cursors in the words, and around the page
// the people and agents in the room. Five ways of drawing it are kept while
// one is chosen; `presenceLook` picks the one shown.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import { Extension, type AnyExtension } from '@tiptap/core';
import { yCursorPlugin } from '@tiptap/y-tiptap';
import type { Awareness } from 'y-protocols/awareness';
import { Face } from '../team/people';
import type { LiveSession } from './live-session';
import './presence.css';

export type PresenceLook = 'flags' | 'rail' | 'gutter' | 'tint' | 'roster';
export const PRESENCE_LOOKS: PresenceLook[] = ['flags', 'rail', 'gutter', 'tint', 'roster'];

export function presenceLook(): PresenceLook {
  try {
    const v = localStorage.getItem('live-presence-look');
    if (v && (PRESENCE_LOOKS as string[]).includes(v)) return v as PresenceLook;
  } catch { /* no storage */ }
  return 'flags';
}

export interface LiveUser { name: string; color: string; kind?: 'person' | 'agent'; person?: string | null }

const FRESH_MS = 3500;
const MOST_FLAGS = 8;
// When each cursor last moved, kept per room, so a cursor the editor draws again keeps its name showing.
const movedIn = new WeakMap<Awareness, Map<number, number>>();
function freshIn(moved: Map<number, number> | undefined): Set<number> {
  const now = Date.now();
  return new Set([...(moved ?? [])].filter(([, at]) => now - at < FRESH_MS).sort((a, b) => b[1] - a[1]).slice(0, MOST_FLAGS).map(([id]) => id));
}

function caretFor(user: Record<string, unknown>, clientId: number, fresh = false): HTMLElement {
  const u = user as unknown as LiveUser;
  const caret = document.createElement('span');
  caret.dataset.client = String(clientId);
  if (fresh) caret.classList.add('is-fresh');
  caret.className = `lv-caret${u.kind === 'agent' ? ' is-agent' : ''}`;
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
  ];
}

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
    const moved = movedIn.get(awareness) ?? new Map<number, number>();
    movedIn.set(awareness, moved);
    awareness.on('change', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      const now = Date.now();
      for (const id of [...added, ...updated]) if (id !== awareness.clientID) moved.set(id, now);
      for (const id of removed) moved.delete(id);
    });
    return [yCursorPlugin(awareness, {
      cursorBuilder: (u: Record<string, unknown>, clientId: number) => caretFor(u, clientId, freshIn(moved).has(clientId)),
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
    const paint = () => {
      frame = 0;
      const fresh = freshIn(movedIn.get(session.live.awareness));
      for (const el of column.querySelectorAll<HTMLElement>('.lv-caret')) el.classList.toggle('is-fresh', fresh.has(Number(el.dataset.client)));
    };
    const soon = () => { frame ||= requestAnimationFrame(paint); };
    session.live.awareness.on('change', soon);
    const sweep = window.setInterval(paint, 500);
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
    const soon = () => { frame ||= requestAnimationFrame(read); };
    read();
    awareness.on('change', soon);
    return () => { awareness.off('change', soon); if (frame) cancelAnimationFrame(frame); };
  }, [session.live, session.doc]);
  return here;
}

interface Spot { name: string; color: string; agent: boolean; top: number; block: number; blockH: number; section: string }

/** Where each cursor is on the page, measured off the cursors the editor drew. */
function useSpots(editor: Editor | null, column: HTMLElement | null, session: LiveSession): Spot[] {
  const [spots, setSpots] = useState<Spot[]>([]);
  useEffect(() => {
    if (!editor || !column) return undefined;
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
          if (/^H[1-3]$/.test(b.tagName)) { section = b.textContent ?? ''; break; }
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
  }, [editor, column, session.live]);
  return spots;
}

const MOST_FACES = 5;
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
  const spots = useSpots(editor, column, session);
  const others = here.filter((h) => !h.me);
  const height = column?.scrollHeight ?? 1;
  const byBlock = useMemo(() => {
    const m = new Map<number, Spot[]>();
    for (const s of spots) { const k = Math.round(s.block); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m];
  }, [spots]);
  const roster = useRef<HTMLDivElement | null>(null);
  if (!others.length) return null;
  return (
    <>
      {look !== 'roster' && <Faces here={here} />}
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
      {look === 'roster' && (
        <div className="lv-roster" ref={roster}>
          <div className="lv-roster-count">{here.length} here</div>
          {here.slice(0, 14).map((h) => {
            const at = spots.find((s) => s.name === h.name);
            return (
              <div key={h.id} className="lv-roster-row" style={{ ['--lv' as string]: h.color }}>
                <span className="lv-roster-dot" />
                <span className="lv-roster-name">{h.me ? 'You' : h.name}</span>
                {at?.section && <span className="lv-roster-at">{at.section}</span>}
              </div>
            );
          })}
          {here.length > 14 && <div className="lv-roster-more">and {here.length - 14} more</div>}
        </div>
      )}
    </>
  );
}

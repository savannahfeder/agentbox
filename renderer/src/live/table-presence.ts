// Who is on which cell of a live table, drawn on the cells themselves.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LiveSession } from './live-session';

const FRESH_MS = 3500;
const MOST_NAMES = 6;
const MOST_MARKS = 30;

/** Whether a copy that can write the file is in the room, this one included. */
export function useRoomKept(room: LiveSession | null): boolean {
  const [kept, setKept] = useState(false);
  useEffect(() => {
    if (!room) { setKept(false); return undefined; }
    const read = () => setKept([...room.live.awareness.getStates().values()].some((s) => s.keeps === true));
    read();
    room.live.awareness.on('change', read);
    return () => room.live.awareness.off('change', read);
  }, [room?.live]);
  return kept;
}

interface Ids { rowIds: string[]; colIds: string[] }

/**
 * Marks each cell someone else is on with their colour and name. Cells are
 * found by their place in the view, so a sorted or filtered table marks the
 * right one, and a row out of view is simply not marked.
 */
export function useCellMarks(box: RefObject<HTMLElement | null>, room: LiveSession | null, ids: RefObject<Ids | null>, order: number[], tick: unknown) {
  const [seen, setSeen] = useState(0);
  const moved = useRef(new Map<number, number>());
  useEffect(() => {
    if (!room) return undefined;
    const bump = ({ added, updated }: { added: number[]; updated: number[] }) => {
      const now = Date.now();
      for (const id of [...added, ...updated]) moved.current.set(id, now);
      setSeen((n) => n + 1);
    };
    room.live.awareness.on('change', bump);
    // Names fade from cells whose people have stopped, with nothing new to redraw them.
    const sweep = window.setInterval(() => setSeen((n) => n + 1), 1000);
    return () => { room.live.awareness.off('change', bump); window.clearInterval(sweep); };
  }, [room?.live]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    for (const c of el.querySelectorAll<HTMLElement>('[data-lv]')) { c.removeAttribute('data-lv'); c.style.removeProperty('--lv'); c.classList.remove('lv-cell', 'is-agent', 'is-fresh'); }
    const now = ids.current;
    if (!room || !now) return;
    const at = Date.now();
    const fresh = new Set([...moved.current].filter(([, t]) => at - t < FRESH_MS).sort((a, b) => b[1] - a[1]).slice(0, MOST_NAMES).map(([id]) => id));
    const viewAt = new Map(order.map((row, place) => [row, place]));
    // The cells marked are the ones whose people moved last; everyone else is counted by the faces.
    const states = [...room.live.awareness.getStates()].filter(([client]) => client !== room.doc.clientID);
    const marked = states.length <= MOST_MARKS ? states
      : states.sort((a, b) => (moved.current.get(b[0]) ?? 0) - (moved.current.get(a[0]) ?? 0)).slice(0, MOST_MARKS);
    for (const [client, s] of marked) {
      const cell = (s.at as { cell?: string } | null | undefined)?.cell;
      const user = (s.user ?? s.who) as { name?: string; color?: string; kind?: string } | undefined;
      if (!cell || !user?.name) continue;
      const [r, c] = cell.split('|');
      const place = viewAt.get(now.rowIds.indexOf(r));
      const col = now.colIds.indexOf(c);
      if (place === undefined || col < 0) continue;
      const target = el.querySelector<HTMLElement>(`[data-r="${place}"][data-c="${col}"]`);
      if (!target) continue;
      target.dataset.lv = target.dataset.lv ? `${target.dataset.lv}, ${user.name}` : user.name;
      target.style.setProperty('--lv', user.color ?? '#7aa2ff');
      target.classList.add('lv-cell');
      if (fresh.has(client)) target.classList.add('is-fresh');
      if (user.kind === 'agent') target.classList.add('is-agent');
    }
  });
  return seen;
}

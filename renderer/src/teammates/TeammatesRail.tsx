// A teammate's mark, a dashed letter, with a dot when it is waiting on you,
// and the line saying what it is on.
import type { Teammate } from '../types';
import { idleLine } from './chat-lines';
import './teammates.css';

export function TeammateMark({ t, size = 'sm', waiting = false }: { t: Pick<Teammate, 'letter' | 'name'> | null; size?: 'sm' | 'hd' | 'pic' | 'big'; waiting?: boolean }) {
  return <i className={`tq tq-${size}${t ? '' : ' tq-hash'}`} aria-hidden="true">{t ? t.letter || t.name.slice(0, 1) : '#'}{waiting && <i className="tq-wt" />}</i>;
}

export function nowLine(t: Teammate): string {
  if (t.question) return 'Has a question for you';
  if (t.held) return 'Holding work for your go-ahead';
  if (t.status === 'draft' && !t.waiting.length) return 'Setting up';
  if (t.paused && !t.running) return t.waiting.length || t.asking ? 'Paused, waiting on you' : 'Paused';
  return t.now ?? idleLine(t);
}

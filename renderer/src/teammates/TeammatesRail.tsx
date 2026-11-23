// A teammate's mark, its face, with a dot when it is waiting on you, and the
// line saying what it is on.
import type { Teammate } from '../types';
import { idleLine } from './chat-lines';
import { faceSeed } from '../../../shared/teammate-face.mts';
import { MateFace } from './MateFace';
import './teammates.css';

type Marked = Pick<Teammate, 'name'> & Partial<Pick<Teammate, 'id' | 'letter' | 'face'>>;

export function TeammateMark({ t, size = 'sm', waiting = false }: { t: Marked | null; size?: 'sm' | 'hd' | 'pic' | 'big'; waiting?: boolean }) {
  if (!t) return <i className={`tq tq-${size} tq-hash`} aria-hidden="true">#</i>;
  return <MateFace seed={faceSeed(t)} className={`tq tq-${size}`}>{waiting && <i className="tq-wt" />}</MateFace>;
}

export function nowLine(t: Teammate): string {
  if (t.question) return 'Has a question for you';
  if (t.held) return 'Holding work for your go-ahead';
  if (t.status === 'draft' && !t.waiting.length) return 'Setting up';
  if (t.paused && !t.running) return t.waiting.length || t.asking ? 'Paused, waiting on you' : 'Paused';
  return t.now ?? idleLine(t);
}

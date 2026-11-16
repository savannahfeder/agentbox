// A thread's files as their version lines number them (main/files-place.mts lineFor).
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { FileLine } from './types';
import { lineAsThread } from '../../shared/artifact-marks.mts';
import { askAtMostEvery } from './ask-at-most-every';

/** `follow` reads again on every change the app reports, or at most every that many ms; false, only when the thread says more. */
export function useFileLine(product: string, id: string, said: number, follow: boolean | number = true): ReturnType<typeof lineAsThread> {
  const [line, setLine] = useState<FileLine[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => { void api.fileLine({ product, id }).then((all) => { if (live) setLine((was) => (JSON.stringify(was) === JSON.stringify(all) ? was : all)); }); };
    read();
    const ask = typeof follow === 'number' ? askAtMostEvery(follow, read) : null;
    const off = ask ? api.onChanged(ask.changed) : follow ? api.onChanged(read) : null;
    return () => { live = false; ask?.stop(); off?.(); };
  }, [product, id, said, follow]);
  return useMemo(() => lineAsThread(line), [line]);
}

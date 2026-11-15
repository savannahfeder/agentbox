// A thread's files as their version lines number them (main/files-place.mts lineFor).
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { FileLine } from './types';
import { lineAsThread } from '../../shared/artifact-marks.mts';

/** `follow` reads again on every change the app reports; without it, only when the thread says more. */
export function useFileLine(product: string, id: string, said: number, follow = true): ReturnType<typeof lineAsThread> {
  const [line, setLine] = useState<FileLine[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => { void api.fileLine({ product, id }).then((all) => { if (live) setLine(all); }); };
    read();
    const off = follow ? api.onChanged(read) : null;
    return () => { live = false; off?.(); };
  }, [product, id, said, follow]);
  return useMemo(() => lineAsThread(line), [line]);
}

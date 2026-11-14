import { useEffect, useState } from 'react';
import { api } from '../api';

/** Whether any tool is connected, read again when the store changes. For Home's Next card. */
export function useToolsConnected(on: boolean): boolean {
  const [any, setAny] = useState(false);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    const read = () => { void api.connections().then((l) => { if (live) setAny(l.tiles.some((t) => t.connected)); }); };
    read();
    const off = api.onChanged(read);
    return () => { live = false; off?.(); };
  }, [on]);
  return any;
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { COMPACTION_COPY } from '../../../shared/codex-commands.mjs';
export type CompactionState = { state: string; at: number; text?: string; name?: string };
type Task = { product: string; id: string };
const listeners = new Set<(task: Task, value: CompactionState) => void>();
export async function runCompaction(task: Task): Promise<CompactionState> {
  let value: CompactionState;
  try { value = await api.compact(task); }
  catch { value = { state: 'failed', at: Date.now() }; }
  for (const listener of listeners) listener(task, value);
  return value;
}
export async function runCommand(task: Task, text: string): Promise<CompactionState> {
  let value: CompactionState;
  for (const listener of listeners) listener(task, {state: 'pending', text: 'Running command…', at: Date.now()});
  try { value = await api.command({...task, text}); }
  catch { value = {state: 'failed', text: 'The command failed. Your draft has been kept.', at: Date.now()}; }
  for (const listener of listeners) listener(task, value.state === 'copy' ? {...value, text: 'Response ready to copy.'} : value);
  return value;
}
export function CompactionResult({ item, engine = 'codex' }: { item: Task; engine?: string }) {
  const [value, setValue] = useState<CompactionState | null>(null);
  useEffect(() => {
    let gone = false;
    let timer: ReturnType<typeof setTimeout>;
    const receive = (task: Task, next: CompactionState) => {
      if (task.id !== item.id || task.product !== item.product || gone) return;
      clearTimeout(timer); setValue(next);
      if (next.state === 'running') timer = setTimeout(refresh, 500);
    };
    const refresh = async () => {
      try {
        const next = await api.compactionStatus(item);
        if (next) receive(item, next);
      } catch { if (!gone) receive(item, { state: 'failed', at: Date.now() }); }
    };
    setValue(null); listeners.add(receive); void refresh();
    return () => { gone = true; clearTimeout(timer); listeners.delete(receive); };
  }, [item.product, item.id]);
  if (!value || (value.name === 'remote-control' && value.state === 'done') || value.state === 'forward') return null;
  return <div className="thread"><div className="thread-block" role={value.state === 'failed' ? 'alert' : 'status'} aria-live="polite">
    <div className="thread-head">{value.name ? `/${value.name}` : engine === 'codex' ? 'Codex' : 'Claude Code'}</div>
    <p style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{value.text ?? COMPACTION_COPY[value.state as keyof typeof COMPACTION_COPY] ?? COMPACTION_COPY.failed}</p>
    {value.state === 'failed' && !value.text && <button type="button" className="compose-word" onClick={() => void runCompaction(item)}>Try again</button>}
  </div></div>;
}

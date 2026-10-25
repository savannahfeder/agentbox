// A thread's More sheet on the phone app: Later as the phone site's Snooze
// offers it (a time typed in words, the presets, and "Now" first on a thread
// put off), then the menu's own rows (threads/ThreadMenu.tsx): Run now while
// it waits for an agent, and closing it.
import { useState } from 'react';
import { parseWhen } from '../../../renderer/src/format';
import { laterRows, typedLater, typedLine } from '../lib/later';
import { TimeBox, TypingSheet } from './Later';
import { SheetHead, SheetRow, SheetSep } from './parts';

export function ThreadMenu({ open, close, now, laterNow, runNow, onLater, onBack, onRunNow, onClose }: {
  open: boolean; close: () => void; now: number;
  /** Already put off: "Now (back to inbox)" comes first. */
  laterNow: boolean;
  runNow: boolean;
  onLater: (until: number, label: string) => void;
  onBack: () => void;
  onRunNow: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [refused, setRefused] = useState(false);
  const typed = typedLater(text, now);
  const done = () => { setText(''); setRefused(false); close(); };
  // Typed words always decide; words it cannot read are refused, never a preset (format.ts `enterMeans`).
  const submit = () => {
    if (!text.trim()) return;
    if (!typed) { setRefused(true); return; }
    const label = parseWhen(text, now)?.label ?? typed.hint;
    done();
    onLater(typed.ts, label);
  };
  return (
    <TypingSheet open={open} close={done}>
      <SheetHead>Later</SheetHead>
      <TimeBox value={text} onChange={(t) => { setText(t); setRefused(false); }} placeholder="Try: 30m, 3h, 8am, tomorrow, next week"
        onSubmit={submit} line={typedLine(text, typed, refused)} onLine={submit} />
      {laterRows(now, { back: laterNow }).map((row) => (
        <SheetRow key={row.label} label={row.label} aside={row.hint} onPress={() => { done(); if (row.now) onBack(); else onLater(row.ts, row.label); }} />
      ))}
      <SheetSep />
      {runNow && <SheetRow label="Run now" onPress={() => { done(); onRunNow(); }} />}
      <SheetRow label="Close this thread" onPress={() => { done(); onClose(); }} />
    </TypingSheet>
  );
}

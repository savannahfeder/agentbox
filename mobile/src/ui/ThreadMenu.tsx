// A thread's More sheet on the phone app: Later as the phone site's Snooze
// offers it (a time typed in words, the presets, and "Now" first on a thread
// put off), then the menu's own rows (threads/ThreadMenu.tsx) and the rows ⌘K
// adds there, each only where it applies (lib/thread-offers.ts). Priority,
// Rename and Move open in the same sheet rather than a second one over it.
import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { parseWhen } from '../../../renderer/src/format';
import { priorityLabelOf, priorityIdOf } from '../../../renderer/src/priority';
import { projectSwatch } from '../../../renderer/src/threads/composer-rules';
import { laterRows, typedLater, typedLine } from '../lib/later';
import { PLACE_ROW, type Place } from '../lib/thread-offers';
import { TimeBox, TypingSheet } from './Later';
import { Pin } from './icons';
import { SheetHead, SheetRow, SheetSep, T } from './parts';
import { PriorityRows } from './Pickers';
import { color, corner, font } from './theme';

type Page = 'menu' | 'priority' | 'rename' | 'move';

export function ThreadMenu({ open, close, now, laterNow, runNow, moveToCloud = false, pinned, onPin, onUnread, onLater, onBack, onRunNow, onMoveToCloud, onReport, onClose, closed = false,
  tryAgain = false, onTryAgain, restart = false, onRestart, resume = null, onResume, reopen = false, onReopen, priority = null, onPriority, name = null, onRename,
  projects = [], onMove, place = null, onPlace, repeats = false, onEndRepeat }: {
  open: boolean; close: () => void; now: number;
  /** Closed already: the lists never put it in Later, so neither Later nor Close is offered. */
  closed?: boolean;
  /** Already put off: "Now (back to inbox)" comes first. */
  laterNow: boolean;
  runNow: boolean;
  /** Its agent runs on the computer and the cloud could take it now. */
  moveToCloud?: boolean;
  /** Pin thread or Unpin thread; null where it cannot be pinned (a closed thread, one no computer has made). */
  pinned: boolean | null;
  onPin: (pin: boolean) => void;
  /** Unread again, and back to the list (the web app's Mark unread). */
  onUnread?: () => void;
  onLater: (until: number, label: string) => void;
  onBack: () => void;
  onRunNow: () => void;
  onMoveToCloud?: () => void;
  /** Report what an agent wrote here (App Review 1.2). */
  onReport?: () => void;
  onClose: () => void;
  tryAgain?: boolean; onTryAgain?: () => void;
  restart?: boolean; onRestart?: () => void;
  resume?: 'done' | null; onResume?: () => void;
  reopen?: boolean; onReopen?: () => void;
  /** The level it runs at; null where the menu offers none. */
  priority?: number | null; onPriority?: (value: number) => void;
  /** The name it shows; null where it cannot be renamed. */
  name?: string | null; onRename?: (label: string) => void;
  /** Where a move can go; none where it cannot move. */
  projects?: readonly { slug: string; name: string }[]; onMove?: (to: { slug: string; name: string }) => void;
  place?: Place | null; onPlace?: (keep: boolean) => void;
  /** A run of a repeating task its computer still keeps. */
  repeats?: boolean; onEndRepeat?: () => void;
}) {
  const [page, setPage] = useState<Page>('menu');
  const [text, setText] = useState('');
  const [refused, setRefused] = useState(false);
  const [naming, setNaming] = useState('');
  const typed = typedLater(text, now);
  const done = () => { setText(''); setRefused(false); setPage('menu'); close(); };
  const act = (fn?: () => void) => () => { done(); fn?.(); };
  // Typed words always decide; words it cannot read are refused, never a preset (format.ts `enterMeans`).
  const submit = () => {
    if (!text.trim()) return;
    if (!typed) { setRefused(true); return; }
    const label = parseWhen(text, now)?.label ?? typed.hint;
    done();
    onLater(typed.ts, label);
  };
  const rename = () => {
    const label = naming.replace(/\s+/g, ' ').trim();
    if (!label) return;
    done();
    if (label !== name) onRename?.(label);
  };
  if (page === 'priority' && priority !== null) {
    return <TypingSheet open={open} close={done}><PriorityRows value={priority} pick={(v) => { done(); onPriority?.(v); }} /></TypingSheet>;
  }
  if (page === 'move') {
    return (
      <TypingSheet open={open} close={done}>
        <SheetHead>Move to another project</SheetHead>
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} lead={<View style={{ width: 9, height: 9, backgroundColor: projectSwatch(p.slug) }} />} onPress={() => { done(); onMove?.(p); }} />)}
      </TypingSheet>
    );
  }
  if (page === 'rename') {
    const ready = !!naming.trim();
    return (
      <TypingSheet open={open} close={done}>
        <SheetHead>Rename</SheetHead>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 52 }}>
          <TextInput value={naming} onChangeText={setNaming} autoFocus returnKeyType="done" onSubmitEditing={rename} maxLength={200}
            accessibilityLabel="The thread's name"
            style={[{ flex: 1, height: 40, paddingHorizontal: 10, borderWidth: 1, borderRadius: corner.small, borderColor: color.line, backgroundColor: color.field, fontFamily: font.regular, fontSize: 15, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          <Pressable disabled={!ready} onPress={rename} accessibilityRole="button" hitSlop={8}
            style={{ height: 32, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderRadius: corner.small, borderColor: color.lineStrong, opacity: ready ? 1 : 0.45 }}>
            <T style={{ fontSize: 13, fontFamily: font.medium }}>Save</T>
          </Pressable>
        </View>
      </TypingSheet>
    );
  }
  return (
    <TypingSheet open={open} close={done}>
      {!closed && <>
      <SheetHead>Later</SheetHead>
      <TimeBox value={text} onChange={(t) => { setText(t); setRefused(false); }} placeholder="Try: 30m, 3h, 8am, tomorrow, next week"
        onSubmit={submit} line={typedLine(text, typed, refused)} onLine={submit} />
      {laterRows(now, { back: laterNow }).map((row) => (
        <SheetRow key={row.label} label={row.label} aside={row.hint} onPress={() => { done(); if (row.now) onBack(); else onLater(row.ts, row.label); }} />
      ))}
      <SheetSep />
      </>}
      {moveToCloud && <SheetRow label="Move to cloud" aside="On your computer now" onPress={() => { done(); onMoveToCloud?.(); }} />}
      {runNow && <SheetRow label="Run now" onPress={() => { done(); onRunNow(); }} />}
      {tryAgain && <SheetRow label="Try again" onPress={act(onTryAgain)} />}
      {restart && <SheetRow label="Restart the agent (it stopped)" onPress={act(onRestart)} />}
      {resume && <SheetRow label="Resume this agent (reopen and carry on)" onPress={act(onResume)} />}
      {reopen && <SheetRow label="Reopen" aside="Back in your inbox" onPress={act(onReopen)} />}
      {priority !== null && <SheetRow label="Priority" aside={priorityLabelOf(priorityIdOf(priority))} onPress={() => setPage('priority')} />}
      {name !== null && <SheetRow label="Rename" onPress={() => { setNaming(name); setPage('rename'); }} />}
      {projects.length > 0 && <SheetRow label="Move to another project" onPress={() => setPage('move')} />}
      {place && <SheetRow label={PLACE_ROW[place].label} aside={PLACE_ROW[place].detail} onPress={act(() => onPlace?.(PLACE_ROW[place].keep))} />}
      {pinned !== null && <SheetRow label={pinned ? 'Unpin thread' : 'Pin thread'} lead={<Pin size={15} />} onPress={() => { done(); onPin(!pinned); }} />}
      {repeats && <SheetRow label="Stop repeating" onPress={act(onEndRepeat)} />}
      {onUnread && <SheetRow label="Mark unread" onPress={() => { done(); onUnread(); }} />}
      {onReport && <SheetRow label="Report this thread" onPress={() => { done(); onReport(); }} />}
      {!closed && <SheetRow label="Close this thread" onPress={() => { done(); onClose(); }} />}
    </TypingSheet>
  );
}

// The big view over one of your own threads or conversations: reads the row's
// ledger for its files and writes comments back to it.
import { useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { TeamContext } from '../team/people';
import type { LedgerLine } from '../thread-history';
import type { ArtifactMark, FileElsewhere, FileMarks, Person, WorkItem } from '../types';
import { ArtifactView, NO_MARKS, type ArtifactOpen } from './ArtifactView';
import { useFileLine } from '../file-numbers';
import { filesInLines, threadFiles } from '../../../shared/artifact-marks.mts';

/** This thread's marks with those from the other copies, every pin numbered in the order it was made. */
export function withElsewhere(own: FileMarks, elsewhere: FileElsewhere[]): FileMarks {
  const theirs = elsewhere.flatMap((e) => e.notes);
  if (!theirs.length && !elsewhere.some((e) => e.approvals.length)) return own;
  const pins = new Map<string, number>();
  const notes = [...own.notes, ...theirs].sort((a, b) => a.ts - b.ts).map((n) => {
    if (n.place.kind !== 'pin' || n.from) return n;
    const k = (pins.get(n.file) ?? 0) + 1;
    pins.set(n.file, k);
    return { ...n, pin: k };
  });
  return { ...own, notes, approvals: [...own.approvals, ...elsewhere.flatMap((e) => e.approvals)] };
}

/** The Files place file to write to when the mark answers another copy's comment, else null for this thread. */
export function markGoesTo(mark: ArtifactMark, elsewhere: FileElsewhere[]): string | null {
  const m = mark as { do: string; on?: unknown };
  if (!['resolve', 'reopen', 'reply'].includes(m.do) || typeof m.on !== 'string') return null;
  return elsewhere.flatMap((e) => e.notes).find((n) => n.id === m.on)?.key ?? null;
}

export function ThreadArtifacts({ item, open, withAgent, onClose, onBeside, onNotice }: {
  item: WorkItem;
  open: ArtifactOpen;
  withAgent: boolean;
  onClose: () => void;
  onBeside?: (path: string) => void;
  onNotice: (words: string) => void;
}) {
  const team = useContext(TeamContext);
  const [lines, setLines] = useState<LedgerLine[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => { void api.itemHistory({ product: item.product, id: item.id }).then((r) => { if (live) setLines(r?.lines ?? []); }); };
    read();
    const off = api.onChanged(read);
    return () => { live = false; off?.(); };
  }, [item.product, item.id]);
  // Each file the thread names, and what was said on its copies elsewhere.
  const copies = useMemo(() => threadFiles(filesInLines(lines)).flatMap((f) => f.versions.map((v) => ({ path: v.path, file: v.id }))), [lines]);
  const [elsewhere, setElsewhere] = useState<FileElsewhere[]>([]);
  const copiesKey = JSON.stringify(copies);
  useEffect(() => {
    let live = true;
    const read = () => {
      if (!copies.length) { setElsewhere([]); return; }
      void api.fileElsewhere({ product: item.product, id: item.id, copies }).then((all) => { if (live) setElsewhere(all); });
    };
    read();
    // A burst of changes asks once.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const offChanged = copies.length ? api.onChanged(() => { if (timer) clearTimeout(timer); timer = setTimeout(read, 1000); }) : null;
    const off = () => { if (timer) clearTimeout(timer); offChanged?.(); };
    return () => { live = false; off?.(); };
  }, [item.product, item.id, copiesKey]);
  const marks = useMemo(() => withElsewhere(item.artifacts ?? NO_MARKS, elsewhere), [item.artifacts, elsewhere]);
  // Every version the files' lines hold, made here or anywhere else, numbered as Files numbers them.
  // Only when this thread says more: asking on every change in the app rebuilt Files each time.
  const numbered = useFileLine(item.product, item.id, lines.length, false);
  const allLines = useMemo(() => (numbered.lines.length ? [...lines, ...numbered.lines as LedgerLine[]] : lines), [lines, numbered]);
  const people: Person[] = team ? [...team.byId.values()].filter((p) => !item.people?.length || item.people.includes(p.id)) : [];
  return <ArtifactView
    product={item.product}
    thread={item.id}
    lines={allLines}
    numbers={numbered.numbers}
    marks={marks}
    me={team?.me ?? null}
    people={people}
    open={open}
    ownerOfRow={item.runner ?? item.createdBy ?? null}
    write={(mark) => {
      const key = markGoesTo(mark, elsewhere);
      return key ? api.filesPlaceMark({ key, mark }) : api.fileMark({ product: item.product, id: item.id, mark });
    }}
    withAgent={withAgent}
    onNewVersion={async (_name, text, path, _id, since) => {
      const out = await api.fileNewVersion({ product: item.product, id: item.id, path, text, since });
      return out.ok ? null : out.error ?? 'That did not save.';
    }}
    onOutside={(src) => { void api.openArtifactExternally({ product: item.product, src }).then((r) => { if (!r.ok) onNotice(r.error || `${src} could not be opened.`); }); }}
    onClose={onClose}
    onBeside={onBeside}
  />;
}

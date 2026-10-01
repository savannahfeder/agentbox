// WHO DOES IT: the composer's engine word, grown to hold people (approved
// 2026-09-30, w-e731ca9376). One menu, the coding agents this Mac offers
// first, then the teammates on a shared project. Built from the same parts as
// EnginePicker (components/EnginePicker.tsx) so it is the same control: the
// prio-menu drawer, the cursor, Escape and the arrow keys.
//
// Agents wear the dashed square a teammate's agent wears in the inbox, so
// every name in the menu starts on one line.
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ENGINE, engineLabel, type Engine } from '../../../shared/engines.mjs';
import { useKeepInWindow } from '../keep-in-window';
import type { Person } from '../types';
import { Face, firstName } from './people';

type Row = { kind: 'agent'; id: string; label: string } | { kind: 'person'; id: string; label: string; person: Person | null; me: boolean };

export function WhoPicker({ engine, person, engines, people, me, onEngine, onPerson, onOpenChange }: {
  engine: string | null;
  person: string | null;
  engines: Engine[];
  people: Person[];
  me: Person | null;
  onEngine: (id: string | null) => void;
  onPerson: (id: string | null) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
  const mates = people.filter((p) => p.id !== me?.id);
  const rows: Row[] = [
    ...engines.map((e) => ({ kind: 'agent' as const, id: e.id, label: e.label })),
    ...mates.map((p) => ({ kind: 'person' as const, id: p.id, label: firstName(p), person: p, me: false })),
    ...(me ? [{ kind: 'person' as const, id: me.id, label: 'Me', person: me, me: true }] : []),
  ];
  const chosen = (r: Row) => (r.kind === 'person' ? r.id === person : !person && r.id === (engine ?? DEFAULT_ENGINE));

  useEffect(() => { onOpenChange?.(open); }, [open]);
  useKeepInWindow(wrap, open);
  useEffect(() => {
    if (!open) return;
    setCursor(Math.max(0, rows.findIndex(chosen)));
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, engine, person]);

  const pick = (r: Row) => {
    if (r.kind === 'agent') { onPerson(null); onEngine(r.id === DEFAULT_ENGINE ? null : r.id); }
    else onPerson(r.id);
    setOpen(false);
  };
  const word = person ? (person === me?.id ? 'I' : firstName(people.find((p) => p.id === person))) : engineLabel(engine);
  const agentCount = engines.length;

  return (
    <span className="compose-word-wrap" ref={wrap}>
      {open && (
        <span className="prio-menu model-menu tm-who-menu" role="listbox" aria-label="Who does it">
          <span className="tm-menu-head">Agents</span>
          {rows.map((r, i) => (
            <span key={`${r.kind}:${r.id}`} style={{ display: 'contents' }}>
              {i === agentCount && <><span className="tm-sep" /><span className="tm-menu-head">People</span></>}
              <button
                type="button"
                role="option"
                aria-selected={chosen(r)}
                className={`prio-menu-row ${i === cursor ? 'cursor' : ''} ${chosen(r) ? 'on' : ''}`}
                onPointerEnter={() => setCursor(i)}
                onClick={() => pick(r)}
              >
                {r.kind === 'agent'
                  ? <span className="tm-av bot">{r.id === 'codex' ? 'Cx' : 'Cc'}</span>
                  : <Face person={r.person} me={r.me} />}
                <span className="prio-menu-label">{r.label}</span>
              </button>
            </span>
          ))}
        </span>
      )}
      <button
        type="button"
        className={`compose-word ${person || engine ? 'set' : ''} ${open ? 'open' : ''}`}
        title="Who does it: a coding agent or a teammate"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open) {
            if (['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
            return;
          }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % rows.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + rows.length) % rows.length); }
          if (e.key === 'Enter') { e.preventDefault(); if (rows[cursor]) pick(rows[cursor]); }
        }}
      >{word}</button>
    </span>
  );
}

// THE DUE DAY, for a task given to a person: today, tomorrow, the rest of this
// week by name, next Monday, or none. A calendar day, never a time.
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dueChoices(now = new Date()): { key: string | null; label: string }[] {
  const out: { key: string | null; label: string }[] = [{ key: null, label: 'No due day' }];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    out.push({ key: dayKey(d), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'long' }) });
  }
  return out;
}

export function DuePicker({ value, onChange, onOpenChange }: { value: string | null; onChange: (key: string | null) => void; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const choices = dueChoices();
  useEffect(() => { onOpenChange?.(open); }, [open]);
  useKeepInWindow(wrap, open);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const label = choices.find((c) => c.key === value)?.label;
  return (
    <span className="compose-word-wrap" ref={wrap}>
      {open && (
        <span className="prio-menu model-menu" role="listbox" aria-label="Due day">
          {choices.map((c) => (
            <button key={c.key ?? 'none'} type="button" role="option" aria-selected={c.key === value}
              className={`prio-menu-row ${c.key === value ? 'on cursor' : ''}`}
              onClick={() => { onChange(c.key); setOpen(false); }}>
              <span className="prio-menu-label">{c.label}</span>
            </button>
          ))}
        </span>
      )}
      <button type="button" className={`compose-word ${value ? 'set' : ''} ${open ? 'open' : ''}`} title="When it is due"
        onClick={() => setOpen((o) => !o)}>{value ? `Due ${label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : label}` : 'No due day'}</button>
    </span>
  );
}

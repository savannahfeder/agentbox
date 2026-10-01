// A THREAD'S SUMMARY: its state and the button that opens it in the top bar,
// the panel beside the conversation, and the card a teammate reads instead.
//
// Approved 2026-10-01 (w-e731ca9376, rounds 7 and 9). Every thread has one: its
// properties, then three short lines (problem, progress, solution) that the
// agent keeps current and the person can edit in place. There is no Edit
// button. Clicking a line makes it a text box, and it saves as she types,
// because a summary she has to remember to save is one that goes stale.
//
// The data was already there (shared/thread-cards.mjs reads the state and the
// summary, main/store.mjs threadEdit writes an edit); this file only draws it.
// The rules that decide words (how long ago, who wrote last, which threads may
// be linked) are in ./summary-rules.ts, where the tests read them.
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Person, ThreadCard, ThreadEditPatch, WorkItem } from '../types';
import { api } from '../api';
import { summaryOf, threadState } from '../../../shared/thread-cards.mjs';
import { PriorityIcon } from '../components/Priority';
import { PRIORITIES, priorityIdOf, priorityLabelOf, priorityValueOf, type PriorityId } from '../priority';
import { Face, TeamContext, firstName, type TeamView } from '../team/people';
import {
  STATE_WORD, SUMMARY_FIELDS, SUMMARY_OPEN_KEY, UNSEEN_THREAD, agoWords, lastEdit, linkCandidates, linkedThreads,
  ownerName, readSummaryOpen, stateGlyph, type StateGlyph, type SummaryField,
} from './summary-rules';
import './summary.css';

/* ------------------------------------------------------------------ pieces */

function Glyph({ kind }: { kind: StateGlyph }) {
  return <span className={`ts-st ts-st-${kind}`} aria-hidden="true" />;
}

function PanelIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M14.5 4.5v15" /></svg>;
}

// Waiting is on you unless a person other than you holds it. The word is the
// same either way; only the mark differs (summary-rules.ts stateGlyph).
const waitsOnYou = (item: Pick<WorkItem, 'assignee'>, me: string | null) =>
  !item.assignee || item.assignee === 'agent' || item.assignee === me;

/* ------------------------------------------------------------- open, closed */

/** Open or closed, remembered across threads and restarts. Open the first time. */
export function useSummaryOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(() => (typeof localStorage === 'undefined' ? true : readSummaryOpen(localStorage)));
  useEffect(() => {
    try { localStorage.setItem(SUMMARY_OPEN_KEY, open ? '1' : '0'); } catch { /* a window with no storage keeps it for the session */ }
  }, [open]);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return [open, toggle];
}

/**
 * S opens and closes the summary, as the button says, whenever the cursor is
 * not in somewhere she types.
 *
 * IT LISTENS FIRST AND STOPS THE KEY THERE. The window's own handler (App.tsx)
 * reads S inside an open task as "put this off", and both firing on one press
 * would open the schedule picker over the panel she just asked for. The
 * approved top bar prints S on the Summary button, so on a thread that has a
 * summary the key is the summary's. Snoozing is still on S in the list, and in
 * the palette everywhere. A thread with no summary (a message, a running
 * agent) does not call this, so S there still snoozes.
 */
export function useSummaryShortcut(onToggle: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 's' && e.key !== 'S') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) onToggle();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onToggle, enabled]);
}

/* ----------------------------------------------------------------- top bar */

/** "● Waiting" and the square Summary button with its key, for the top bar. */
export function ThreadStatusAndToggle({ item, open, onToggle }: { item: WorkItem; open: boolean; onToggle: () => void }) {
  const team = useContext(TeamContext);
  const state = threadState(item);
  return (
    <span className="ts-top">
      <span className="ts-status"><Glyph kind={stateGlyph(state, waitsOnYou(item, team?.me ?? null))} />{STATE_WORD[state]}</span>
      <button
        type="button"
        className={`ts-sumbtn${open ? ' on' : ''}`}
        aria-pressed={open}
        title={open ? 'Hide the summary · S' : 'Show the summary · S'}
        onClick={onToggle}
      >
        <PanelIcon />Summary<kbd>S</kbd>
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------- panel */

type Field = SummaryField | 'priority' | 'visibility' | 'blockedBy' | 'blocks';
type Pending = Partial<Record<Field, { value: unknown; ts: number }>>;
type Menu = null | 'priority' | 'blockedBy' | 'blocks';

const NOT_WRITTEN = 'Not written yet';
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The summary beside the conversation: properties, linked threads, a hairline,
 * then problem, progress and solution, each editable in place.
 *
 * `items` is every thread this window holds, for the titles of linked threads
 * and for the menu that adds one. `team` is null on a Mac nobody has signed
 * into, where every thread is yours.
 */
export function SummaryPanel({ item, items, team, onOpenItem }: {
  item: WorkItem;
  items: WorkItem[];
  team: TeamView | null;
  onOpenItem?: (item: WorkItem) => void;
}) {
  const me = team?.me ?? null;

  // AN EDIT SHE HAS MADE AND THE ROW HAS NOT CAUGHT UP WITH. The window holds
  // the snapshot it last polled, so without this a word she changed would snap
  // back for up to ten seconds. Each one is stamped, and the row wins again as
  // soon as it carries a later write than hers, which is how an agent's update
  // after her edit still shows.
  const [pending, setPending] = useState<Pending>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPending({}); setError(null); }, [item.product, item.id]);
  useEffect(() => {
    setPending((p) => {
      let changed = false;
      const next: Pending = { ...p };
      for (const k of Object.keys(p) as Field[]) {
        const wroteAt = item.wrote?.[k]?.ts ?? 0;
        if (same(item[k as keyof WorkItem], p[k]!.value) || wroteAt >= p[k]!.ts) { delete next[k]; changed = true; }
      }
      return changed ? next : p;
    });
  }, [item]);
  const valueOf = <T,>(k: Field): T => (pending[k] ? pending[k]!.value : item[k as keyof WorkItem]) as T;

  const save = useCallback(async (patch: ThreadEditPatch) => {
    const ts = Date.now();
    setPending((p) => ({ ...p, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, { value: v, ts }])) }));
    setError(null);
    const out = await api.threadEdit(item.product, item.id, patch);
    if (!out.ok) {
      setPending((p) => { const next = { ...p }; for (const k of Object.keys(patch)) delete next[k as Field]; return next; });
      setError('That change did not save.');
    }
  }, [item.product, item.id]);

  // One small menu at a time, closed by a press anywhere outside it.
  const [menu, setMenu] = useState<Menu>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setMenu(null); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc, true); };
  }, [menu]);
  useEffect(() => { setMenu(null); }, [item.product, item.id]);
  const holdMenu = (which: Menu) => (el: HTMLElement | null) => { if (menu === which) menuRef.current = el; };

  const state = threadState(item);
  const prio: PriorityId = priorityIdOf(valueOf<number>('priority'));
  const visibility = valueOf<string | undefined>('visibility') === 'private' ? 'private' : 'team';
  const owner = ownerName(item, me, team?.byId ?? new Map());
  const ownerPerson = owner === 'You' ? null : team?.byId.get(item.createdBy ?? '') ?? null;

  const direct = useMemo(() => new Set([...(team?.products.values() ?? [])].filter((p) => p.team?.direct === true).map((p) => p.slug)), [team]);

  /* --- the three lines ------------------------------------------------- */
  const stood = summaryOf({ ...item, ...Object.fromEntries(SUMMARY_FIELDS.filter((f) => pending[f]).map((f) => [f, pending[f]!.value])) });
  const written = (f: SummaryField) => typeof valueOf<unknown>(f) === 'string';

  const [editing, setEditing] = useState<SummaryField | null>(null);
  const [draft, setDraft] = useState('');
  const started = useRef('');
  const lastSent = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setEditing(null); }, [item.product, item.id]);

  const begin = (f: SummaryField) => {
    const shown = stood[f];
    started.current = shown;
    lastSent.current = shown;
    cancelled.current = false;
    setDraft(shown);
    setEditing(f);
  };
  const send = (f: SummaryField, text: string) => {
    if (text === lastSent.current) return;
    lastSent.current = text;
    void save({ [f]: text });
  };
  const type = (text: string) => {
    setDraft(text);
    if (timer.current) clearTimeout(timer.current);
    const f = editing!;
    // 600ms after the last key, so a sentence is one write and not forty.
    timer.current = setTimeout(() => send(f, text), 600);
  };
  const finish = () => {
    if (!editing) return;
    if (timer.current) clearTimeout(timer.current);
    if (!cancelled.current) send(editing, draft);
    setEditing(null);
  };
  const onBoxKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Escape here closes the box and goes no further: the window's own Escape
    // would close the thread she is in the middle of writing on. It KEEPS what
    // was typed, as the box has been saving all along: a persona pressed
    // Escape, lost the words, and was still told "Edited by you".
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
    else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); finish(); }
  };
  // The box grows with what is in it, so a line being edited is the same shape
  // as the line it replaced.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);
  useEffect(() => {
    const el = box.current;
    if (!el || !editing) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const byLine = editing
    ? 'You are editing · saves as you type'
    : error ?? lastEdit(item, {
      me,
      names: new Map([...(team?.byId.values() ?? [])].map((p) => [p.id, p.name])),
      pending: Object.fromEntries(SUMMARY_FIELDS.filter((f) => pending[f]).map((f) => [f, pending[f]!.ts])),
    });

  /* --- the links ------------------------------------------------------- */
  const linkRow = (field: 'blockedBy' | 'blocks', label: string) => {
    const ids = (valueOf<string[] | undefined>(field) ?? []).filter((x) => typeof x === 'string');
    const links = linkedThreads(ids, items, item.product);
    const offer = menu === field ? linkCandidates(item, items, ids, { me, direct }) : [];
    return (
      <div className="ts-link-row" ref={holdMenu(field)}>
        <span className="ts-label">{label}</span>
        <span className="ts-link-values">
          {links.map((l) => (
            <span key={l.id} className="ts-link">
              <button
                type="button"
                className={`ts-link-title${l.known ? '' : ' dim'}`}
                disabled={!l.known || !onOpenItem}
                title={l.known ? `Open ${l.title}` : UNSEEN_THREAD}
                onClick={() => { const found = items.find((i) => i.id === l.id); if (found) onOpenItem?.(found); }}
              >{l.title}</button>
              <button type="button" className="ts-x" aria-label={`Remove ${l.title}`} title="Remove" onClick={() => void save({ [field]: ids.filter((x) => x !== l.id) })}>
                <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" /></svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            className={links.length ? 'ts-add' : 'ts-add ts-add-empty'}
            aria-label={`Link a thread to ${label.toLowerCase()}`}
            aria-expanded={menu === field}
            onClick={() => setMenu(menu === field ? null : field)}
          >
            {links.length
              ? <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M6 2v8M2 6h8" /></svg>
              : 'None'}
          </button>
        </span>
        {menu === field && (
          <span className="prio-menu ts-menu ts-menu-wide" role="listbox" aria-label={label}>
            <span className="ts-menu-head">Your open threads</span>
            {offer.length === 0 && <span className="ts-menu-none">No other open threads</span>}
            {offer.map((o) => (
              <button key={`${o.product}:${o.id}`} type="button" role="option" className="prio-menu-row" onClick={() => { setMenu(null); void save({ [field]: [...ids, o.id] }); }}>
                <span className="prio-menu-label">{o.label || o.title}</span>
              </button>
            ))}
          </span>
        )}
      </div>
    );
  };

  return (
    <aside className="ts-panel" aria-label="Summary">
      <div className="ts-props">
        <span className="ts-label">Status</span>
        <span className="ts-value"><Glyph kind={stateGlyph(state, waitsOnYou(item, me))} />{STATE_WORD[state]}</span>
        <span className="ts-label">Owner</span>
        <span className="ts-value">{ownerPerson && <Face person={ownerPerson} />}{owner}</span>
        <span className="ts-label">Project</span>
        <span className="ts-value">{item.productName}</span>
        <span className="ts-label">Priority</span>
        <span className="ts-value ts-menu-anchor" ref={holdMenu('priority')}>
          {/* The app's own bars (components/Priority.tsx), Urgent as a fourth
              bar and never an exclamation mark. */}
          <button type="button" className="ts-prop-btn" aria-haspopup="listbox" aria-expanded={menu === 'priority'} onClick={() => setMenu(menu === 'priority' ? null : 'priority')}>
            <PriorityIcon id={prio} />{priorityLabelOf(prio)}
          </button>
          {menu === 'priority' && (
            <span className="prio-menu ts-menu" role="listbox" aria-label="Priority">
              {PRIORITIES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={p.id === prio}
                  className={`prio-menu-row${p.id === prio ? ' on' : ''}`}
                  onClick={() => { setMenu(null); if (p.id !== prio) void save({ priority: priorityValueOf(p.id) }); }}
                >
                  <PriorityIcon id={p.id} />
                  <span className="prio-menu-label">{p.label}</span>
                </button>
              ))}
            </span>
          )}
        </span>
        <span className="ts-label">Visible to</span>
        <span className="ts-value">
          <button
            type="button"
            className="ts-prop-btn"
            title={visibility === 'team' ? 'Make it private' : 'Show it to the team'}
            onClick={() => void save({ visibility: visibility === 'team' ? 'private' : 'team' })}
          >{visibility === 'team' ? 'Team' : 'Private'}</button>
        </span>
      </div>

      <div className="ts-h">Linked</div>
      <div className="ts-links">
        {linkRow('blockedBy', 'Blocked by')}
        {linkRow('blocks', 'Blocks')}
      </div>

      <div className="ts-rule" />

      {SUMMARY_FIELDS.map((f) => (
        <div className="ts-sec" key={f}>
          <div className="ts-h">{f === 'problem' ? 'Problem' : f === 'progress' ? 'Progress' : 'Solution'}</div>
          {editing === f ? (
            <textarea
              ref={box}
              className="ts-edit"
              rows={1}
              value={draft}
              aria-label={f}
              onChange={(e) => type(e.target.value)}
              onBlur={finish}
              onKeyDown={onBoxKey}
            />
          ) : (
            <p
              className={`ts-line${written(f) && stood[f] ? '' : ' dim'}`}
              role="button"
              tabIndex={0}
              title="Click to edit"
              onClick={() => begin(f)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); begin(f); } }}
            >{stood[f] || NOT_WRITTEN}</p>
          )}
        </div>
      ))}
      {byLine && <div className={`ts-by${error && !editing ? ' ts-by-error' : ''}`}>{byLine}</div>}
    </aside>
  );
}

/* ----------------------------------------------------------- a teammate's */

/**
 * A teammate's thread, as one card made of exactly the summary's fields and
 * nothing new: state, priority, project and who can see it; progress as the
 * lead sentence; problem and solution side by side; blocked by and blocks side
 * by side; whose it is. A private thread's card says only that it is private,
 * whose it is and its state, because the Mac that published it sent nothing
 * else (shared/thread-cards.mjs cardsFor).
 */
export function TeammateCard({ card, person, now = Date.now() }: { card: ThreadCard; person: Person | null; now?: number }) {
  const word = STATE_WORD[card.state];
  const glyph = <Glyph kind={stateGlyph(card.state, false)} />;
  const name = person?.name || 'Someone';
  if (!card.visible) {
    return (
      <article className="ts-ticket ts-ticket-private">
        <p className="ts-tk-lead dim">Private thread</p>
        <div className="ts-tk-foot"><Face person={person} /><b>{name}</b><span className="ts-tk-state">{glyph}{word}</span></div>
      </article>
    );
  }
  const pid = Number.isFinite(card.priority) ? priorityIdOf(card.priority) : null;
  const titles = (links: ThreadCard['blockedBy']) => (links.length
    ? <p>{links.map((l, i) => <span key={l.id} className={l.title ? '' : 'dim'}>{i > 0 && ', '}{l.title ?? UNSEEN_THREAD}</span>)}</p>
    : <p className="dim">Nothing</p>);
  const prose = (text: string | null) => (text ? <p>{text}</p> : <p className="dim">{NOT_WRITTEN}</p>);
  return (
    <article className="ts-ticket">
      <div className="ts-tk-top">
        {/* Who it waits on, which a persona could not tell from "Waiting". */}
        <span>{glyph}{card.state === 'waiting' ? `Waiting on ${name.split(/\s+/)[0]}` : word}</span>
        {pid && <><i className="ts-sep" /><span><PriorityIcon id={pid} />{priorityLabelOf(pid)}</span></>}
        {card.project && <><i className="ts-sep" /><span>{card.project}</span></>}
        <i className="ts-sep" /><span>Visible to the team</span>
      </div>
      <p className={`ts-tk-lead${card.progress || card.solution ? '' : ' dim'}`}>{card.progress || card.solution || NOT_WRITTEN}</p>
      <div className="ts-tk-grid">
        <div><span className="ts-h">Problem</span>{prose(card.problem)}</div>
        <div><span className="ts-h">Solution</span>{prose(card.solution)}</div>
      </div>
      <div className="ts-tk-grid ts-tk-next">
        <div><span className="ts-h">Blocked by</span>{titles(card.blockedBy)}</div>
        <div><span className="ts-h">Blocks</span>{titles(card.blocks)}</div>
      </div>
      <div className="ts-tk-foot"><Face person={person} /><b>{name}</b><span>· kept up to date by the agent · {agoWords(card.updatedAt, now)}</span></div>
    </article>
  );
}

/** "Message Maya": their face and the words, in a square button, for the top bar over their card. */
export function MessagePerson({ person, onMessage }: { person: Person | null; onMessage: () => void }) {
  return (
    <button type="button" className="ts-msgbtn" onClick={onMessage}>
      <Face person={person} />Message {firstName(person)}
    </button>
  );
}

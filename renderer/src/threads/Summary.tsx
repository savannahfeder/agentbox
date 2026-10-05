// A THREAD'S SUMMARY: its state, the panel beside the conversation, the rail
// it folds to when closed, and the card a teammate reads instead.
//
// Approved 2026-10-01. Every thread has one: its name and three short lines
// (problem, progress, solution) that the agent keeps current and the person
// can edit in place, then its properties at the foot (since w-922f66bb06,
// 2026-10-04; they came first before that). There is no Edit
// button. Clicking a line makes it a text box, and it saves as she types,
// because a summary she has to remember to save is one that goes stale.
//
// The data was already there (shared/thread-cards.mjs reads the state and the
// summary, main/store.mjs threadEdit writes an edit); this file only draws it.
// The rules that decide words (how long ago, when it was updated, which threads
// may be linked) are in ./summary-rules.ts, and the bar's crumb in
// ./crumb-rules.ts, where the tests read them.
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Person, ThreadCard, ThreadEditPatch, WorkItem } from '../types';
import { api } from '../api';
import { summaryOf, threadState } from '../../../shared/thread-cards.mjs';
import { PriorityIcon } from '../components/Priority';
import { PRIORITIES, priorityIdOf, priorityLabelOf, priorityValueOf, type PriorityId } from '../priority';
import { Face, TeamContext, firstName, type TeamView } from '../team/people';
import {
  STATE_WORD, stateWordOf, SUMMARY_FIELDS, SUMMARY_OPEN_KEY, UNSEEN_THREAD, agoWords, updatedWord, ownerName,
  readSummaryOpen, stateGlyph, statusChoices, type StateGlyph, type SummaryField,
} from './summary-rules';
import { crumbName } from './crumb-rules';
import { VISIBILITY_WORD, chosenNames, whoSees, type Seen } from './summary-rules';
import { findPeople, teammates } from './composer-rules';
import { shownToPeople } from '../../../shared/thread-cards.mjs';
import { rowTitle } from '../list-rules';
import { SharedMark } from './Pages';
import './summary.css';

/* ------------------------------------------------------------------ pieces */

function Glyph({ kind }: { kind: StateGlyph }) {
  return <span className={`ts-st ts-st-${kind}`} aria-hidden="true" />;
}

// THE MARKS A CHANGEABLE FIELD SHOWS UNDER THE POINTER: a caret on a field
// that opens a menu, a pencil on a line that turns into a text box. Both are
// invisible at rest (summary.css), and a field she cannot change has neither.
function Caret() {
  return <svg className="ts-caret" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" /></svg>;
}
function Pen() {
  return <svg className="ts-pen" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 20 1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z" /></svg>;
}
// One person, for "Only you", beside the team's two (Pages.tsx SharedMark).
function OnlyYouMark() {
  return <svg className="ts-who" width="13" height="12" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="7" r="4" /><path d="M4.5 20.5c.8-4 3.8-6.3 7.5-6.3s6.7 2.3 7.5 6.3" /></svg>;
}

// The panel's mark: a window with its right side drawn off. Filled on that side
// while the summary is open, so the icon that closes it says what it closes.
function PanelIcon({ open = false }: { open?: boolean }) {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />{open && <rect x="14.5" y="4.5" width="6" height="15" fill="currentColor" stroke="none" opacity=".5" />}<path d="M14.5 4.5v15" /></svg>;
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
 * S opens and closes the summary, as the button's hover plate says, whenever
 * the cursor is not in somewhere she types.
 *
 * IT LISTENS FIRST AND STOPS THE KEY THERE, and that is now belt and braces
 * rather than the thing holding the app together.
 *
 * S MEANT TWO THINGS FOR A DAY AND IT IS ONE AGAIN (2026-10-01). The window's
 * own handler (App.tsx) read S as "put this off", in the list and inside an
 * open task, while the approved top bar printed S on the Summary button; both
 * fired on one press and this hook winning was the only reason the schedule
 * picker did not open over the panel somebody had just asked for. An office
 * manager testing the app met both meanings inside a minute. So scheduling
 * moved to L everywhere (the list, an open thread, the hint plate, ⌘K, the
 * shortcuts page and the walk) and S is the summary's alone, on every screen
 * in the app. This hook still listens in the capture phase, because a hook
 * that stops its own key is the right shape whatever else is bound.
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

/**
 * "● Running": the thread's mark and its word, FIRST ON THE LINE UNDER THE
 * TITLE (w-e731ca9376, 2026-10-01). It stood at the right of the bar beside the
 * Summary button until she asked for it here, in place of the live word
 * "Working" that said the same thing in other letters. Byline.tsx draws it
 * where it was handed it, in the line's own uppercase mono.
 */
export function ThreadStateMark({ item }: { item: WorkItem }) {
  const team = useContext(TeamContext);
  const state = threadState(item);
  return <span className="ts-lead"><Glyph kind={stateGlyph(state, waitsOnYou(item, team?.me ?? null))} />{stateWordOf(item, state)}</span>;
}

/* -------------------------------------------------------------------- rail */

/**
 * THE SUMMARY, FOLDED (w-a3482b8c2c, 2026-10-02). While the summary is closed
 * it leaves this 48 point strip on the right instead of vanishing, and the
 * whole strip is the button that opens it again. It replaced the Summary
 * button in the corner, which drew more attention than anything else in the
 * thread and, open by default, wore a grey wash that read as a hover.
 *
 * It holds the thread's marks top to bottom: the panel's icon, the state,
 * the priority, and on a team the owner's face and who sees it. Each says its
 * word on hover. With a collapsed sidebar it mirrors the sidebar's own strip
 * of icons on the left. S still opens it, as the hover plate says.
 */
export function SummaryRail({ item, team, onOpen }: { item: WorkItem; team: TeamView | null; onOpen: () => void }) {
  const me = team?.me ?? null;
  const state = threadState(item);
  const prio = priorityIdOf(item.priority);
  const byId = team?.byId ?? new Map<string, Person>();
  const owner = ownerName(item, me, byId);
  const ownerPerson = owner === 'You' ? (me ? byId.get(me) ?? null : null) : byId.get(item.createdBy ?? '') ?? null;
  const visibility = whoSees(item, team?.state.since ?? null, team?.products.get(item.product));
  return (
    // The hint is on the icon, not the strip: a plate is placed off the box of
    // what wears it, and a strip the pane's full height left it no room below,
    // so it rose over the corner menu.
    <button type="button" className="ts-rail" aria-label="Show the summary" title="Show the summary" onClick={onOpen}>
      <span className="ts-rail-ic" data-hint="summary" data-hint-align="right"><PanelIcon /></span>
      <span className="ts-rail-mark" title={STATE_WORD[state]}><Glyph kind={stateGlyph(state, waitsOnYou(item, me))} /></span>
      <span className="ts-rail-mark" title={`${priorityLabelOf(prio)} priority`}><PriorityIcon id={prio} /></span>
      {team && <span className="ts-rail-mark" title={`Owner: ${owner}`}><Face person={ownerPerson} me={owner === 'You'} /></span>}
      {team && (
        <span className="ts-rail-mark" title={`Visible to ${VISIBILITY_WORD[visibility]}`}>
          {visibility === 'private' ? <OnlyYouMark /> : <SharedMark className="ts-who" />}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------- panel */

type Field = SummaryField | 'priority' | 'visibility' | 'visibleTo';
type Pending = Partial<Record<Field, { value: unknown; ts: number }>>;
type Menu = null | 'status' | 'priority' | 'visibility';

const NOT_WRITTEN = 'Not written yet';
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The summary beside the conversation: the properties, a hairline, then the
 * thread's name over problem, progress and solution, each line editable in
 * place. The panel draws no "Blocked by" or "Blocks" (w-b38e975e2c); the row
 * still carries them and a teammate's card still shows them.
 *
 * `team` is null on a Mac nobody has signed into, where every thread is yours.
 */
export function SummaryPanel({ item, team, onFinish, onClose }: {
  item: WorkItem;
  team: TeamView | null;
  /** FOLD IT BACK TO THE RAIL, from the icon at the top of the summary (w-a3482b8c2c). */
  onClose?: () => void;
  /**
   * CLOSE THIS THREAD, or null where there is nothing to close. The Status row
   * calls it; it is the same `markDone` E runs and the same one the three-dot
   * menu's Mark done row takes, handed down from Focus. Null leaves the Status
   * row a plain word. */
  onFinish?: (() => void) | null;
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
  // The second page of the Visible to menu: which people see it.
  const [pickPeople, setPickPeople] = useState(false);
  const [find, setFind] = useState('');
  useEffect(() => { if (menu !== 'visibility') { setPickPeople(false); setFind(''); } }, [menu]);
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
  // A thread from before you joined is yours until you share it, whatever it
  // says on disk (summary-rules.ts `whoSees`, the Team page's own rule).
  const visibility = whoSees({
    ...item,
    visibility: valueOf<'team' | 'people' | 'private' | undefined>('visibility'),
    visibleTo: valueOf<string[] | undefined>('visibleTo') ?? item.visibleTo,
  }, team?.state.since ?? null, team?.products.get(item.product));
  // WHO IS ON THE LIST, when it is shared with chosen people (w-41ff964775).
  // Read off the row the same way, so her tick shows before the store's next
  // snapshot comes back with it.
  const chosen = shownToPeople({
    visibility: valueOf<'team' | 'people' | 'private' | undefined>('visibility') ?? item.visibility,
    visibleTo: valueOf<string[] | undefined>('visibleTo') ?? item.visibleTo,
  });
  const others = useMemo(() => teammates(team?.state.people ?? [], team?.me ?? null), [team]);
  const owner = ownerName(item, me, team?.byId ?? new Map());
  const ownerPerson = owner === 'You' ? null : team?.byId.get(item.createdBy ?? '') ?? null;

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
    // was typed, as the box has been saving all along. Escape used to throw the
    // words away while the line still read "Edited by you".
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

  // What is happening to the words right now, said under them only while it
  // is true: an edit in progress, or one that did not save. When they were
  // last written is the Updated row at the foot (w-922f66bb06).
  const note = editing ? 'You are editing · saves as you type' : error;
  const updated = updatedWord(item, {
    me,
    pending: Object.fromEntries(SUMMARY_FIELDS.filter((f) => pending[f]).map((f) => [f, pending[f]!.ts])),
  });

  return (
    <aside className="ts-panel" aria-label="Summary">
      {/* THE WAY BACK TO THE RAIL sits on the summary itself, beside its
          title, rather than in the corner of the window (w-a3482b8c2c). */}
      {onClose && (
        <button type="button" className="ts-close" data-hint="summary" data-hint-align="right" title="Hide the summary" onClick={onClose}>
          <PanelIcon open />
        </button>
      )}
      {/* THE WORDS FIRST, THE PROPERTIES AT THE FOOT (w-922f66bb06). She reads
          the name, the problem, the progress and the solution far more often
          than the status or the owner, so those four open the panel and the
          properties sit under a hairline at its bottom edge, level with the
          reply box, in the same place however long the words run. Before
          this the name sat under five rows of properties (w-b38e975e2c had
          already put the name directly over its three lines). */}
      {/* WHICH THREAD THIS IS, by the name its row shows (list-rules.ts
          rowTitle). */}
      <h2 className="ts-title">{rowTitle(item)}</h2>
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
            >{stood[f] || NOT_WRITTEN}<Pen /></p>
          )}
        </div>
      ))}
      {note && <div className={`ts-by${error && !editing ? ' ts-by-error' : ''}`}>{note}</div>}

      <div className="ts-foot">
      <div className="ts-rule" />
      {/* CHANGEABLE LOOKS CHANGEABLE (2026-10-01). Status, Priority and Visible
          to are buttons that wash, point and show a caret under the pointer;
          Owner and Project are plain words with no hover at all. Owner stays
          read-only because people here get messages, never tasks. Project
          does because nothing in the store moves a thread from one project's
          ledger to another, and a menu here would have to invent that.

          PRIORITY IS SECOND, after Status, and Updated is last (w-922f66bb06). */}
      <div className="ts-props">
        <span className="ts-label">Status</span>
        {/* AND STATUS JOINED THEM THE SAME DAY: marking a thread done from a
            dropdown on its Status row is more natural than the Mark Done
            button in the corner. `statusChoices` in ./summary-rules.ts says what it offers
            and why that is one row; a finished thread has nothing to set, so
            the word stands on its own exactly as it did before.

            IT RUNS `markDone`, THE SAME FUNCTION E AND THE MENU RUN. It is
            handed in from Focus as `onFinish`, which is the prop the three-dot
            menu's Mark done row already takes, so the undo, the toast and the
            move to the next thread are one behaviour and not three. Writing
            `status: 'done'` through `save` here would have been a second way
            to close a thread with its own rules. */}
        {onFinish && statusChoices(state).length ? (
          <span className="ts-value ts-menu-anchor" ref={holdMenu('status')}>
            <button type="button" className="ts-prop-btn" aria-haspopup="listbox" aria-expanded={menu === 'status'} title="Change the status" onClick={() => setMenu(menu === 'status' ? null : 'status')}>
              <Glyph kind={stateGlyph(state, waitsOnYou(item, me))} />{stateWordOf(item, state)}<Caret />
            </button>
            {menu === 'status' && (
              <span className="prio-menu ts-menu" role="listbox" aria-label="Status">
                {statusChoices(state).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="prio-menu-row"
                    onClick={() => { setMenu(null); onFinish(); }}
                  >
                    <Glyph kind={c.glyph} />
                    <span className="prio-menu-label">{c.word}</span>
                  </button>
                ))}
              </span>
            )}
          </span>
        ) : (
          <span className="ts-value"><Glyph kind={stateGlyph(state, waitsOnYou(item, me))} />{stateWordOf(item, state)}</span>
        )}
        <span className="ts-label">Priority</span>
        <span className="ts-value ts-menu-anchor" ref={holdMenu('priority')}>
          {/* The app's own bars (components/Priority.tsx), Urgent as a fourth
              bar and never an exclamation mark. */}
          <button type="button" className="ts-prop-btn" aria-haspopup="listbox" aria-expanded={menu === 'priority'} title="Change the priority" onClick={() => setMenu(menu === 'priority' ? null : 'priority')}>
            <PriorityIcon id={prio} />{priorityLabelOf(prio)}<Caret />
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
        <span className="ts-label">Owner</span>
        <span className="ts-value">{ownerPerson && <Face person={ownerPerson} />}{owner}</span>
        <span className="ts-label">Project</span>
        <span className="ts-value">{item.productName}</span>
        <span className="ts-label">Visible to</span>
        <span className="ts-value ts-menu-anchor" ref={holdMenu('visibility')}>
          {/* All three choices in a menu, like Priority, so she sees what she
              is choosing between before anything is written. The marks are the
              inbox's: two people for the team or a few of them, one for you.
              Chosen people names them in the button, so the panel answers
              "visible to whom" without opening anything. */}
          <button type="button" className="ts-prop-btn" aria-haspopup="listbox" aria-expanded={menu === 'visibility'} title="Change who sees it" onClick={() => { setPickPeople(false); setMenu(menu === 'visibility' ? null : 'visibility'); }}>
            {visibility === 'private' ? <OnlyYouMark /> : <SharedMark className="ts-who" />}
            {visibility === 'people' ? chosenNames(chosen, team?.byId ?? new Map()) : VISIBILITY_WORD[visibility]}<Caret />
          </button>
          {menu === 'visibility' && (
            <span className="prio-menu ts-menu" role="listbox" aria-label="Visible to">
              {/* CHOSEN PEOPLE OPENS THE PEOPLE LIST (w-41ff964775), the same
                  one the composer uses, and a tick writes the list at once.
                  Taking the last person off leaves nobody who can see it,
                  which is Private: one stored word per thing that is true. */}
              {!pickPeople ? (['team', 'people', 'private'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="option"
                  aria-selected={v === visibility}
                  className={`prio-menu-row${v === visibility ? ' on' : ''}`}
                  onClick={() => {
                    if (v === 'people') { setPickPeople(true); return; }
                    setMenu(null);
                    if (v !== visibility) void save({ visibility: v });
                  }}
                >
                  {v === 'private' ? <OnlyYouMark /> : <SharedMark className="ts-who" />}
                  <span className="prio-menu-label">{VISIBILITY_WORD[v]}</span>
                </button>
              )) : (<>
                <button type="button" className="prio-menu-row" onClick={() => setPickPeople(false)}>
                  <span className="prio-menu-label">‹ Visible to</span>
                </button>
                {others.length > 6 && (
                  <input className="ts-find" placeholder="Find a person" value={find} onChange={(e) => setFind(e.target.value)} />
                )}
                {findPeople(others, find).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={chosen.includes(p.id)}
                    className={`prio-menu-row${chosen.includes(p.id) ? ' on' : ''}`}
                    onClick={() => {
                      const next = chosen.includes(p.id) ? chosen.filter((id) => id !== p.id) : [...chosen, p.id];
                      void save(next.length ? { visibility: 'people', visibleTo: next } : { visibility: 'private', visibleTo: [] });
                    }}
                  >
                    <Face person={p} />
                    <span className="prio-menu-label">{p.name}</span>
                  </button>
                ))}
                {!others.length && <span className="ts-menu-none">Nobody else is on the team yet.</span>}
              </>)}
            </span>
          )}
        </span>
        {/* WHEN THE THREE LINES WERE LAST WRITTEN, and only when: "Just now",
            "6 min ago" (summary-rules.ts updatedWord). No row before they
            have ever been written. */}
        {updated && <>
          <span className="ts-label">Updated</span>
          <span className="ts-value">{updated}</span>
        </>}
      </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------- the crumb */

/**
 * THE THREAD'S BAR WHILE THE SUMMARY IS OPEN (w-922f66bb06): one line in the
 * app's mono capitals, the tab the thread was opened from, a slash, and the
 * thread's name, "NEEDS YOU / FIRST FRAME WHITE BACKGROUND FIX". The whole
 * line is the way back, so it is one button carrying the back hint and Esc.
 * The full bar (title, project, engine, last moved) said again what the
 * summary beside it says; folded, the summary gives that bar back (Focus.tsx).
 *
 * The name keeps whole words up to 59 letters (crumb-rules.ts) and the whole
 * of it is one hover away.
 */
export function ThreadCrumb({ from, name, onBack }: { from: string; name: string; onBack: () => void }) {
  return (
    <button type="button" className="back-esc thread-crumb" data-hint="back" onClick={onBack} aria-label={`Back to ${from} (esc)`} title={name}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
      <span className="thread-crumb-from">{from}</span>
      <span className="thread-crumb-sep" aria-hidden="true">/</span>
      <span className="thread-crumb-name">{crumbName(name)}</span>
    </button>
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

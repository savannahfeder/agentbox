// The list. Day groups, then a message: its title, and under it the summary
// that has to be enough to decide on without opening anything. At the right
// end, on the title's line, the things that are not the message: priority, the
// product, and when (or that an agent is on it, or that one stopped).

import type { ReactNode } from 'react';
import type { Product, RepeatRule, RunningSession, ThreadCard, View, WorkItem } from '../types';
import { ago, dayLabel, previewText, stamp } from '../format';
import { REST_HEADING, URGENT_HEADING, clickIntent, rowKeys, rowSummary, rowTitle, walkRowKeys } from '../list-rules';
import { isUrgentRow } from '../interrupt';
// THE SAME PREDICATE THE PANE USES, not a second copy of the rule. The row and
// the pane disagreeing about one fact on one screen is what this import fixes.
import { cameBackEmpty } from '../live-line';
import { agentAtWork, engineWordFor } from '../byline';
import { DEFAULT_ENGINE } from '../../../shared/engines.mjs';
import { isTroubleRow, TROUBLE_ID } from '../trouble-row';
import { isUpdateRow, UPDATE_ID } from '../update-row';
import { IMPORT_KEYS, JUST_IMPORTED_WORD, NOT_IMPORTED_HEADING, NOT_IMPORTED_KEYS, isImportRow, isNotImportedRow, justImported, type ImportChoice } from '../import-row';
import { splitHits } from '../search';
import { isCleanRun, nextRunAt } from '../../../shared/repeats.mjs';
import { TeamRowEnd, type TeamView } from '../team/people';
import { RowCells, TableHead, ThreadCells } from '../threads/Pages';
import type { MixedRow } from '../threads/people-rules';
import { heldByAPerson } from '../../../shared/team-rules.mjs';

/**
 * THE AGENT A ROW WITH NOTHING RUNNING WOULD RUN ON.
 *
 * It never drew there once.
 *
 * EVERY ROW IS NAMED, CHOSEN AGAINST A MEASUREMENT OF WHAT THAT COSTS. On a
 * real store almost every row names nothing and so reads the workspace agent,
 * so the approved picture is a screen of rows reading the identical words
 * "Claude Code". The alternative -- name only the rows that are NOT on
 * the workspace agent -- was drawn beside it and turned down; its copy is in
 * decisions.md under 2026-09-21. It is not a switch, and there is nothing here
 * to flip: the rule on this slot is that a row with no word must not become the
 * mark for Claude Code.
 *
 * A CODEX CONVERSATION IS CODEX'S WHATEVER WOULD RUN HERE, the same rule
 * `bylineFacts` follows. Nothing spawns on an imported thread; the conversation
 * happened in Codex and that is the fact the slot is for. The first cut of this
 * round missed it and drew nothing on the only Codex rows in a real inbox,
 * which are imports.
 */
function agentRest(
  { engineChoice, engines, item }:
  { engineChoice?: boolean; engines?: { workspace: string; byItem: Record<string, string> }; item: WorkItem },
): string | null {
  if (!engineChoice || !engines) return null;
  // No coding agent is named on a task given to a person (the team version):
  // none is on it until they hand it to one.
  if (heldByAPerson(item)) return null;
  const codexRow = (item.labels ?? []).some((l) => l === 'codex' || l === 'codex-import' || l === 'not-imported');
  const engine = codexRow ? 'codex' : (engines.byItem?.[item.id] ?? engines.workspace ?? DEFAULT_ENGINE);
  return engineWordFor({ engineChoice, engine });
}

// THE MATCH IS TONE, NOT COLOUR.), so a matched word cannot wear a chip or a
// wash. It is drawn at full text strength inside a line that is dim, which is a
// difference the eye finds instantly and which adds nothing to the list's
// vocabulary. When nothing is being searched this renders the plain string.
function Hits({ text, terms, phrase }: { text: string; terms?: string[]; phrase?: string }) {
  if (!terms?.length) return <>{text}</>;
  return (
    <>
      {splitHits(text, terms, phrase).map((run, i) => (
        run.hit ? <b className="hit" key={i}>{run.text}</b> : <span key={i}>{run.text}</span>
      ))}
    </>
  );
}

// What a repeating task's row says, which is the two things she opened this tab
// for: when it runs next, and how the last one went. Pure, so the wording is
// pinned by a test rather than read off a screenshot.
export function repeatRow(rule: RepeatRule, last: WorkItem | null, now = Date.now()): { when: string; last: string } {
  const next = nextRunAt(rule, now);
  const when = next
    ? `${new Date(next).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ${dayLabel(next, now).toLowerCase()}`
    : 'not scheduled';
  if (!last) return { when, last: 'not run yet' };
  if (last.status === 'open' || last.status === 'claimed') return { when, last: `running, started ${ago(last.createdAt, now)}` };
  if (isCleanRun(last)) return { when, last: `last run ${stamp(last.updatedAt, now)}, clean` };
  // Anything that is not explicitly clean is something she should look at, and
  // the row says so in the same words the inbox would.
  return { when, last: `last run ${stamp(last.updatedAt, now)}, ${previewText(last.result) || 'needs a look'}` };
}

// The day groups, and the key each one is drawn under. KEYED BY THE FIRST ROW
// IN THE GROUP, NOT BY THE LABEL: this list is ordered by what matters most,
// not by when, so "Today" can be the answer twice with a "Yesterday" between
// them, and two siblings under one key is a list React reconciles by position.
// It did exactly that on 2026-08-14, matching a new tab's groups onto the old
// tab's and leaving the previous view's rows on screen. An id is unique and it
// is the same id next render, so the group keeps its scroll instead of
// remounting the way an ordinal key would.
export function dayGroups(
  items: WorkItem[],
  label: (item: WorkItem, index: number) => string,
): Array<{ key: string; label: string; items: Array<{ item: WorkItem; index: number }> }> {
  const groups: Array<{ key: string; label: string; items: Array<{ item: WorkItem; index: number }> }> = [];
  items.forEach((item, index) => {
    const text = label(item, index);
    const last = groups[groups.length - 1];
    if (!last || last.label !== text) groups.push({ key: item.id, label: text, items: [] });
    groups[groups.length - 1].items.push({ item, index });
  });
  return groups;
}

export function List({ items, view, keyView, hoveredId, selected, seen, running, engineChoice, engines, stalled, queued, silent, paused, multiSel, snoozes, repeats, allItems, terms, phrase, summaries, ranked, emptyText, walk, onSelect, onOpen, onOpenRepeat, onToggle, onRange, onHover, onAnswerImport, team = null, table = false, products = [], mixed = null, personCell, onOpenCard }: {
  items: WorkItem[];
  view: View;
  // WHICH VIEW'S KEYS THE ROW HINT PRINTS, which is not always the view this
  // list is drawn as. Search results are grouped and stamped like the inbox
  // whatever tab she opened search from, but the key handler is still on the
  // tab underneath, so `view` would have the hint promising R on a closed row.
  keyView?: string;
  // The row under the pointer, which is the row R and E act on. It lives in
  // App because the handler needs it too. It is set the INSTANT the pointer
  // arrives, and that is deliberate: only the drawing waits.
  hoveredId?: string | null;
  selected: number;
  seen: Set<string>;
  running: RunningSession[];
  /**
   * WHETHER THIS MAC HAS TWO CODING AGENTS TO TELL APART. False on almost every
   * Mac, and then the row is byte-identical to the one that shipped before
   * this: the rule is that the majority should not notice this feature at all.
   * `Supervisor#engineChoices`, off the snapshot, so the list cannot come to a
   * different answer than the byline does. */
  engineChoice?: boolean;
  /**
   * WHICH AGENT EACH RESTING ROW WOULD RUN ON. `snapshot.engines`, whole:
   * `byItem` names only the rows that DIFFER from `workspace`, so the read is
   * `byItem[id] ?? workspace` and the map is a handful of rows long even on
   * a large store. A live session still beats both, because what is running beats
   * what would run (`agentAtWork`). */
  engines?: { workspace: string; byItem: Record<string, string> };
  stalled?: string[];
  queued?: string[];
  // A RUN ENDED ON THIS ROW AND WROTE NOTHING DOWN, keyed by id. The half of
  // it that matters most is that this is visible in the inbox without opening
  // anything. Not `stalled`, which is a worker that died and
  // is drawn red. This one ended perfectly cleanly and simply said nothing, and
  // until now it was indistinguishable from a row nobody had got to yet, which
  // is exactly what an engineer using Agentbox reported.
  silent?: Record<string, { runs: number; endedAt: number; until: number }>;
  // SPAWNING IS OFF, which is a fact about the row and not about the app: a
  // task under a pause is not queued, not working and not stopped, and until
  // this arrived the row simply printed its last-touched time and said nothing.
  // The pane at the foot of the conversation says the same word.
  paused?: boolean;
  multiSel: Set<string>;
  snoozes?: Record<string, number>;
  repeats?: RepeatRule[];
  // Every item, not just this view's: a rule's last run is finished or running,
  // so it is never in the Scheduled list beside it.
  allItems?: WorkItem[];
  // SEARCH, and both of these are absent at rest so the list is byte-identical
  // to what it draws today. `terms` lights the matched words; `summaries` is
  // the sentence each row matched ON, keyed by id, which replaces the row's
  // ordinary summary so a result says why it is in the list.
  terms?: string[];
  // The typed words as one string, so "how to work" lights as one run instead
  // of three lit words with two dim gaps between them.
  phrase?: string;
  summaries?: Map<string, string>;
  // These rows are in match order, not in time order, so the day labels come
  // off and nothing goes up in their place. Set only while she has typed
  // something; an open-but-empty search field is still every task newest first,
  // which is her ordinary reading order and keeps its ordinary day labels.
  ranked?: boolean;
  emptyText?: string;
  onSelect: (index: number) => void;
  onOpen: (item: WorkItem) => void;
  onOpenRepeat?: (rule: RepeatRule) => void;
  onToggle: (index: number) => void;
  onRange: (index: number) => void;
  /**
   * WHAT THE WALK LEAVES OF THE ROW HINTS: the key the beat on screen asks for
   * and the rows that key is right for, or null when no walk is on and every
   * row says exactly what it always said. See `walkRowKeys`: a row in the walk
   * may promise the beat's own key and nothing else, because the walk swallows
   * everything else and a hint for a swallowed key is a promise the app then
   * breaks. */
  walk?: { key: string | null; rows: string[] } | null;
  onHover?: (id: string | null) => void;
  // THE YES OR NO ON A CODEX CONVERSATION'S ROW, and the Import on one she
  // declined. A click on the keycap sends the same word the key does.
  onAnswerImport?: (item: WorkItem, choice: ImportChoice) => void;
  // THE TEAM (renderer/src/team/people.tsx). Null unless someone is signed in,
  // and then the row end is exactly the single-person app's.
  /** The inbox as a table (the team version, approved 2026-10-01): thread, project, priority, updated. */
  table?: boolean;
  products?: Product[];
  team?: TeamView | null;
  /** WITH A TEAMMATE ON THE PAGE (w-05ff3d1438): your rows and theirs in one
   *  table, in this order. Yours are the rows above, with every key they had;
   *  theirs open their card. Null is the page as it always was. */
  mixed?: MixedRow[] | null;
  /** The Person cell, for your rows (personId = you) and for theirs. */
  personCell?: (personId: string | null) => ReactNode;
  onOpenCard?: (card: ThreadCard) => void;
}) {
  const rules = view === 'snoozed' ? (repeats ?? []) : [];
  // The keys the rows in THIS list offer, drawn on the row under the pointer.
  // One list, one set: they are a property of the view, not of the message.
  // EXCEPT WHILE THE WALK IS ON, when they are also a property of the row,
  // because the walk answers most of them itself and draws the ring somewhere
  // else. `walkRowKeys` is the whole of that and it changes nothing when no
  // walk is up.
  const all = rowKeys(keyView ?? view, multiSel.size > 0);
  // AND A KEY DRAWN ON A ROW HAS TO DO SOMETHING. The row that says nothing is
  // running has nobody to reply to: there is no session on the other end of it
  // and no ledger it lives in, so R would open a box that goes nowhere. It
  // keeps E, which really does close it, and offers nothing else. The row that
  // says a new version is ready is the same on both counts. A CODEX
  // CONVERSATION'S ROW HAS NO HOVER HINT: its Y and N are drawn on the row all
  // the time as buttons, and a hint swapping in over them at the moment the
  // pointer arrives would take the buttons away exactly when she is about to
  // press one.
  const keysFor = (id: string) => (isImportRow(items.find((i) => i.id === id)) ? [] : walkRowKeys(
    id === TROUBLE_ID || id === UPDATE_ID ? all.filter((k) => k.key !== 'R') : all,
    walk ?? null,
    id,
  ));
  // NO EMPTY PAGE ANYWHERE IN THE APP.A view with nothing in it draws the
  // background and nothing else. Two sentences died here: "Nothing here." on
  // the inbox, Scheduled and Closed, and "Nothing running. Compose (C) to
  // start something." on In progress. Neither is coming back; C is on the
  // toolbar, in the palette and on the idle page, so the hint was the only
  // thing the second one carried and it was not carrying it alone.
  //
  // `emptyText` survives because search is the one case that is NOT an empty
  // page: something was typed and the app has to say what it matched.
  if (items.length === 0 && rules.length === 0 && !mixed?.length) {
    return emptyText ? <div className="empty">{emptyText}</div> : null;
  }

  // The scheduled view is about WHEN things come back, so its groups and its
  // time column run on that moment, not the item's last activity. `runAt` is
  // the durable one and lives in the ledger; the snoozes map is the old
  // localStorage deferral, still read so nothing already deferred pops back.
  const deferredUntil = (item: WorkItem) => Math.max(item.runAt ?? 0, snoozes?.[item.id] ?? 0);
  const wakeTs = (item: WorkItem) => deferredUntil(item) || item.updatedAt;
  const wake = (ts: number) => new Date(ts).toLocaleString(undefined, {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
  });

  // THE ROW SAYING NOTHING IS RUNNING WEARS NO DAY LABEL. It is about right now
  // and it is drawn first; a "Today" over it would be the list filing a fact
  // about the app under a date, and in the approved picture there is
  // nothing above it at all. An empty label makes its own group, which is all
  // `dayGroups` needs, and the labels resume on the group beneath it.
  //
  // A RANKED LIST WEARS NO HEADING AT ALL either. Day labels are wrong there,
  // the order is how well each row matched and a day label torn by that order
  // is a repeating stack of "Today" with a "Yesterday" between. Headings of our
  // own are worse: this shipped for one day saying "Best matches" over the top
  // of the list and "Also mentions these words" over the rest, and both were
  // rejected: no sections, and no text nobody asked for. The ranking already puts
  // the best answers first. Saying so above them is text nobody asked for,
  // so the empty label draws nothing and the rows run unbroken.
  //
  // AND NOW NO LIST BUT SCHEDULED WEARS A DATE HEADING. The inbox read
  // Yesterday, Last 7 days, Today, Last 7 days, torn by the same
  // most-important-first order, and because the hairline is drawn only between
  // two rows under one heading, every heading holding a single row left that
  // row unruled. Of a line over each heading, the heading on the line, and
  // no headings, the pick was one list with no date headings. Every row still
  // prints its own date at
  // the right end, so nothing about when is lost. Scheduled keeps "Returns
  // Tuesday" because there the heading is the schedule and the list runs in
  // that order.
  //
  // AND THE ONE HEADING THE INBOX DOES WEAR IS "Urgent". Picked out of five
  // treatments: urgent items are lifted to the top under their own label.
  //
  // THIS DOES NOT REOPEN THE DATE HEADINGS ABOVE. What was turned down there
  // was a stack of Today and Yesterday torn by an order that is not
  // chronological, and every row still printed its own date at the right end so
  // nothing about when was lost. This heading says something no row says twice,
  // it appears at most once, and it is the only one in the list, which is most
  // of why it works: App.tsx has already lifted these rows to the front, so the
  // group is contiguous.
  //
  // AND THE ROWS AFTER IT ARE LABELLED, NOT BARE. Left with no heading, they
  // made "Urgent" read as a title over the whole inbox: one urgent row over
  // nineteen ordinary ones looked like twenty urgent ones (w-ad426c52ae). Only
  // rows AFTER the block get it: the alarm and import rows App.tsx lifts above
  // the urgent block stay unheaded, or the list would read heading, Urgent,
  // heading.
  const firstUrgent = view === 'inbox' && !ranked ? items.findIndex(isUrgentRow) : -1;
  const groups = dayGroups(items, (item, index) => {
    // CLOSED NAMES THE CONVERSATIONS DECLINED FOR NOW, so the way back is
    // a heading she can see rather than a row she has to remember.
    if (view === 'done' && isNotImportedRow(item)) return NOT_IMPORTED_HEADING;
    if (view === 'snoozed' && !isTroubleRow(item) && !ranked) return `Returns ${dayLabel(wakeTs(item))}`;
    // ONLY WHERE THEY WERE LIFTED. A ranked search is in match order and an
    // urgent row is wherever it matched, so a heading there would name a group
    // that is not a group.
    if (firstUrgent >= 0 && index >= firstUrgent) return isUrgentRow(item) ? URGENT_HEADING : REST_HEADING;
    return '';
  });
  // YOURS AND YOUR TEAMMATES' IN ONE RUN OF ROWS (w-05ff3d1438). The table
  // wears no headings, so one unlabelled group holds the merged order; each of
  // your rows keeps the index the keyboard selects it by.
  type Entry = { item: WorkItem; index: number; card?: undefined } | { card: ThreadCard; item?: undefined; index?: undefined };
  const at = new Map(items.map((item, index) => [item.id, index]));
  const shown: { key: string; label: string; items: Entry[] }[] = table && mixed
    ? [{ key: 'mixed', label: '', items: mixed.flatMap((r): Entry[] => (r.card ? [{ card: r.card }] : at.has(r.item.id) ? [{ item: r.item, index: at.get(r.item.id)! }] : [])) }]
    : groups;
  const withPerson = table && !!mixed;

  return (
    <div className={`list${table ? ' th-table' : ''}`}>
      {table && <TableHead person={withPerson} />}
      {/* Repeating tasks sit above the deferred rows, in the tab that already
          holds work with a moment attached. They are RULES, not items, so they
          arrive on their own list and no inbox rule has an opinion about them. */}
      {rules.length > 0 && (
        <div>
          <div className="day-label">Repeating</div>
          {rules.map((rule) => {
            const pool = allItems ?? items;
            const last = rule.lastOccurrence ? pool.find((i) => i.id === rule.lastOccurrence) ?? null : null;
            const row = repeatRow(rule, last);
            return (
              <div key={rule.id} className="row" onClick={() => onOpenRepeat?.(rule)}>
                <span className="mark" />
                <div className="row-main">
                  <div className="subject">{rule.title}</div>
                  <div className="preview">{row.last}</div>
                </div>
                {/* A rule keeps its chip where a message lost one: "daily" is
                    not a category the summary is about to restate, it is the
                    one fact that makes this row a rule and not a message. */}
                <div className="row-end">
                  <span className="chip">daily</span>
                  <span className="product">{rule.productName}</span>
                  <span className="time">{row.when}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {shown.map((group) => (
        <div key={group.key}>
          {/* An empty label is a ranked list or the row that says nothing is
              running, and it draws NOTHING: an empty div here still spends the
              day label's whole height and leaves a band of nothing above the
              first result. */}
          {group.label && !table && <div className="day-label">{group.label}</div>}
          {group.items.map((entry) => {
            // A TEAMMATE'S THREAD: their card, opened on a click. No select
            // box and no keys, because nothing on this Mac can act on it.
            if (entry.card) {
              const c = entry.card;
              return (
                <div key={`card/${c.personId}/${c.threadId}`} className="row th-their-row" onClick={() => onOpenCard?.(c)}>
                  <span className="mark" aria-hidden="true" />
                  <RowCells title={c.title ?? 'Private thread'} where={c.project ?? ''} person={personCell?.(c.personId)}
                    priority={c.priority} updatedAt={c.updatedAt} now={Date.now()} />
                </div>
              );
            }
            const { item, index } = entry;
            const session = running.find((r) => r.itemId === item.id);
            const checked = multiSel.has(item.id);
            // THE TWO ROWS THIS APP MAKES ITSELF. Neither is in a ledger, so
            // neither can honestly offer a select box, and both wear the rule
            // at the left edge instead.
            const made = isTroubleRow(item) || isUpdateRow(item);
            return (
              <div
                key={item.id}
                /*
                 * The first run points its coaching ring at the row it made
                   itself, by id, rather than at whatever is drawn first
                   (w-0b60195a14, 2026-08-21). Nothing else reads this. */
                data-item-id={item.id}
                /*
                 * THE HOVER HINT, AND ONLY IN THE INBOX. `hint-plate.ts` says
                   ↵ Open task, E Mark done, S Schedule for later, which are the
                   inbox's keys; Scheduled and Closed hand the same two letters
                   different jobs (`rowKeys`), so a plate drawn there would
                   promise the wrong thing. AND NOT ON A CONVERSATION ASKING TO
                   COME IN: its Y and N are already drawn on the row, which is
                   the rule for the whole set, that a component already
                   showing its key gets no plate. */
                {...(view === 'inbox' && !isImportRow(item)
                  ? { 'data-hint': 'row', 'data-hint-text': '.subject' }
                  : {})}
                className={`row ${made ? 'trouble-row ' : ''}${index === selected ? 'selected' : ''} ${checked ? 'checked' : ''}`}
                /*
                 * ON MOUSE MOVE, NOT ON MOUSE ENTER. A pointer parked over the
                   list while she walks it with J and K would otherwise claim
                   every row it happened to be resting on: the keyboard clears
                   the hover in App, and only a pointer that actually moves
                   takes it back. */
                onMouseMove={() => { if (hoveredId !== item.id) onHover?.(item.id); }}
                onMouseLeave={() => { if (hoveredId === item.id) onHover?.(null); }}
                onClick={(e) => {
                  const intent = clickIntent('row', { shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey });
                  if (intent === 'range') { onRange(index); return; }
                  if (intent === 'toggle') { onToggle(index); return; }
                  onSelect(index); onOpen(item);
                }}
              >
                {/* THE ONE THING THAT IS NOT A MESSAGE STANDS IN THE MESSAGE'S OWN
                   SELECT-BOX STRIP: a rule at the row's left edge, in the app's own faint
                   ink, beginning where the subject begins and ending where the preview
                   ends.
                 */}
                {made ? <span className="trouble-rule" aria-hidden="true" /> : (
                /*
                 * The select box owns its own hit area, and shows nothing
                   until the pointer is on IT: hovering a message leaves the
                   list exactly as it reads at rest. It has this slot to
                   itself now: the unread dot that used to share it is gone
                   along with the whole unread distinction. */
                <button
                  type="button"
                  className={`mark${checked ? ' on' : ''}`}
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`${checked ? 'Deselect' : 'Select'} ${rowTitle(item)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (clickIntent('box', { shift: e.shiftKey }) === 'range') onRange(index);
                    else onToggle(index);
                  }}
                >
                  <span className="box" aria-hidden="true" />
                </button>
                )}
                {/* THE ROW IS A TITLE AND A SUMMARY, AND NOTHING ELSE ON THE LEFT.
                   Every chip this row used to wear (ask, review, bug,
                   proposed, answered, blocked, and the returning-from-snooze zzz) named a
                   category that the summary beneath was about to say in words anyway, and a
                   column of them is a second alphabet to learn before you can read the
                   first.
                 */}
                {table && !(walk && keysFor(item.id).length) && !isImportRow(item) ? (
                  // THE TABLE ROW (the team version): the same row, its select
                  // box and its keys, with the approved columns instead of a
                  // title over a summary.
                  <ThreadCells item={item} product={products.find((p) => p.slug === item.product)} now={Date.now()}
                    person={withPerson ? personCell?.(team?.me ?? null) : undefined} />
                ) : <>
                <div className="row-main">
                  {/* THE WRITTEN NAME, WHERE THERE IS ONE. `rowTitle` prefers
                      the label a session wrote over the first line of what she
                      dictated, and falls back to the title on every row that has
                      no label, which is every older row until a session
                      writes one (w-dae464cf30). The opened task's header uses
                      the same name since 2026-09-28 (w-b8c8958a12). */}
                  <div className="subject"><Hits text={rowTitle(item)} terms={terms} phrase={phrase} /></div>
                  {/* On anything finished the RESULT is the news; the body is the
                      ask she already knows she made. Her own directives are often
                      a single line with no body at all, so keying this on the
                      Done view alone left the row with nothing to say.

                      While searching, that is replaced by the sentence the query
                      was actually found in: a result list whose summaries are the
                      rows' usual openings is a list of rows that look unrelated
                      to what was typed. */}
                  <div className="preview">
                    <Hits text={summaries?.get(item.id) ?? rowSummary(item, view)} terms={terms} phrase={phrase} />
                  </div>
                </div>
                {/* Everything that is not the message itself lives at the right end, on the
                   title's line: priority, then the product, then when.
                 */}
                <div className="row-end">
                  {/* THE WALK'S OWN KEY, AND ONLY THE WALK'S.

                      This slot used to swap the product and the time for two
                      keycaps whenever the pointer rested on the row. In use,
                      swapping the row's own contents after a pause felt slow,
                      and something appearing around the row reads better than
                      the row itself changing. Hovering now draws a
                      plate beside the row (hint-plate.ts) and the row itself
                      never changes.

                      What is left here is the first-run walk, which is a
                      different thing wearing the same drawing: the walk asks for
                      ONE key on the rows of the beat it is on, while it holds
                      the keyboard, and it is not a hover hint at all.
                      `walkRowKeys` returns everything when no walk is up, so the
                      `walk &&` guard is what keeps this out of the ordinary
                      list.
                   */}
                  {/* A CODEX CONVERSATION ASKING TO COME IN WEARS ITS YES AND
                      NO HERE ALL THE TIME (w-319289046e, 2026-09-14). The same
                      keycaps as the hints below, but at rest and clickable,
                      because the question is the row and the two answers are
                      the whole of what she does with it. The baseline look was
                      picked out of five. */}
                  {/* AND IT IS A LABEL, NOT A BUTTON, WHICH IS A DECISION AND
                      NOT AN OVERSIGHT (2026-10-01). It was made a button for an
                      hour, so that the walk's two row beats could say "or click
                      Done on the row" to the people who do not use shortcuts.
                      It was taken back the same day: the tutorial must never
                      teach a click the real app does not have.
                      This chip is drawn ONLY while the walk is on, by the
                      `walk &&` guard right here, so a clickable one teaches a
                      control that disappears the moment the tutorial ends. The
                      app has no click route to close a thread from the list at
                      all; until it does, this says the key and nothing else,
                      and so do the two cards (`coach` in onboarding.ts). */}
                  {walk && keysFor(item.id).length ? (
                    <span className="row-keys">
                      {keysFor(item.id).map((k) => (
                        <span className="row-key" key={k.key}>
                          <kbd>{k.key}</kbd><span className="row-key-word">{k.word}</span>
                        </span>
                      ))}
                    </span>
                  ) : isImportRow(item) ? (
                    <span className="row-keys import-keys">
                      {IMPORT_KEYS.map((k) => (
                        <button type="button" className="row-key" key={k.key} title={k.word}
                          onClick={(e) => { e.stopPropagation(); onAnswerImport?.(item, k.key === '1' ? 'yes' : 'no'); }}>
                          <kbd>{k.key}</kbd><span className="row-key-word">{k.word}</span>
                        </button>
                      ))}
                    </span>
                  ) : (
                  <>
                  {/* NOT ON AN AGENT ROW. Priority is something she sets on her
                      own work; the number an agent row carries exists only to
                      sort it into the list, and drawing it as "urgent" claims
                      the user set it.

                      AND URGENT DRAWS NOTHING HERE AT ALL (w-bba20a03f5).
                      Picked out of five marks, none of which was an
                      exclamation mark: option A, nothing at all. The
                      heading urgent rows now lift under says the word once,
                      and a mark on each row underneath says it again on every
                      line, which is the same word three times on one screen.

                      IT IS STILL ASKED, THOUGH, AND THAT IS NOT REDUNDANT: the
                      test has to come FIRST, or an urgent row falls through to
                      the `>= 7` branch below and wears the three bars that mean
                      high priority. Urgent showing less ink than high is the
                      one wrong answer available here.

                      WHAT THIS COSTS, known before it was chosen: the
                      heading exists in the inbox only, so an urgent row in
                      Closed, In progress or a search result now carries no mark
                      at all. That trade was taken knowingly. The alternative
                      turned down, the word Urgent in small capitals, is in
                      decisions.md if it ever needs to come back.

                      The predicate is `isUrgent` in shared/rank.mjs, reached
                      through interrupt.ts, and not the inline `item.agent ?
                      null : priority >= 9` that used to be on this line: that
                      one unmarked the user's urgent row the moment a worker claimed
                      it and `item.agent` went truthy. */}
                  {/* THE WAY BACK, on the row itself: a conversation declined
                      for now offers Import from Closed (w-319289046e). */}
                  {view === 'done' && isNotImportedRow(item) ? (
                    <span className="row-keys import-keys import-key">
                      {NOT_IMPORTED_KEYS.map((k) => (
                        <button type="button" className="row-key" key={k.key} title={k.word}
                          onClick={(e) => { e.stopPropagation(); onAnswerImport?.(item, 'yes'); }}>
                          <kbd>{k.key}</kbd><span className="row-key-word">{k.word}</span>
                        </button>
                      ))}
                    </span>
                  ) : null}
                  {isUrgentRow(item)
                    ? null
                    : item.agent ? null
                      : (item.priority ?? 5) >= 7
                        ? <span className="prio-bars p3" title="high priority"><i /><i /><i /></span>
                        : (item.priority ?? 5) <= 2
                          ? <span className="prio-bars p1 low" title="low priority"><i /><i /><i /></span>
                          : null}
                  {/* Which product this is about, read per row rather than
                      scanned down a column: it sits with the timestamp because
                      both answer "where and when did this come from". */}
                  {/* ON A TEAM, a row a teammate sent shows their face and
                      name here instead, a task given to you its due day, and a
                      private project a lock (renderer/src/team/people.tsx). */}
                  {team ? <TeamRowEnd item={item} team={team} /> : <span className="product">{item.productName}</span>}
                  {/* A live session is the fact that matters on the row: "16h"
                      (the item's last write) read as abandonment while an agent
                      was three minutes into the job, and it read as nothing
                      running. A stopped
                      agent is the opposite fact and must be just as loud. This
                      is why the timestamp survived the cull of everything else:
                      it is the only place those two facts are told. */}
                  {/* AND A RUN THAT ENDED SAYING NOTHING IS THE FOURTH FACT
                      THIS CELL TELLS (w-86ee9da2c9). It sits under working and
                      stopped, which are about now, and above queued, which is
                      about a row nothing has touched yet: a row that HAS been
                      looked at and came back empty is the more useful of the
                      two things to say.

                      NOT RED. Red is `stalled`, a worker that died, and it has
                      to keep meaning that or it means nothing (the note above).
                      Nothing went wrong here. A run finished and wrote nothing
                      down, which is worth a word and not an alarm.

                      "Nothing came back" rather than "silent" or "empty run",
                      because the screen has to be
                      understandable to somebody who is not technical. The
                      words say what happened in the order
                      somebody needs it: something ran, it told you nothing. */}
                  {/* AND A CONVERSATION SHE HAS JUST BROUGHT IN SAYS SO, IN THE TIME SLOT
                     (w-d883b38446, 2026-09-18).

                      In words and in this cell rather than as a chip, because
                      the chips on this row were all culled on 2026-08-12 for
                      being a second alphabet to learn, and this cell is already
                      where the row says what state it is in: working, stopped,
                      nothing came back, queued. A timestamp reading "9:41pm" is
                      the one thing it could say here that she cannot act on.

                      It says it for exactly as long as the row is lifted to the
                      top of the inbox, because `justImported` is the same test
                      (import-row.ts): open the row and both go at once.
                   */}
                  {/* WHICH AGENT IS ON IT, on the rows where one really is (w-6246b0c91f).

                     THREE THINGS MAKE IT QUIET ENOUGH TO BE THAT. It is drawn only where
                     the Mac has two agents to tell apart, so the majority of installs are
                     unchanged. And it is `.time` ink, the faint grey the product name and
                     the timestamps wear, sitting BESIDE the loud `.time.working` rather
                     than inside it: the fact that matters on a running row is still that it
                     is running, and this must not compete with it.

                     Naming only the second one would make its ABSENCE the mark and teach
                     her a symbol after all.

                      AND IT FOLLOWS THE WORD "working" RATHER THAN THE SESSION,
                      which is why `justImported` is asked here too. That cell
                      says ONE thing, and on a conversation she has just brought
                      in it says so instead of saying working (w-d883b38446,
                      merged alongside this). A session can be up on such a row,
                      and "Codex · just imported" would name an agent beside a
                      word it has nothing to do with. The name belongs to the
                      run, so it is drawn only where the run is what the cell is
                      talking about.
                   */}
                  {/* AND ON A ROW WITH NOTHING RUNNING TOO, SINCE 2026-09-21. This is the
                     answer for a resting row: the agent it WOULD run on, off the snapshot.

                      EVERY ROW IS NAMED, PICKED AGAINST THE MEASUREMENT OF
                      WHAT IT COSTS. The rule lives in `agentRest` at the top
                      of this file, with the cost and with the arrangement that
                      was turned down.
                   */}
                  {!justImported(item, seen) && !session && agentRest({ engineChoice, engines, item })
                    && <span className="time agent">{agentRest({ engineChoice, engines, item })}</span>}
                  {!justImported(item, seen) && session && agentAtWork({ engineChoice, session })
                    && <span className="time agent">{agentAtWork({ engineChoice, session })}</span>}
                  {justImported(item, seen)
                    ? <span className="time imported">{JUST_IMPORTED_WORD}</span>
                    : session
                    ? <span className="time working">working · {ago(session.startedAt)}</span>
                    : stalled?.includes(item.id)
                      ? <span className="time stalled">stopped · {ago(item.updatedAt)}</span>
                      : cameBackEmpty(item, silent?.[item.id])
                        ? <span className="time quiet" title="An agent ran on this and finished without writing anything back. Send it a message to find out what happened.">nothing came back · {ago(silent![item.id].endedAt || item.updatedAt)}</span>
                        : queued?.includes(item.id)
                          ? <span className="time">queued</span>
                          : paused && view === 'progress'
                            ? <span className="time">paused</span>
                            : <span className="time">{view === 'snoozed' ? wake(wakeTs(item)) : view === 'inbox' ? stamp(item.updatedAt) : ago(item.updatedAt)}</span>}
                  </>
                  )}
                </div>
                </>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

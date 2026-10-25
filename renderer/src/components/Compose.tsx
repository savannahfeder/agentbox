// The new task card. The first line of the message becomes the title
// (../message-split.ts). Tab steps the project, because ⌥arrows are macOS
// word-jump in a text field.
//
// The selected project is held as a slug, never an index into the shown chips:
// revealing hidden projects shifts the chips, so an index lands on another one.
//
// The footer is one sentence on one baseline. Its clickable words are
// inline-block buttons with `font: inherit`, no padding and a text-decoration
// underline, because a border plus padding pushes them off the baseline.
// Hierarchy is colour only, never size, and no word carries an icon. The rule
// is in ../compose-footer.ts.
//
// The supervisor never starts work in a practice project, so the card refuses
// one before sending (../compose-says.ts). Making practice projects runnable is
// not the fix.
//
// The chips in the project menu are the user's running order, and dragging one
// sets it. The palette can only move a project to the top, so this drag is the
// only fine-grained ordering in the app.

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Product, RepeatShape } from '../types';
import { SEND } from '../this-keyboard';
import { TeamContext, firstName } from '../team/people';
import { WhoPicker, DuePicker } from '../team/WhoPicker';
import { isShared } from '../../../shared/team-rules.mjs';
import { collectFiles, fromPaste, persistAttachments, type PendingAttachment } from '../attachments';
import { AttachRow } from './AttachRow';
import { PriorityPicker, priorityIdOf, priorityValueOf, type PriorityId } from './Priority';
import { parseRepeat } from '../format';
import { splitMessage } from '../message-split';
import { WhenPicker, WHEN_NOW, type WhenValue } from './When';
import { sameRule, type RepeatShape as RepeatRuleValue } from '../../../shared/repeats.mjs';
import { landingIndex } from '../../../shared/rank.mjs';
import { resolveProject, stepProject } from '../compose-project';
import { readComposeDraft, saveComposeDraft, clearComposeDraft } from '../drafts';
import { startingPriority } from '../priority';
import { ModelPicker } from './Model';
import { DEFAULT_MODEL, engineModelPicked, readLastModel, writeLastModel, type ModelChoice } from '../models';
import { effortChoicesFor, effortPicked, readLastEffort, writeLastEffort } from '../effort';
import { EnginePicker } from './EnginePicker';
import { engineThisMacOffers, readLastEngine, writeLastEngine } from '../engines';
import { DEFAULT_ENGINE, ENGINES, type Engine } from '../../../shared/engines.mjs';
import { footerIsOpen, restingClause } from '../compose-footer';
import { practiceRefusal } from '../compose-says';

const LAST_PRODUCT_KEY = 'zero.lastProduct';

// How far the pointer travels before a press becomes a drag. Below this a
// press is still just a click that picks the product.
const DRAG_THRESHOLD_PX = 4;

interface DragState {
  from: number;                       // index in the displayed list
  to: number;                         // insert BEFORE this displayed index; === length means last
  dx: number;
  dy: number;
  caret: { x: number; y: number; h: number } | null;
}

export function Compose({ products, hidden, onSend, onReorder, onHide, onNewProject, selectProject, engineChoices, workspaceEngine, codexModels, codexModelDefault, prefill, onClose }: {
  products: Product[];
  hidden: string[];
  // Returns false when the send did not stand (a refused repeat rule); the card
  // then stays open with its draft. Anything else counts as sent.
  onSend: (p: { product: string; title: string; body?: string; kind: string; priority?: number;
                repeat?: RepeatShape; runAt?: number; model?: string; engine?: string; effort?: string;
                // Team version: a task given to a person, and its due day.
                assignee?: string; due?: string }) => void | boolean | Promise<void | boolean>;
  onReorder: (slugs: string[]) => void;
  onHide: (slug: string, hide: boolean) => void;
  // Door A: opens the new project card from this list. Absent in screenshot fixtures.
  onNewProject?: () => void;
  // A project made while this card was open, which the card then selects.
  selectProject?: string | null;
  // The coding agents this Mac offers, from the snapshot. It comes from main,
  // where the capability gate lives, so the card never offers an engine the
  // supervisor would refuse. One entry draws no engine clause.
  engineChoices?: Engine[];
  workspaceEngine?: string;
  // Codex's models are read off this Mac and arrive through settings. Empty
  // means Codex reported none, and the word falls back to what its config.toml
  // would run.
  codexModels?: ModelChoice[];
  codexModelDefault?: string | null;
  // The first run's example task, typed into the real field so it can be
  // edited (../onboarding.ts).
  prefill?: { title: string; body?: string; product?: string | null };
  onClose: () => void;
}) {
  const hiddenSet = new Set(hidden);
  const [revealed, setRevealed] = useState(false);
  // Hiding affects this picker only. A hidden project still ranks, runs agents
  // and reaches the inbox.
  const shown = revealed ? products : products.filter((p) => !hiddenSet.has(p.slug));
  const hiddenCount = products.length - products.filter((p) => !hiddenSet.has(p.slug)).length;

  const [productSlug, setProductSlug] = useState(() => localStorage.getItem(LAST_PRODUCT_KEY) ?? '');
  // Team version: the person who does the task, on a shared project only. Null
  // means an agent does it.
  const team = useContext(TeamContext);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  // ../compose-project.ts says why this resolves against every project, not only the shown ones.
  const product = resolveProject(products, shown, productSlug);
  // A person can only be given a task in a shared project.
  const sharedHere = !!team && isShared(team.products.get(product?.slug ?? ''));
  const givenTo = sharedHere ? assignee : null;
  const givenName = givenTo ? (givenTo === team?.me ? 'yourself' : firstName(team?.byId.get(givenTo))) : null;
  // The project is remembered when picked, not only when sent. Sending writes it
  // too, because the send may go to the fallback project rather than a clicked one.
  const pick = (slug: string) => {
    setProductSlug(slug);
    localStorage.setItem(LAST_PRODUCT_KEY, slug);
  };
  // The project is not part of the draft (../drafts.ts), so a project made from
  // the chip reaches the open card through this prop.
  useEffect(() => { if (selectProject) pick(selectProject); }, [selectProject]);

  // The card reopens on the saved draft, so Escape, a backdrop click or a reload
  // loses nothing. ../drafts.ts says what is kept and why the project is not.
  const opened = useRef(readComposeDraft());
  const [text, setText] = useState(() => opened.current.text);
  // A new card opens on medium unless a saved draft has its own priority;
  // ../priority.ts says why the last pick is not carried over.
  const [prio, setPrio] = useState<PriorityId | null>(
    () => startingPriority(opened.current.priority),
  );
  const pickPrio = (id: PriorityId) => { setPrio(id); };
  // The engine is remembered like the model, falling back to the workspace
  // agent; null means Claude Code. It is read before the model because model
  // memory is kept per engine. It is clamped to what this Mac offers, because
  // the remembered engine may since have been uninstalled or gated off.
  const engineRows = engineChoices ?? [ENGINES[0]];
  const [engine, setEngine] = useState<string | null>(() => engineThisMacOffers(readLastEngine(undefined, workspaceEngine), engineRows));
  // Read from that engine's own memory. Null means nothing was named, and the
  // clause says what would run.
  const [model, setModel] = useState<string | null>(() => readLastModel(undefined, engine, codexModelDefault ?? null));
  const pickModel = (id: string | null) => { setModel(id); writeLastModel(id, undefined, engine, codexModelDefault ?? null); };
  // Changing the engine restores that engine's own last model and effort. The
  // engines share no model names, and the supervisor refuses a model its
  // engine does not know.
  const pickEngine = (id: string | null) => {
    setEngine(id);
    writeLastEngine(id);
    setModel(readLastModel(undefined, id, codexModelDefault ?? null));
    setEffort(readLastEffort(undefined, id));
  };
  // Effort is remembered per engine; null sends nothing and the engine chooses.
  // What is lit and sent is the memory checked against this model's levels: a
  // Codex level belongs to the model, so a remembered `ultra` on a model that
  // stops at `xhigh` is not sent. The memory is kept for when the model changes back.
  const [effort, setEffort] = useState<string | null>(() => readLastEffort(undefined, engine));
  const pickEffort = (id: string | null) => { setEffort(id); writeLastEffort(id, undefined, engine); };
  const effortRows = effortChoicesFor(engine, model, { codexModels: codexModels ?? [], codexDefault: codexModelDefault ?? null });
  const effortOn = effortPicked(effort, effortRows) ? effort : null;
  // What the card opened with, frozen on the first render. The level and model
  // are remembered across cards, so only a difference from this shows the user
  // changed something. Without it an untouched card opens with the footer showing.
  const openedWith = useRef({ prio, model, engine, effort });
  // Clamp again when the snapshot's engine list changes while the card is open;
  // the snapshot is refetched every few seconds. The model and effort follow the
  // engine as in `pickEngine`, and `openedWith` is rebased so the footer does not
  // open on a card nobody touched.
  useEffect(() => {
    const kept = engineThisMacOffers(engine, engineRows);
    if (kept === engine) return;
    const swapped = readLastModel(undefined, kept, codexModelDefault ?? null);
    const level = readLastEffort(undefined, kept);
    setEngine(kept);
    setModel(swapped);
    setEffort(level);
    openedWith.current = { ...openedWith.current, engine: kept, model: swapped, effort: level };
  }, [engineRows.map((e) => e.id).join(',')]);
  // The footer is quiet at rest. Hover or any open menu opens it, so the line
  // does not collapse under a menu being read. ../compose-footer.ts turns these
  // into the footer's classes.
  const [hovered, setHovered] = useState(false);
  const [prioOpen, setPrioOpen] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>(() => opened.current.attachments);
  // How many images on the card the draft could not save, said at the paste
  // while the user still has them.
  const [dropped, setDropped] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  // The clock: a start time or a repeat rule, never both. The menu sets it, and
  // so does a rule read from the message on every keystroke.
  const [when, setWhen] = useState<WhenValue>(() => {
    const w = opened.current.when;
    return w.runAt || w.repeat ? { runAt: w.runAt, repeat: (w.repeat ?? null) as WhenValue['repeat'] } : WHEN_NOW;
  });
  const repeat = when.repeat;
  const parsed = parseRepeat(text);
  const lastParsed = useRef<RepeatRuleValue | null>(null);
  useEffect(() => {
    const rule = parsed && 'rule' in parsed ? parsed.rule : null;
    if (rule && !sameRule(rule, lastParsed.current)) setWhen({ runAt: 0, repeat: rule });
    // Removing the phrase clears only what the phrase set. A schedule picked
    // from the menu survives edits to the text.
    if (!rule && lastParsed.current && sameRule(repeat, lastParsed.current)) setWhen(WHEN_NOW);
    lastParsed.current = rule;
  }, [parsed && 'rule' in parsed ? parsed.rule.at : null]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // The project word's menu, which holds the chips and their drag.
  const [projOpen, setProjOpen] = useState(false);
  const projWrap = useRef<HTMLSpanElement>(null);
  // Whether the project name is cut, measured rather than guessed, because only
  // a cut name fades. An ellipsis reads as four dots after the period, and
  // cutting at a whole word turns "Name (copy 2)" into a different project.
  // Measured again once fonts load, since the first layout may use the fallback.
  const projWord = useRef<HTMLButtonElement>(null);
  const [projCut, setProjCut] = useState(false);
  const projName = product?.name;
  useLayoutEffect(() => {
    const el = projWord.current;
    if (!el) return;
    const measure = () => setProjCut(el.scrollWidth > el.clientWidth + 0.5);
    measure();
    let live = true;
    void document.fonts?.ready.then(() => { if (live) measure(); });
    return () => { live = false; };
  }, [projName]);

  // The caret goes to the end of any restored text. Focusing a textarea that
  // already has text puts the caret at the start.
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  // The first run's example title types itself at reading speed, then the body
  // arrives whole. The caret follows, so the user can carry on typing.
  const typed = useRef(false);
  useEffect(() => {
    if (!prefill || typed.current) return;
    typed.current = true;
    const full = prefill.title;
    let i = 0;
    const tick = setInterval(() => {
      i += 1;
      setText(full.slice(0, i));
      const t = ref.current;
      if (t) t.setSelectionRange(i, i);
      if (i >= full.length) {
        clearInterval(tick);
        if (prefill.body) setText(`${full}\n\n${prefill.body}`);
      }
    }, 26);
    return () => clearInterval(tick);
  }, [prefill?.title]);
  // Addressed to the project just made, without waiting for the picker's memory.
  useEffect(() => {
    if (prefill?.product) setProductSlug(prefill.product);
  }, [prefill?.product]);
  // Saved on every change, because a reload, crash or quit never runs a close
  // handler. The save reports the images it dropped when storage is full.
  useEffect(() => {
    const stored = saveComposeDraft({
      text, attachments, priority: prio, when: { runAt: when.runAt, repeat: when.repeat }, dropped: 0,
    });
    setDropped(stored.dropped);
  }, [text, attachments, prio, when.runAt, when.repeat]);
  // Pointerdown, not click, so a click on the textarea closes the menu and still
  // places the caret. A drag that starts on a chip is inside the wrap, so it
  // does not close the menu.
  useEffect(() => {
    if (!projOpen) return;
    const away = (e: PointerEvent) => {
      if (!projWrap.current?.contains(e.target as Node)) setProjOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [projOpen]);

  // Why this card may not be sent, if it may not. ../compose-says.ts holds the rule and the words.
  const refusal = practiceRefusal(product, { scripted: !!prefill });

  const send = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !attachments.length) || !product) return;
    // ⌘↵ refuses too, not only the disabled button. The draft stays.
    if (refusal) return;
    // ../message-split.ts owns the title and body split.
    const { title, body: written } = splitMessage(trimmed || `Attached: ${attachments[0]?.name}`);
    const attachedMd = await persistAttachments(product.slug, attachments);
    const body = [written, attachedMd].filter(Boolean).join('\n\n');
    localStorage.setItem(LAST_PRODUCT_KEY, product.slug);
    // Untagged sends medium, not 0, which would sort the user's own task below
    // everything an agent had tagged.
    const stood = await onSend({
      product: product.slug,
      title,
      body: body || undefined,
      kind: 'directive',
      priority: prio ? priorityValueOf(prio) : 5,
      // The caller sends a repeat down a different path, because a repeating
      // task is not a work item.
      ...(repeat ? { repeat } : {}),
      // Sent with the content because main/store.mjs#composeItem writes it in
      // the same write, so the item never exists already running.
      ...(when.runAt && !repeat && !givenTo ? { runAt: when.runAt } : {}),
      // A task given to a person goes to them with its due day, and no agent
      // runs it until they hand it to one.
      ...(givenTo ? { assignee: givenTo, ...(due ? { due } : {}) } : {}),
      // The spawn turns the model into `--model` for Claude Code or
      // `thread/start`'s `model` for Codex. Claude Code always gets one, the
      // default included: this card is the only place the model is asked, and
      // sending nothing let a `--model` flag in zero.config.json win. For Codex,
      // no model means ~/.codex/config.toml decides, so it is sent only when picked.
      ...(engine === 'codex'
        ? (engineModelPicked(engine, model, codexModelDefault ?? null) ? { model: model as string } : {})
        : { model: model ?? DEFAULT_MODEL }),
      // Null is how this card spells Claude Code, so it is sent as the default
      // engine. Dropping it let the row resolve to the workspace default, which
      // may be Codex. `Supervisor#engineOffered` drops a value that carries no news.
      ...(engineRows.length > 1 ? { engine: engine ?? DEFAULT_ENGINE } : {}),
      // Only a level this model takes. The spawn turns it into `--effort` for
      // Claude Code or `turn/start`'s `effort` for Codex.
      ...(effortOn ? { effort: effortOn } : {}),
    });
    // A send that did not stand keeps the draft. App.tsx leaves the card open
    // after a refused repeat rule, and a cleared draft would lose the words on
    // the next Escape.
    if (stood !== false) clearComposeDraft();
  };

  // Dragging a chip reorders the projects. The landing spot is found in reading
  // order, row first and then position in the row, because wrapped rows all
  // span the same x range.
  const startDrag = (index: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const chip = e.currentTarget;
    const row = rowRef.current;
    if (!row) return;
    const chips = [...row.querySelectorAll<HTMLElement>('.compose-product')];
    const rects = chips.map((c) => c.getBoundingClientRect());
    const rowRect = row.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    let to = index;

    chip.setPointerCapture(e.pointerId);

    // Nothing shifts during the drag, so the rects captured above stay true and
    // the insertion point is drawn as a line. Parting a wrapped row would move
    // every row below it.
    const caretFor = (landing: number) => {
      const r = landing < rects.length ? rects[landing] : rects[rects.length - 1];
      const x = (landing < rects.length ? r.left - 3 : r.right + 3) - rowRect.left;
      return { x, y: r.top - rowRect.top, h: r.height };
    };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      moved = true;
      to = landingIndex(rects, ev.clientX, ev.clientY);
      setDrag({ from: index, to, dx, dy, caret: caretFor(to) });
    };

    const onUp = () => {
      chip.removeEventListener('pointermove', onMove);
      chip.removeEventListener('pointerup', onUp);
      chip.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (!moved) {
        const picked = shown[index];
        if (picked) pick(picked.slug);
        setProjOpen(false);
        ref.current?.focus();
        return;
      }
      // `to` indexes the shown list but the full order is saved, so the move is
      // "put it before this project", which leaves hidden projects in place.
      const dragged = shown[index];
      const before = to < shown.length ? shown[to] : null;
      if (dragged && before?.slug !== dragged.slug) {
        const slugs = products.map((p) => p.slug).filter((s) => s !== dragged.slug);
        const at = before ? slugs.indexOf(before.slug) : slugs.length;
        slugs.splice(at < 0 ? slugs.length : at, 0, dragged.slug);
        onReorder(slugs);
      }
      ref.current?.focus();
    };

    chip.addEventListener('pointermove', onMove);
    chip.addEventListener('pointerup', onUp);
    chip.addEventListener('pointercancel', onUp);
  };

  const chips = (
    <span className="proj-menu">
      <span className="proj-head">Which project</span>
      <span className="compose-to" ref={rowRef}>
        {shown.map((p, i) => (
          <button
            key={p.slug}
            className={[
              'compose-product',
              p.slug === product?.slug ? 'active' : '',
              drag?.from === i ? 'dragging' : '',
              hiddenSet.has(p.slug) ? 'is-hidden' : '',
            ].filter(Boolean).join(' ')}
            style={drag?.from === i ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
            onPointerDown={startDrag(i)}
          >
            {/* The grip is what shows a chip can be dragged. */}
            <span className="chip-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
            {p.name}
            <span
              className="chip-hide"
              role="button"
              aria-label={hiddenSet.has(p.slug) ? `Show ${p.name}` : `Hide ${p.name}`}
              title={hiddenSet.has(p.slug) ? 'Show in this list' : 'Hide from this list'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onHide(p.slug, !hiddenSet.has(p.slug)); }}
            >{hiddenSet.has(p.slug) ? '+' : '×'}</span>
          </button>
        ))}
        {hiddenCount > 0 && (
          <button
            className={`compose-reveal ${revealed ? 'on' : ''}`}
            onClick={() => setRevealed((r) => !r)}
          >{revealed ? 'done' : `${hiddenCount} hidden`}</button>
        )}
        {/* Door A: make the project from here. It borrows the dashed "hidden"
            chip, because a dashed outline already means "not one of these". */}
        {onNewProject && (
          <button
            className="compose-reveal np-chip-new"
            onClick={onNewProject}
          >+ New project</button>
        )}
        {drag?.caret && (
          <span
            className="compose-caret"
            style={{ left: drag.caret.x, top: drag.caret.y, height: drag.caret.h }}
          />
        )}
      </span>
    </span>
  );

  const canSend = (!!text.trim() || attachments.length > 0) && !refusal;

  // The footer names the project only when there is a choice, except a practice
  // project, which always names itself because there it decides whether
  // anything runs.
  const hasProjectClause = shown.length > 1 || !!product?.practice;

  // The facts the footer rule needs, in one object so the classes below match the tests.
  const facts = {
    hovered,
    menuOpen: projOpen || prioOpen || whenOpen || modelOpen || engineOpen,
    priorityChanged: prio !== openedWith.current.prio,
    whenSet: !!(when.runAt || when.repeat),
    modelChanged: model !== openedWith.current.model || engine !== openedWith.current.engine,
    effortChanged: effort !== openedWith.current.effort,
    hasProjectClause,
  };

  return (
    <div className="modal-backdrop compose-backdrop" onClick={onClose}>
      <div className="modal compose" onClick={(e) => e.stopPropagation()}>
        <textarea
          ref={ref}
          className="compose-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you need done?"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
            if (e.key === 'Tab') {
              e.preventDefault();
              const next = stepProject(shown, product?.slug ?? '', e.shiftKey ? -1 : 1);
              if (next) pick(next.slug);
            }
          }}
          onPaste={async (e) => {
            const pasted = await fromPaste(e);
            if (pasted.length) { e.preventDefault(); setAttachments((a) => [...a, ...pasted]); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const dropped = await collectFiles(e.dataTransfer.files);
            if (dropped.length) setAttachments((a) => [...a, ...dropped]);
          }}
        />
        <AttachRow attachments={attachments} onRemove={(i) => setAttachments((x) => x.filter((_, j) => j !== i))} />
        {/* Notes take a line only when there is something to say. They are not
            clauses in the sentence, so the sentence never moves and a failure
            reads as a failure, not as another setting. */}
        {/* The refusal is the first note because it changes what the buttons do.
            It wears no alarm colour, by design; the ink lifts to --text-dim. */}
        {refusal && <div className="compose-note refuses">{refusal}</div>}
        {repeat && (
          <div className="compose-note">
            The first run is now.
          </div>
        )}
        {/* Typed words that look like a schedule but cannot be read say so. The
            clock still reads "Starts now", which is what will happen. */}
        {parsed && 'unreadable' in parsed && (
          <div className="compose-note">Not understood, so this runs once, now.</div>
        )}
        {dropped > 0 && (
          <div className="compose-note">
            {dropped === 1
              ? 'One pasted image is too big to save. Closing the card loses it.'
              : `${dropped} pasted images are too big to save. Closing the card loses them.`}
          </div>
        )}
        {/* One text run, one size, one baseline; see the top of this file. */}
        <div
          className={[
            'compose-sentence',
            footerIsOpen(facts) ? 'open' : 'quiet',
            `rest-${restingClause(facts)}`,
          ].filter(Boolean).join(' ')}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <span className="compose-clauses">
            {/* Each clause is an inline span, never a flex child, so the line
                stays one text run on one baseline. */}
            {/* The space between clauses sits outside them. Each clause is
                nowrap so a whole clause wraps rather than stranding its period,
                and Chromium will not break at a space inside a nowrap span. */}
            {hasProjectClause && (<>
              <span className="clause clause-project">
                {'For '}
                <span className="compose-word-wrap" ref={projWrap}>
                  {projOpen && chips}
                  <button
                    type="button"
                    ref={projWord}
                    className={`compose-word ${projOpen ? 'open' : ''} ${projCut ? 'cut' : ''}`}
                    aria-haspopup="dialog"
                    aria-expanded={projOpen}
                    onClick={() => setProjOpen((o) => !o)}
                    // The whole name, because a long one fades out below.
                    title={product?.name ?? 'Which project this is for'}
                    // The period is inside the name's box, so a cut name loses
                    // its period rather than leaving a stray dot. It is its own
                    // inline-block so the dotted underline stops at the name.
                  >{product?.name ?? 'a project'}<span className="compose-word-stop">.</span></button>
                </span>
              </span>
              {' '}
            </>)}
            <span className="clause clause-priority">
              <PriorityPicker
                variant="word"
                value={prio ?? priorityIdOf(5)}
                set={!!prio}
                onChange={pickPrio}
                onOpenChange={setPrioOpen}
                // No keys in this tooltip: priority has no chord, and the
                // Shortcuts page promises every key the app names works.
                title="Priority"
              />
              {' priority.'}
            </span>
            {' '}
            <span className="clause clause-when">
              {/* A task given to a person is due on a day; it does not start. */}
              {givenTo
                ? <DuePicker value={due} onChange={setDue} onOpenChange={setWhenOpen} />
                : <WhenPicker
                  value={when}
                  onChange={setWhen}
                  onOpenChange={setWhenOpen}
                />}
              {'.'}
            </span>
            {' '}
            {/* Team version: on a shared project the engine word also lists
                teammates. Drawn even with one coding agent, because the people
                are a real choice. */}
            {sharedHere && team && (<>
              <span className="clause clause-engine">
                {givenTo ? '' : 'With '}
                <WhoPicker
                  engine={engine}
                  person={givenTo}
                  engines={engineRows}
                  people={team.state.people}
                  me={team.state.me}
                  onEngine={pickEngine}
                  onPerson={setAssignee}
                  onOpenChange={setEngineOpen}
                />
                {givenTo ? (givenTo === team.me ? ' do it myself.' : ' does it.') : '.'}
              </span>
              {' '}
            </>)}
            {/* The engine comes before the model, because the engine decides
                which models exist and `pickEngine` replaces the model. Drawn
                only when this Mac offers more than one engine. `EnginePicker`
                also refuses itself below two, so this guard only keeps the
                sentence's punctuation right. */}
            {engineRows.length > 1 && !sharedHere && (<>
              <span className="clause clause-engine">
                {'With '}
                <EnginePicker
                  value={engine}
                  choices={engineRows}
                  onChange={pickEngine}
                  onOpenChange={setEngineOpen}
                />
                {'.'}
              </span>
              {' '}
            </>)}
            {!givenTo && <span className="clause clause-model">
              {'On '}
              <ModelPicker
                value={model}
                onChange={pickModel}
                onOpenChange={setModelOpen}
                engine={engine}
                codexModels={codexModels ?? []}
                codexDefault={codexModelDefault ?? null}
                effort={effortOn}
                onEffortChange={pickEffort}
              />
              {'.'}
            </span>}
          </span>
          {/* The refusal is the button's title too, for a pointer that reaches
              the disabled button before the note is read. */}
          <button
            className="dock-send"
            onClick={send}
            disabled={!canSend}
            title={refusal ?? (givenName ? `Send to ${givenName} · ${SEND}` : `Start it · ${SEND}`)}
          >{givenName && givenTo !== team?.me ? `Send to ${givenName}` : givenTo ? 'Add it' : 'Start it'} <kbd>{SEND}</kbd></button>
        </div>
      </div>
    </div>
  );
}

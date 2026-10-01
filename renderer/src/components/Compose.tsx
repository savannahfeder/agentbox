// Compose: a message to an agent. The everyday act, so it is one field: type
// what should happen, ⌘↵ send. The first line becomes the title; the rest is
// detail, and a first line too long to be a title keeps every word of itself
// in the body (../message-split.ts, which exists because that used to be a
// slice that threw the overflow away). Tab switches product (⌥arrows are macOS
// word-jump, so they were never going to work in a text field).
//
// THE PROJECT IS REMEMBERED THE MOMENT SHE PICKS IT, not when she sends.
// Picking and then closing the card used to leave nothing behind, so the next
// card came back on whatever was first.
//
// AND THE SELECTION IS A PROJECT, NEVER A POSITION. It used to be an index
// into the displayed row, and an index is a promise the row cannot keep: on a
// real picker with a dozen hidden projects, opening the menu and clicking the
// "N hidden" pill moved the card onto a different project, because the
// revealed chips pushed everything down and index 8 now meant something
// else. Anything that resolves a slug is safe; anything
// that counts chips is not.
//
// THE FOOTER IS ONE SENTENCE. Three clickable words in a line of English — the
// project, the priority, the clock — and the app's own send button at the end.
// It replaced a chip row plus a pill row plus a five-clause legend, which is
// why the card is smaller than it was.
//
// The clickable words are inline-block buttons with `font: inherit` and no
// padding, underlined with text-decoration rather than a border (a border plus
// padding is what pushed them off the baseline in the drawing), and nothing in
// the line carries an icon. Hierarchy is colour only, never size. If you add a
// word to this footer, it inherits or it does not go in.
//
// The rule itself is in ../compose-footer.ts, apart from this file, so it can
// be tested without rendering a card.
//
// HOVER ADDS WORDS AND NOTHING ELSE. In the first cut the card was open before
// anyone had touched it, because the level and the
// model are REMEMBERED across cards and the rule was reading that memory as a
// choice.So the footer's background never moves, and `openedWith` below is what
// tells a remembered value apart from a move.
//
// The supervisor skips practice projects in four separate places on purpose
// (main/supervisor.mjs) — nobody works in one, it points at no folder — and
// this card did not know, so it accepted her task, filed it, and left her
// watching a row that could never move. A refusal in plain English, before she
// presses anything, is the whole of the repair; making practice projects
// runnable is the one fix that is not allowed. The rule and the words are in
// ../compose-says.ts so they can be tested without a card.
//
// The chips are in the user's RUNNING ORDER, most important first, and
// dragging one to a new place is how that order is set. There are no high,
// medium and low buckets for projects: buckets left every tie inside a bucket
// unanswered, and which of two projects comes first is the question the fleet
// actually needs settled. The chips now live inside the
// project word's menu rather than permanently on the card: SAME chips, same
// drag, same geometry, one popover further in. Fine grained ordering has no
// other home in the app (the palette can only say "put this first"), so it
// could not simply be dropped when the row was.

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Product, RepeatShape } from '../types';
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
import { readLastPriority, writeLastPriority } from '../priority';
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
  // Returns false when the send did not stand, which is the one case where the
  // card stays open and her draft must stay with it (a refused repeat rule).
  // Anything else counts as sent.
  onSend: (p: { product: string; title: string; body?: string; kind: string; priority?: number;
                repeat?: RepeatShape; runAt?: number; model?: string; engine?: string; effort?: string;
                // A task given to a person (the team version), and when it is due.
                assignee?: string; due?: string }) => void | boolean | Promise<void | boolean>;
  onReorder: (slugs: string[]) => void;
  onHide: (slug: string, hide: boolean) => void;
  // Door A: the new project card, opened from inside this list. Absent in the
  // screenshot fixtures and anywhere the card has nowhere to go.
  onNewProject?: () => void;
  // A project made while this card was open. Selecting it here is the whole
  // point of door A: she came looking for a project that did not exist, so the
  // task she is writing is for the one she just made.
  selectProject?: string | null;
  // WHICH CODING AGENTS THIS MAC CAN ACTUALLY BE OFFERED, read off the
  // snapshot. One entry means no choice and the clause is not drawn at all,
  // which is every Mac until she opens the gate. Defaulted so every existing
  // caller, every fixture and every screenshot script keeps the card it had.
  //
  // IT IS NOT WORKED OUT HERE AND IT COULD NOT BE. Whether a choice is real
  // needs the capability gate, which lives in main and is pinned there; a card
  // that asked `availableEngines` itself would offer Codex on a Mac where the
  // supervisor is about to refuse it.
  engineChoices?: Engine[];
  workspaceEngine?: string;
  // AND WHAT EACH ENGINE'S MODELS ARE CALLED. Claude Code's four are generated
  // from its own catalog; Codex's are read off this Mac and arrive through
  // settings, so they ride in as a prop rather than being imported. Empty means
  // Codex reported nothing, and the word falls back to what its own config.toml
  // would run.
  codexModels?: ModelChoice[];
  codexModelDefault?: string | null;
  // THE FIRST RUN'S EXAMPLE TASK, typing itself in (../onboarding.ts).So it is
  // REAL TEXT in the real field, at the real ink, and she can edit or delete
  // every word of it. Absent everywhere else, which is every other card this
  // app has ever drawn.
  prefill?: { title: string; body?: string; product?: string | null };
  onClose: () => void;
}) {
  const hiddenSet = new Set(hidden);
  const [revealed, setRevealed] = useState(false);
  // What the row actually draws. Hiding is about THIS PICKER only: a hidden
  // project still ranks, still runs agents, and its work still reaches the
  // inbox. It is a filing decision, not an off switch.
  const shown = revealed ? products : products.filter((p) => !hiddenSet.has(p.slug));
  const hiddenCount = products.length - products.filter((p) => !hiddenSet.has(p.slug)).length;

  // The project she is sending to, held as a SLUG. See the note at the top of
  // this file for why it is not an index.
  const [productSlug, setProductSlug] = useState(() => localStorage.getItem(LAST_PRODUCT_KEY) ?? '');
  // ../compose-project.ts owns the resolution, and says why it resolves against
  // every project rather than only the displayed ones.
  // WHO DOES IT, WHEN IT IS A PERSON (the team version). Only on a shared
  // project, where teammates exist; null is "an agent does it", as always.
  const team = useContext(TeamContext);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const product = resolveProject(products, shown, productSlug);
  // A person can only be given a task in a project they can see: a shared one.
  const sharedHere = !!team && isShared(team.products.get(product?.slug ?? ''));
  const givenTo = sharedHere ? assignee : null;
  const givenName = givenTo ? (givenTo === team?.me ? 'yourself' : firstName(team?.byId.get(givenTo))) : null;
  // Picking is what gets remembered, so it is the one place the choice is
  // written. Sending writes it too, because what she actually sent to may be
  // the fallback above rather than anything she ever clicked.
  const pick = (slug: string) => {
    setProductSlug(slug);
    localStorage.setItem(LAST_PRODUCT_KEY, slug);
  };
  // Made from the chip, while this card stayed open behind it. The project is
  // deliberately NOT part of the draft (see ../drafts.ts), so this is the one
  // thing that reaches back into the card after it is open.
  useEffect(() => { if (selectProject) pick(selectProject); }, [selectProject]);

  // THE CARD OPENS ON WHATEVER SHE LEFT IN IT. Everything below used to start
  // empty on every open, so closing the card by accident — Escape, a click on
  // the backdrop, a reload — took the whole sentence and every pasted image
  // with it. See ../drafts.ts for what is kept and why the project is not.
  const opened = useRef(readComposeDraft());
  const [text, setText] = useState(() => opened.current.text);
  // THE LEVEL SHE LAST PICKED, unless this card is one she left half-written,
  // in which case its own tag wins.../priority.ts holds the remembering and
  // says why it is not part of the draft.
  //
  // A remembered level arrives SET, not as the dim default, so the card says
  // "Urgent priority." in the tagged colour the moment it opens. A sticky level
  // she cannot see is a task filed urgent by a card that looked untouched.
  const [prio, setPrio] = useState<PriorityId | null>(
    () => (opened.current.priority as PriorityId | null) ?? readLastPriority(),
  );
  // Every way in writes it down, at the moment of the pick and not at the send:
  // a level she chose and then thought better of sending is still the level she
  // chose. Same rule as `pick` above, for the same card.
  const pickPrio = (id: PriorityId) => { setPrio(id); writeLastPriority(id); };
  // WHICH ENGINE PICKS THIS UP. Remembered exactly like the level and the model,
  // and for the same reason as both: a card that forgets the pick
  // makes her pick again. With no remembered pick, inherit the workspace agent.
  // After resolving that default, null means Claude Code, which would actually
  // run. It is read BEFORE the model because the model's memory is kept per
  // engine and the word to restore depends on which engine this card is for.
  //
  // AND IT IS CLAMPED TO WHAT THIS MAC OFFERS, which it was not. The memory is
  // a word from whenever she last picked one; `engineChoices` is what this build
  // on this machine can honour today, and they come apart the moment Codex is
  // uninstalled or the gate is shut. Measured 2026-09-05 by rendering this card
  // with `zero.lastEngine` set to codex and one engine on the snapshot: the
  // sentence read "On gpt-5.6-sol." -- the other harness's slug, with no engine
  // clause beside it to explain it (the picker refuses itself below two engines)
  // and the whole Claude Code model list gone from the drawer, because
  // `codexModels` is empty on such a Mac. Nothing new is DRAWN by the clamp; a
  // word this Mac cannot honour is simply not held.
  const engineRows = engineChoices ?? [ENGINES[0]];
  const [engine, setEngine] = useState<string | null>(() => engineThisMacOffers(readLastEngine(undefined, workspaceEngine), engineRows));
  // WHICH MODEL PICKS THIS UP, out of THAT engine's own memory. Same rule as
  // the level: null means she has named nothing and the clause says what would
  // actually run.
  const [model, setModel] = useState<string | null>(() => readLastModel(undefined, engine, codexModelDefault ?? null));
  const pickModel = (id: string | null) => { setModel(id); writeLastModel(id, undefined, engine, codexModelDefault ?? null); };
  // MOVING THE ENGINE MOVES THE MODEL WITH IT.The two engines share no model
  // names at all, so a word left over from the other one is a word its CLI has
  // never heard of -- and since 2026-09-04 it is a run the supervisor refuses
  // outright rather than a card that merely reads wrong. The new engine's own
  // last pick is restored, or its default.
  const pickEngine = (id: string | null) => {
    setEngine(id);
    writeLastEngine(id);
    setModel(readLastModel(undefined, id, codexModelDefault ?? null));
    setEffort(readLastEffort(undefined, id));
  };
  // HOW HARD IT THINKS. Lives in the model drawer, remembered per engine like
  // the model, and null means nothing is sent and the engine chooses for the
  // model.
  //
  // WHAT IS LIT AND SENT IS THE MEMORY CHECKED AGAINST THIS MODEL'S OWN ROWS.
  // Claude Code's five fit every model; a Codex level is the model's own, so a
  // remembered `ultra` on a card whose model stops at `xhigh` is neither lit
  // nor written on the row. The memory itself is kept, so moving back to the
  // model that takes it finds it again.
  const [effort, setEffort] = useState<string | null>(() => readLastEffort(undefined, engine));
  const pickEffort = (id: string | null) => { setEffort(id); writeLastEffort(id, undefined, engine); };
  const effortRows = effortChoicesFor(engine, model, { codexModels: codexModels ?? [], codexDefault: codexModelDefault ?? null });
  const effortOn = effortPicked(effort, effortRows) ? effort : null;
  // WHAT THIS CARD OPENED CARRYING, frozen on the first render. The level and
  // the model are remembered across cards on purpose, so "she has set a level"
  // is not a thing the values can tell you; only a difference from this can.
  // Without it a card she has not touched opens with the whole sentence up and
  // the hover has nothing left to reveal, which is exactly the bug this fixes.
  const openedWith = useRef({ prio, model, engine, effort });
  // AND AGAIN IF THIS MAC'S ANSWER MOVES WHILE THE CARD IS OPEN. `engineChoices`
  // rides the snapshot, which is refetched every few seconds, so rechecking Codex
  // or editing zero.config.json changes it under her. The model moves with the
  // engine here exactly as it does in `pickEngine`, because the two lists share
  // no names at all.
  //
  // `openedWith` IS REBASED WITH IT, and that is not bookkeeping. It is what
  // "she has touched this card without the rebase the footer would spring open
  // on a card she has not typed in, which is exactly the bug above.
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
  // The footer is quiet at rest. The pointer is one reason to open it and the
  // three menus are the others: a drawer she is reading must not have the line
  // collapse under it. ../compose-footer.ts turns these into the one answer the
  // footer's classes need.
  const [hovered, setHovered] = useState(false);
  const [prioOpen, setPrioOpen] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>(() => opened.current.attachments);
  // How many of the images now on the card the draft could not hold. Said out
  // loud below, at the moment of the paste, because an image that will not be
  // here next time has to be a sentence now rather than a gap she finds later.
  const [dropped, setDropped] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Recurrence is read from what the user typed, on every keystroke, so the tag
  // appears and disappears with the phrase itself. Pure and cheap.
  // The clock's value: a moment to start at, or a rule, never both. The menu
  // sets it, and so does what she types: a rule read out of the message updates
  // the word, which is what makes the two one control with two ways in rather
  // than two competing ones.
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
    // Taking the phrase back out clears what the phrase set, and only that:
    // a schedule she picked from the menu is hers and survives her editing
    // the words around it.
    if (!rule && lastParsed.current && sameRule(repeat, lastParsed.current)) setWhen(WHEN_NOW);
    lastParsed.current = rule;
  }, [parsed && 'rule' in parsed ? parsed.rule.at : null]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // The project word's menu. It holds the chips, so it holds the drag.
  const [projOpen, setProjOpen] = useState(false);
  const projWrap = useRef<HTMLSpanElement>(null);
  // WHETHER THE PROJECT NAME IS CUT, measured rather than guessed from its
  // length, because only a cut name fades (w-996c79836f). An ellipsis was
  // turned down twice: after a period it read as four dots, and without one it
  // still read as rough. Stopping at a whole word was drawn too and refused,
  // because it turns "Name (copy 2)" into "Name", which is a different
  // project. Measured again once the fonts land, since the first
  // layout can be in the fallback face and a different width.
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

  // Focus, and the caret at the END of whatever came back, so a restored card
  // is one she can carry on typing into rather than one she has to click into
  // first. A fresh focus on a textarea that already has text lands the caret at
  // the start, which reads as the card putting the user's words behind her.
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  // THE FIRST TASK TYPES ITSELF. Character by character, at a speed a person
  // reads at rather than one a machine writes at, and then the body arrives
  // whole underneath it: the point is that she watches a sentence appear in a
  // field, not that we imitate a typist. The caret follows it to the end, so
  // when it stops the card is one she can carry on typing into.
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
  // Addressed to the project they just made, without waiting for the picker's
  // memory to be written.
  useEffect(() => {
    if (prefill?.product) setProductSlug(prefill.product);
  }, [prefill?.product]);
  // ON EVERY KEYSTROKE, EVERY PASTE, EVERY PICK. Saving on close would miss the
  // ways a card actually dies (a reload, a crash, a quit), and those are the
  // ones with no undo. The write says what it managed to keep, because image
  // bytes come off when the store is full and the card has to say so.
  useEffect(() => {
    const stored = saveComposeDraft({
      text, attachments, priority: prio, when: { runAt: when.runAt, repeat: when.repeat }, dropped: 0,
    });
    setDropped(stored.dropped);
  }, [text, attachments, prio, when.runAt, when.repeat]);
  // Revealing, hiding and reordering no longer need a fixup: the selection is
  // the project itself, so it survives the row changing shape under it.
  //
  // Pointerdown, not click, and the same reason as the priority drawer: a click
  // aimed at the textarea should close this AND land the caret, not be eaten
  // closing the menu. A drag that starts on a chip is inside the wrap, so it is
  // not a dismissal.
  useEffect(() => {
    if (!projOpen) return;
    const away = (e: PointerEvent) => {
      if (!projWrap.current?.contains(e.target as Node)) setProjOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [projOpen]);

  // WHETHER THIS CARD MAY BE SENT AT ALL, and the sentence it owes her when it
  // may not (../compose-says.ts holds the rule and the words, and says why they
  // are not written here). Today there is exactly one refusal: a task of her own
  // into the practice project, which the supervisor will never start.
  const refusal = practiceRefusal(product, { scripted: !!prefill });

  const send = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !attachments.length) || !product) return;
    // A REFUSED CARD SENDS NOTHING, EVEN ON ⌘↵. The button is disabled below,
    // and this is the other half of it: the keyboard is how this card is
    // actually used, so a guard that only lives on the button is a guard that
    // is not there. The draft is untouched, so the user's words are still in the card
    // while she picks a project that can run them.
    if (refusal) return;
    // The title is a label and the body is the message; ../message-split.ts
    // owns that split and says why, because the version of it that lived here
    // silently deleted everything the user typed past character 180.
    const { title, body: written } = splitMessage(trimmed || `Attached: ${attachments[0]?.name}`);
    const attachedMd = await persistAttachments(product.slug, attachments);
    const body = [written, attachedMd].filter(Boolean).join('\n\n');
    localStorage.setItem(LAST_PRODUCT_KEY, product.slug);
    // Untagged used to send priority 0, which sorted the user's own ask
    // below everything an agent had tagged, so an urgent ticket could land at
    // the bottom of the inbox. Untagged now means medium.
    const stood = await onSend({
      product: product.slug,
      title,
      body: body || undefined,
      kind: 'directive',
      priority: prio ? priorityValueOf(prio) : 5,
      // A rule when the user wrote one. The caller sends it down a different path,
      // because a repeating task is not a work item.
      ...(repeat ? { repeat } : {}),
      // A moment when she asked for one. This rides in with her content rather
      // than as a second call: main/store.mjs#composeItem already writes it as
      // part of the founder patch, so "start it in 30 minutes" is one write and
      // there is no window where the item exists and is already running.
      ...(when.runAt && !repeat && !givenTo ? { runAt: when.runAt } : {}),
      // A TASK GIVEN TO A PERSON goes to them, with its due day, and no agent
      // runs on it until they hand it to one.
      ...(givenTo ? { assignee: givenTo, ...(due ? { due } : {}) } : {}),
      // The model she named, when she named one, and it is READ DOWNSTREAM. It
      // lands on the work item as its own field and the spawn turns it into
      // `--model` for Claude Code or `thread/start`'s `model` for Codex. The
      // comment here used to say nothing read it; a word on a card that changed
      // nothing about the run is the same defect the list itself had, so both
      // halves were fixed together.
      //
      // ASKED PER ENGINE, because `opus` is the default on Claude Code and is a
      // meaningless word on Codex: one constant for both would send her the
      // engine's own default as though she had chosen it.
      //
      // AND ON CLAUDE CODE THE WORD IS ALWAYS SENT, INCLUDING THE DEFAULT ONE
      // (w-12081d32cc). Settings no longer has a Model row, so this card is the
      // only place the question is asked, and the only place it is answered. It
      // used to send nothing when the card said Opus, which let the run fall
      // back to a `--model` flag somebody had set in zero.config.json months
      // ago: the card said Opus and the agent ran on whatever that flag named.
      // With no screen left to correct that from, the card has to be the fact.
      //
      // CODEX IS UNCHANGED, because there the ABSENCE of the word is a real
      // answer: it means the person's own ~/.codex/config.toml decides, and
      // sending a slug here would take that away from them.
      ...(engine === 'codex'
        ? (engineModelPicked(engine, model, codexModelDefault ?? null) ? { model: model as string } : {})
        : { model: model ?? DEFAULT_MODEL }),
      // WHICH ENGINE THE SENTENCE SAYS, whenever this Mac really offered a
      // choice. `null` is how this card spells Claude Code (`EnginePicker`
      // maps the default to it), and this line used to drop a null engine
      // entirely -- so the composer read "With Claude Code." and filed a row
      // with no engine on it, which then resolved to the WORKSPACE DEFAULT,
      // which may be Codex. The card said one engine and the task ran on the other,
      // and a repeating rule inherited it for every future run.
      //
      // WHETHER IT IS WORTH WRITING IS STILL NOT DECIDED HERE, and that is why
      // sending it costs nothing: `Supervisor#engineOffered` answers null for a
      // choice she could not have been offered AND for the engine the row would
      // have resolved to anyway, so a row is still never marked with a field
      // that carries no news.
      ...(engineRows.length > 1 ? { engine: engine ?? DEFAULT_ENGINE } : {}),
      // The level she named, when she named one THIS MODEL TAKES. Its own field
      // on the work item; the spawn turns it into `--effort` beside the model
      // for Claude Code and `turn/start`'s `effort` for Codex.
      ...(effortOn ? { effort: effortOn } : {}),
    });
    // A SEND THAT DID NOT STAND KEEPS THE DRAFT. A refused repeat rule leaves
    // this card open with the user's words in it on purpose (App.tsx), and clearing
    // the draft underneath it would make the next Escape lose them — a refused
    // schedule that also eats what the user typed is two failures, and the second
    // one is the expensive one.
    if (stood !== false) clearComposeDraft();
  };

  // One pointer drag reorders the row.
  //
  // The landing spot is worked out in READING ORDER, across both axes. The
  // first version compared pointer X against chip centres and nothing else,
  // which is correct for one row and useless for four: with the chips wrapped,
  // every row spans the same X range, so dragging up or down moved nothing.
  // Row first, then position within the row.
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
    // the insertion point is drawn as a line instead. Parting a wrapped row
    // cannot be honest anyway: a chip stepping aside on row two has to come
    // from row one, and every row below it moves.
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
      // `to` indexes the DISPLAYED list; the order we persist is the full one,
      // so the move is expressed as "put it before this product", which keeps
      // any hidden projects sitting where they already were.
      const dragged = shown[index];
      const before = to < shown.length ? shown[to] : null;
      if (dragged && before?.slug !== dragged.slug) {
        const slugs = products.map((p) => p.slug).filter((s) => s !== dragged.slug);
        const at = before ? slugs.indexOf(before.slug) : slugs.length;
        slugs.splice(at < 0 ? slugs.length : at, 0, dragged.slug);
        // Nothing to fix up: the selection is a slug, so reordering the row
        // cannot move it.
        onReorder(slugs);
      }
      ref.current?.focus();
    };

    chip.addEventListener('pointermove', onMove);
    chip.addEventListener('pointerup', onUp);
    chip.addEventListener('pointercancel', onUp);
  };

  // The chips, exactly as they were on the card, now inside the project word's
  // menu. Same class names, same grip, same x, same drag: this moved house, it
  // was not rebuilt.
  const chips = (
    <span className="proj-menu">
      {/* w-ab41901416: the instructions came off.
       */}
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
            {/* The grip is what says a chip can be lifted at all. Without it
                the drag is never discovered, because nobody tries. */}
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
        {/* DOOR A: the project you want is not in this list, so make
            it from here. The dashed chip is the app's own "hidden projects"
            chip, borrowed rather than drawn: a dashed outline already means
            "not one of the solid ones" in this exact row. */}
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

  // WHETHER THE FOOTER NAMES THE PROJECT. With one project there is nothing to
  // choose, so the clause has never been drawn — except that "which project is
  // this going to" is precisely the question a tester could not answer, and a
  // practice project is the one place where the answer decides whether anything
  // happens at all. So a practice target always says its own name, however few
  // projects there are.
  const hasProjectClause = shown.length > 1 || !!product?.practice;

  // What the footer is doing, in the six facts the rule needs. Kept here as
  // one object so the classes below cannot disagree with the tests.
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
        {/* The notes, which cost a line only when there is something true to
            say. They are NOT in the sentence: a sentence that grows a clause
            when something goes wrong is a sentence that moves under her, and
            the loud failure has to be readable as a failure rather than as
            another setting. */}
        {/* WHY THIS CARD WILL NOT TAKE IT. First of the notes, because it is
            the one that changes what the buttons underneath it do: everything
            below it is a setting for a task that is not going anywhere until
            she moves the project. It is a note and not a clause for the same
            reason the others are — a sentence that grows a clause when
            something is wrong is a sentence that moves under her — and it wears
            no colour, because alarm colour on a surface she is looking at
            anyway has already been rejected twice. The ink
            lifts to --text-dim and that is all. */}
        {refusal && <div className="compose-note refuses">{refusal}</div>}
        {repeat && (
          <div className="compose-note">
            The first run is now.
          </div>
        )}
        {/* Typed words she believes set a schedule and that this cannot read
            must SAY so; the word beside it still reads "Starts now", which is
            what would actually happen. */}
        {parsed && 'unreadable' in parsed && (
          <div className="compose-note">Not understood, so this runs once, now.</div>
        )}
        {/* An image the draft could not hold is said out loud, now, while she
            still has it. The whole point of saving the card is that nothing
            goes quiet. */}
        {dropped > 0 && (
          <div className="compose-note">
            {dropped === 1
              ? 'One pasted image is too big to save. Closing the card loses it.'
              : `${dropped} pasted images are too big to save. Closing the card loses them.`}
          </div>
        )}
        {/* ONE text run, ONE size, ONE baseline, and the app's own send button.
            See the note at the top of this file for why that is a rule and not
            a preference. */}
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
            {/* With one project there is nothing to choose, so the clause is
                not drawn at all. */}
            {/* Each clause is its own inline span so one can be shown while the
                others are not. INLINE, never a flex child: the line is one text
                run on one baseline and a box around a clause is how that gets
                lost. */}
            {/* THE SPACE BETWEEN CLAUSES SITS OUTSIDE THEM (w-996c79836f). Each
                clause is nowrap, so a line that runs out of room moves a whole
                clause down rather than stranding its period, which is what
                happened with "On Opus 5.5" and a lone "." under it. The break has to
                be a space in the normal-wrapping parent: left inside the nowrap
                span, Chromium will not break there and the line runs under the
                button instead. */}
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
                    // THE PERIOD IS INSIDE THE NAME'S BOX, so a cut name loses
                    // its period with it rather than fading into a stray dot
                    // (w-996c79836f). It is its own inline-block so the dotted
                    // underline stops at the name and the period keeps the
                    // prose's ink.
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
                // NO KEYS IN HERE, BECAUSE THERE ARE NONE. This said "⌘1
                // Urgent ⌘2 High ⌘3 Medium ⌘4 Low" for eight days after the
                // chord itself was removed. A tooltip naming four
                // keys that do nothing is the exact confusion a tester's
                // onboarding was full of, and the Shortcuts page in Settings
                // now promises that every key the app names is a key that
                // works. ⌘K by name is the route.
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
            {/* WHO DOES IT, on a shared project (the team version, approved
                2026-09-30): the engine word, grown to hold the teammates. It
                reads "With Claude Code." for an agent, as it always did, and
                "Maya does it." for a person. Drawn even on a Mac with one
                coding agent, because the people are a real choice there. */}
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
            {/* THE ENGINE COMES BEFORE THE MODEL, because the engine decides
                which models exist (w-83b8bfdcd3). `pickEngine` above throws the
                model away and restores that engine's own last pick, since the
                two engines share no model names at all, so a sentence that
                named the model first was asking for the word that the next word
                overwrites. It reads "With Claude Code. On Opus 5." now, and the
                drawer opened second is the one holding models that engine can
                actually run.

                It is only drawn when this Mac really offers more than one
                (w-250cd74811). It inherits the line the way every other word
                here does; it draws nothing at all when there is nothing to
                choose, which is every Mac until she opens the gate.
                `EnginePicker` refuses itself below two rows as well, so this
                guard is the sentence's punctuation rather than the safeguard. */}
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
            {/* The model, last in the line. It is the clause this whole footer
                was redrawn for (w-e5ed202958): fifteen ways to put it on the
                card were drawn and the one chosen adds nothing at rest. */}
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
          {/* THE REFUSAL IS ON THE BUTTON TOO. The note above it is the real
              answer, and this is for the pointer that goes to the button first,
              which is what a tester did: a dead button that says nothing about being
              dead is this round's own fault, one size smaller. */}
          <button
            className="dock-send"
            onClick={send}
            disabled={!canSend}
            title={refusal ?? (givenName ? `Send to ${givenName} · ⌘↵` : 'Start it · ⌘↵')}
          >{givenName && givenTo !== team?.me ? `Send to ${givenName}` : givenTo ? 'Add it' : 'Start it'} <kbd>⌘↵</kbd></button>
        </div>
      </div>
    </div>
  );
}

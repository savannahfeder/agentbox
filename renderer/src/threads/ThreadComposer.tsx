// THE NEW THREAD CARD, drawn as an email (w-e731ca9376, approved 2026-10-01).
//
// To, then Model, then the message, then a bar of three square chips (project,
// priority, who can see it), a paperclip and the Send button. It replaces the
// one-line Compose sentence because the team version gave the card a second
// kind of recipient: a thread can go to an agent or to a person, and "who is
// this for" is a question an email answers in its first line.
//
// TO DECIDES THE SHAPE OF THE CARD. To an agent it is a task: Model, the three
// chips and Send later all mean something. To a person it is a message: there
// is no model, nothing to file, nothing to schedule, and the bar says who will
// read it instead, because "who sees this" is the one thing a message to one
// person has to be clear about.
//
// THE MODEL IS THE HARNESS. There is no Engine field: an Anthropic model runs in
// Claude Code and a GPT model in Codex, so the two can never disagree. The rules
// for that, for the Recent list, for Send later and for the title are pure and
// tested in ./composer-rules.ts; this file only draws them and sends.
//
// EVERYTHING THE OLD CARD REMEMBERED, THIS ONE REMEMBERS THE SAME WAY, out of
// the same keys: the draft on every keystroke (../drafts.ts), the project, the
// priority, the model per engine and the effort per engine at the moment she
// picks them. A card that forgets what she chose makes her choose again, and a
// card that loses her words on Escape is the bug the draft exists to fix.
//
// MENUS ARE ONE STEP LIGHTER THAN THE CARD. The header's drop below their field
// with their rows on the same x as the value above them; the bar's rise out of
// the bar, because the bar is the bottom of the card. One menu is open at a
// time, and the keyboard reaches every row: arrows move, Enter picks, Escape
// closes the menu before it closes the card.

import { PriorityIcon } from '../components/Priority';
import { SEND } from '../this-keyboard';
import { Fragment, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { PRACTICE_TASK } from '../../../shared/first-run-practice.mjs';
import type { Product, WorkItem } from '../types';
import type { Engine } from '../../../shared/engines.mjs';
import { ENGINES } from '../../../shared/engines.mjs';
import { api } from '../api';
import { TeamContext, Face, firstName } from '../team/people';
import { AgentFace } from '../components/AgentFace';
import { AutoFace } from '../components/AutoFace';
import { AUTO_LABEL } from '../../../shared/auto-route.mjs';
import { readLastRecipient, writeLastRecipient } from './recipient';
import { conversationWith } from './page-rules';
import { collectFiles, fromPaste, persistAttachments, type PendingAttachment } from '../attachments';
import { AttachRow } from '../components/AttachRow';
import { Listening, MicButton, useWebDictation } from '../components/WebDictation';
import { PRIORITIES, priorityLabelOf, priorityValueOf, startingPriority, type PriorityId } from '../priority';
import { composeDraftIsEmpty, dropComposeDraft, markComposeDraftSending, openingComposeDraft, readComposeDraft, restoreComposeDraft, saveComposeDraft, type ComposeDraft } from '../drafts';
import { LAST_PRODUCT_KEY } from '../compose-project';
import { practiceRefusal, noProjectYet } from '../compose-says';
import { onCloudPhone } from '../phone-screen';
import { defaultModelFor, engineModelLabel, readLastModel, writeLastModel, type ModelChoice } from '../models';
import { defaultEffortFor, effortChoicesFor, effortPicked, effortShown, readLastEffort, writeLastEffort } from '../effort';
import { readLastEngine, startingEngine, writeLastEngine } from '../engines';
import { repeatPresets } from '../components/When';
import { readRule } from '../format';
import { fitMenu } from '../keep-in-window';
import { ModelMenu } from './ModelMenu';
import { useThreadMentions } from '../components/ThreadMentions';
import {
  agentChoices, agentWordFor, autoOffered,
  allModels, findPeople, harnessFields, laterHint, momentFromWords, mondayMorning, moreCount,
  joinNames, placeholderFor, projectsOffered, projectSwatch, recentModels,
  sharingFields, startingProject, startingVisibility, startingChosen, teammates, threadMessage, tomorrowMorning, chosenWords, VISIBILITY_ROWS,
  dueChoices, dueWords, headRows, keyOnTheNewThreadCard, taskFields,
  type Harness, type Keyboard, type ModelPick, type SendAs, type Visibility,
} from './composer-rules';
import './thread-composer.css';
import { TeammateMark } from '../teammates/TeammatesRail';

/** What went out, so the caller can say so and offer the way back. */
export interface ThreadSent {
  kind: 'task' | 'repeat' | 'message';
  product?: string;
  title?: string;
  /** A Send later moment, when there was one. */
  runAt?: number;
  /** 'later' when it went to Later rather than to a moment (w-afb66e6661). */
  start?: 'later';
  /** The repeating rule's id, so ending it can be the undo. */
  ruleId?: string;
  /** Everyone a message went to, when it went to more than one person. */
  toMany?: string[];
  /** The person a message went to. */
  to?: string;
  /** What the card held when Send was pressed, for Z to put back. */
  draft?: ComposeDraft;
  /** The conversation a message went into, so its toast can open it with O. */
  made?: { product: string; id: string };
}

type MenuKey = 'to' | 'model' | 'sendAs' | 'dueOn' | 'project' | 'priority' | 'visibility' | 'later';

/** What a card opens on. Project, model and priority need no field: the card
 *  reads them from what was last picked and from the saved draft. */
export interface ComposeStart {
  to?: string;
  also?: string[];
  body?: string;
  mate?: string | null;
  sendAs?: SendAs;
  due?: string | null;
  visibility?: Visibility | null;
  chosen?: string[] | null;
  /** Where the caret was, as [start, end]. */
  caret?: [number, number];
}

export function ThreadComposer({
  products, items, engines, codexModels, codexModelDefault, defaultProduct, initial, scripted, onOpenMenu, onClose, onSent, onSending, onFailed, onOpenConversation, onReorderProjects, onNewProject, selectProject, agentMates, onToTeammate, inline = false, onWriting, handOver, statusLine,
}: {
  statusLine?: string | null;
  /** On the page: whether the keyboard is in the box or words are left in it. */
  onWriting?: (writing: boolean) => void;
  /** On the page: filled with a reading of the box, for the dialog to open on. */
  handOver?: MutableRefObject<(() => ComposeStart) | null>;
  /** Your teammates, offered in To beside the agents, and Someone new. */
  agentMates?: readonly { id: string; name: string; letter: string; role: string | null; paused?: boolean }[];
  /** Hands the words to a teammate ('new' makes one from them); an error to show, or null once it is theirs. */
  onToTeammate?: (to: string, text: string, product: string | null) => Promise<string | null>;
  products: Product[];
  items: WorkItem[];
  /** The coding agents this Mac really offers, off the snapshot. Absent means Claude Code alone. */
  engines?: Engine[];
  /** Codex's models as read off this Mac, with their own effort levels. */
  codexModels: ModelChoice[];
  codexModelDefault: string | null;
  /** The project on screen, which the card opens on ahead of the one last used. */
  defaultProduct?: string | null;
  /** Who it is to (a teammate's id) and words to start from, for a card opened from somewhere. */
  initial?: ComposeStart | null;
  /**
   * THE TUTORIAL'S OWN EXAMPLE TASK, and nothing else ever sets this.
   *
   * The walk types one task into this card and the app answers it a couple of
   * seconds later out of a pre-written line, with no session behind it
   * (main/first-run.mjs). Two things follow, and both are why the walk needed a
   * card of its own until now:
   *
   *  - IT MAY BE SENT INTO THE PRACTICE PROJECT. Every other task there is
   *    refused, because nothing in that project would pick it up and a tester
   *    hit exactly that. The walk's task is the one with something waiting for
   *    it, and `scripted` is how the card tells them apart with no guessing.
   *  - IT CARRIES A LABEL. The supervisor never spawns fresh work on a row
   *    wearing it. The label is passed in rather than imported, so this card
   *    knows nothing about the walk beyond "somebody scripted this one".
   */
  scripted?: { labels: string[] } | null;
  /** Called with a menu's name the moment it opens. The tutorial listens for `to`. */
  onOpenMenu?: (which: MenuKey) => void;
  /** Picking someone you already talk to opens that conversation instead,
   *  carrying whatever was typed into its reply box (2026-10-01: a strip of
   *  the last few lines reads badly for a conversation that is hundreds of
   *  lines long). */
  onOpenConversation?: (item: WorkItem, draft: string) => void;
  /** Opens Settings > Priority, from the "Reorder" beside the project menu's heading. */
  onReorderProjects?: () => void;
  /** Opens the New project card, from the last row of the project menu. Asked
   *  for on 2026-10-05: making a project is a thing you should be able to do
   *  from the menu you are already in, whether you have none or ten. */
  onNewProject?: () => void;
  /** A project made from that row, which the card then sends to: making one in
   *  order to file a task there and being left on the old project is a task in
   *  the wrong repository (w-abed8ae491). */
  selectProject?: string | null;
  /* NOTHING HERE OFFERS THE CHAT IMPORT, and that is a decision rather than an
     omission (w-6418318cd5, 2026-10-16). It was offered here for one round, as
     a faint line on an empty card. The founder, on the picture of it: "This
     chat really clutters a component that we use all the time so I would
     disagree with that." An offer that is only ever one letter from
     disappearing is still a line on the card every time it opens, and this
     card opens all day. ⌘K is the door. */
  onClose: () => void;
  /** Called once the send stands, with the words it took off the card (`sent.draft`) for an undo. */
  onSent: (item: WorkItem | null, sent?: ThreadSent) => void;
  /**
   * THE MOMENT SEND IS PRESSED, before anything is asked of the computer
   * (w-461fbd8d2d). Given, the caller closes the card here and says it is on
   * its way, and `onFailed` is how a send that then does not stand comes back.
   * Not given (the tutorial), the card stays up until the answer as it did.
   */
  onSending?: (p: { kind: ThreadSent['kind']; product?: string; to?: string; toMany?: string[]; runAt?: number; start?: 'later' }) => void;
  /** A send handed over with `onSending` that did not stand. The words are back in the draft. */
  onFailed?: (reason: string, p: { to?: string; also?: string[] }) => void;
  /** Drawn open on the empty inbox rather than as a dialog: no veil, To and
   *  Model as chips in the bar, and the keyboard is only its own once you are in it. */
  inline?: boolean;
}) {
  const team = useContext(TeamContext);
  const others = useMemo(() => (team ? teammates(team.state.people, team.me) : []), [team]);

  /* ------------------------------- who ---------------------------------- */
  const [recipient] = useState(() => initial?.to || initial?.mate
    ? { to: initial.to && others.some(p => p.id === initial.to) ? initial.to : 'agent', mate: initial.mate ?? null, auto: false }
    : readLastRecipient(others, agentMates, !!onToTeammate));
  const [to, setTo] = useState<string>(recipient.to);
  const person = to === 'agent' ? null : others.find((p) => p.id === to) ?? null;
  // A teammate in To, or 'new' for Someone new: it takes the words in the team chat.
  const [mate, setMate] = useState<string | null>(recipient.mate);
  const mateRow = mate && mate !== 'new' ? agentMates?.find((t) => t.id === mate) ?? null : null;
  const autoHere = autoOffered(agentMates, !!onToTeammate);
  const [auto, setAuto] = useState(recipient.auto);
  const onAuto = auto && autoHere && to === 'agent' && !mate;
  // A teammate who leaves the team while the card is open takes the To with them.
  useEffect(() => { if (to !== 'agent' && !person) setTo('agent'); }, [to, person]);
  const [query, setQuery] = useState('');
  // MORE THAN ONE PERSON (2026-10-01): one message can go to several people
  // at once. `to` is the first person; `also` is everyone added after.
  // One conversation belongs to exactly that group (main/team/index.mjs).
  const [also, setAlso] = useState<string[]>(() => initial?.also ?? []);
  const [adding, setAdding] = useState(false);
  const extra = also.map((id) => others.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const group = person ? [person, ...extra] : [];
  const names = joinNames(group.map((p) => firstName(p)));
  const found = findPeople(others, query).filter((p) => !adding || (p.id !== person?.id && !also.includes(p.id)));
  // THE CONVERSATION YOU ALREADY HAVE IS OFFERED, NEVER OPENED FOR YOU
  // (w-c34591721f). Picking a name used to jump straight into the chat and
  // throw the card away, which fired on the PICK — before the card could know
  // whether you wanted to talk or to hand over a task. So it is a note now,
  // and the press is yours. One person gets the same note a group always did.
  const convo = person ? conversationWith([person.id, ...also], { products, items, me: team?.me ?? null }) : null;

  // SEND AS: a task or a message (w-c34591721f, approved 2026-10-17). A card
  // addressed to a person starts as a message, which is what it has always
  // made; a task is the thing you now say out loud.
  const [sendAs, setSendAs] = useState<SendAs>(() => initial?.sendAs ?? 'message');
  const [due, setDue] = useState<string | null>(() => initial?.due ?? null);
  // An agent has no Send As, so going back to one puts both away rather than
  // leaving a day on a card that cannot carry it.
  useEffect(() => { if (!person) { setSendAs('message'); setDue(null); } }, [person]);
  const rows = mate ? [] : headRows({ person: !!person, kind: sendAs });

  /* ------------------------------ words --------------------------------- */
  const opened = useRef(openingComposeDraft());
  const [text, setText] = useState(() => initial?.body || opened.current.text || '');
  const [attachments, setAttachments] = useState<PendingAttachment[]>(() => opened.current.attachments);
  const [dropped, setDropped] = useState(0);

  /* ----------------------------- project -------------------------------- */
  const offered = useMemo(() => projectsOffered(products), [products]);
  const [productSlug, setProductSlug] = useState<string | null>(() => {
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(LAST_PRODUCT_KEY); } catch { /* a refused store opens on the first */ }
    return startingProject(offered, { defaultProduct, remembered })?.slug ?? null;
  });
  const product = offered.find((p) => p.slug === productSlug) ?? startingProject(offered, { defaultProduct, remembered: null });
  const pickProject = (slug: string) => {
    setProductSlug(slug);
    try { localStorage.setItem(LAST_PRODUCT_KEY, slug); } catch { /* still picked for this card */ }
  };
  // The card is already open, so the remembered slot it read on opening is of
  // no use: the project made from its own menu arrives here.
  useEffect(() => { if (selectProject) pickProject(selectProject); }, [selectProject]);

  /* ---------------------------- priority -------------------------------- */
  // Every new thread opens on Medium; only a half-written card keeps its tag
  // (../priority.ts says why the last pick is no longer carried over).
  const [prio, setPrio] = useState<PriorityId | null>(() => startingPriority(opened.current.priority));
  const prioShown: PriorityId = prio ?? 'medium';
  const pickPrio = (id: PriorityId) => { setPrio(id); };

  /* --------------------------- visibility ------------------------------- */
  // A NEW THREAD STARTS WHERE ITS PROJECT IS, AND WHO SEES IT IS STILL CHOSEN
  // FOR THAT THREAD (w-b989839656, approved 2026-10-05). The project's
  // setting is the default, never a lock: the chip follows the project until
  // you pick a word yourself, so moving a card from a Just you project into a
  // team one turns it to Team, and your pick then stands. (It was remembered
  // per project from your last pick for a while, and a tester found the next
  // thread silently Private; a setting you made on the project is not that.)
  // AND IT MAY BE A FEW PEOPLE RATHER THAN THE TEAM (w-41ff964775). Chosen
  // people opens the
  // same picker the To field uses, and the pick stands only while somebody is
  // on the list; with nobody on it the thread is sent Private, because that is
  // who can see it (composer-rules.ts `sharingFields`).
  const [picked, setPicked] = useState<Visibility | null>(() => initial?.visibility ?? null);
  const visibility: Visibility = picked ?? startingVisibility(product);
  const [chosenPicked, setChosen] = useState<string[] | null>(() => initial?.chosen ?? null);
  const chosen = chosenPicked ?? (picked ? [] : startingChosen(product));
  const [visPage, setVisPage] = useState<'rows' | 'people'>('rows');
  const pickVisibility = (v: Visibility) => { setPicked(v); };
  const toggleChosen = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id]);
  // Anyone who leaves the team comes off the list with them.
  const chosenHere = chosen.filter((id) => others.some((p) => p.id === id));

  /* ------------------------------ model --------------------------------- */
  const engineRows = engines?.length ? engines : [ENGINES[0]];
  const codexOffered = engineRows.some((e) => e.id === 'codex');
  const claudeOffered = engineRows.some((e) => e.id === 'claude');
  const codexDefault = codexModelDefault ?? null;
  const modelOpts = { codexModels, codexDefault };
  const remembered = (): ModelPick => {
    const engine: Harness = startingEngine(readLastEngine(), engines);
    return { engine, model: readLastModel(undefined, engine, codexDefault) ?? defaultModelFor(engine, codexDefault) };
  };
  const [pick, setPick] = useState<ModelPick>(remembered);
  // A Codex pick on a Mac that stopped offering Codex goes back to Claude Code,
  // the rule the old card followed: a word this Mac cannot run is not held.
  useEffect(() => {
    if (pick.engine === 'codex' && !codexOffered) setPick({ engine: 'claude', model: readLastModel(undefined, 'claude') ?? defaultModelFor('claude') });
    // And the other way (w-db6f5e331e): a Mac with Codex and no Claude Code.
    if (pick.engine === 'claude' && !claudeOffered && codexOffered) setPick({ engine: 'codex', model: readLastModel(undefined, 'codex', codexDefault) ?? defaultModelFor('codex', codexDefault) });
  }, [codexOffered, claudeOffered]);
  const [effort, setEffort] = useState<string | null>(() => readLastEffort(undefined, pick.engine));
  const pickModel = (p: ModelPick) => {
    setPick(p);
    writeLastEngine(p.engine);
    writeLastModel(p.model, undefined, p.engine, codexDefault);
    if (p.engine !== pick.engine) setEffort(readLastEffort(undefined, p.engine));
  };
  const effortRows = effortChoicesFor(pick.engine, pick.model, modelOpts);
  const effortLit = effortShown(effort, effortRows, defaultEffortFor(pick.engine, pick.model, modelOpts));
  // Toggled against HER pick, not against what is lit, the way the old drawer
  // did it (components/Model.tsx says why).
  const pickEffort = (id: string) => {
    const next = id === effort ? null : id;
    setEffort(next);
    writeLastEffort(next, undefined, pick.engine);
  };
  const labelOf = (p: ModelPick) => engineModelLabel(p.engine, p.model, modelOpts);
  // WHO IS ABOUT TO GET THIS, by name, and the rows To offers. Both are empty
  // words on a Mac with one coding agent, where they read exactly as before.
  const agents = agentChoices(engineRows);
  const engineTags = agents.length > 0;
  const chooseAgent = (engine: Harness) => {
    pickModel({ engine, model: readLastModel(undefined, engine, codexDefault) ?? defaultModelFor(engine, codexDefault) });
  };
  const recent = useMemo(
    () => recentModels(items, { codexModels, codexDefault, codexOffered, claudeOffered }),
    [items, codexModels, codexDefault, codexOffered, claudeOffered],
  );
  const every = useMemo(() => allModels({ codexModels, codexOffered, claudeOffered }), [codexModels, codexOffered, claudeOffered]);
  const more = moreCount(recent, every);

  /* ------------------------------ menus --------------------------------- */
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [modelPage, setModelPage] = useState<'recent' | 'all'>('recent');
  const [laterPage, setLaterPage] = useState<'list' | 'repeat'>('list');
  const [laterText, setLaterText] = useState('');
  const [repeatText, setRepeatText] = useState('');
  const anchors = useRef<Partial<Record<MenuKey, HTMLElement | null>>>({});
  const anchor = (key: MenuKey) => (el: HTMLElement | null) => { anchors.current[key] = el; };
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const named = useThreadMentions({ text, setText, input: textRef, threads: items });

  const toggle = (key: MenuKey) => {
    // WHICH LIST WAS OPENED, for the one caller that needs to know: the
    // tutorial's beat about who a thread is for ends when the To list is really
    // open, the way every other beat ends on the thing it asked for actually
    // happening rather than on a Next. Nothing else passes this.
    setOpen((o) => { const next = o === key ? null : key; if (next) onOpenMenu?.(next); return next; });
    setModelPage('recent');
    setLaterPage('list');
    // Who sees it opens on its three rows, even if the picker was last open.
    setVisPage('rows');
    setLaterText('');
    setRepeatText('');
    setQuery('');
  };
  // A pick puts the caret back in the message, where she was going anyway. An
  // Escape puts it back on the control she opened, so a second Escape is the
  // one that closes the card.
  const close = (back: 'text' | 'trigger') => {
    const key = open;
    setOpen(null);
    if (back === 'text') textRef.current?.focus();
    else if (key) anchors.current[key]?.querySelector<HTMLElement>('[data-trigger]')?.focus();
  };

  // Pointerdown, not click, the same as every menu in this app: a press aimed
  // at the message should close the menu AND land the caret, not be eaten.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!anchors.current[open]?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // Kept inside the window, and the keyboard lands on the row she is on.
  useLayoutEffect(() => {
    if (!open) return;
    const menu = anchors.current[open]?.querySelector<HTMLElement>(':scope > .tc-menu');
    if (!menu) return;
    fitMenu(menu);
    const target = menu.querySelector<HTMLElement>('[data-item].on') ?? menu.querySelector<HTMLElement>('[data-item]');
    target?.focus({ preventScroll: true });
  }, [open, modelPage, laterPage, visPage]);
  useLayoutEffect(() => {
    if (!open) return;
    const menu = anchors.current[open]?.querySelector<HTMLElement>(':scope > .tc-menu');
    if (menu) fitMenu(menu);
  }, [query, laterText, repeatText]);

  const menuKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('trigger'); return; }
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-item]:not([disabled])')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[(at + 1) % rows.length]?.focus(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); rows[at <= 0 ? rows.length - 1 : at - 1]?.focus(); return; }
    // Typing on a row of the To menu types into "Find a person", and on a row
    // of Send later into the time box.
    const find = e.currentTarget.querySelector<HTMLInputElement>('.tc-find, .tc-when');
    if (find && t !== find && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) find.focus();
  };
  const hover = (e: React.PointerEvent<HTMLElement>) => {
    if (document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
  };
  const triggerKeys = (key: MenuKey) => (e: React.KeyboardEvent) => {
    if (open !== key && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); toggle(key); }
  };

  /* ------------------------------ draft --------------------------------- */
  // On every keystroke, every paste, every pick, the same draft the old card
  // kept, so an Escape or a reload never takes her words or her pictures.
  useEffect(() => {
    const draft = { text, attachments, priority: prio, when: { runAt: 0, repeat: null }, dropped: 0 };
    // A card opened while the last send is in flight starts empty, and must not
    // wipe the copy that send keeps until it lands (`openingComposeDraft`).
    if (composeDraftIsEmpty(draft) && readComposeDraft().sendingAt) return;
    const stored = saveComposeDraft(draft);
    setDropped(stored.dropped);
  }, [text, attachments, prio]);

  // A LAYOUT EFFECT, SO THE CARD HAS THE KEYBOARD BEFORE THE NEXT KEYSTROKE.
  // N opens the card inside a keydown; a passive effect is scheduled and can
  // land after the key behind it has already been dispatched, and that key goes
  // nowhere. It is how "Task" arrived in the box as "ask" (w-abed8ae491).
  useLayoutEffect(() => {
    if (inline) return;
    const t = textRef.current;
    if (!t) return;
    t.focus();
    const [from, to] = initial?.caret ?? [t.value.length, t.value.length];
    t.setSelectionRange(from, to);
  }, []);
  // On the page the box is one line until the words need more.
  useLayoutEffect(() => {
    const t = textRef.current;
    if (!inline || !t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 240)}px`;
  }, [inline, text]);

  /* ----------------------------- the keyboard ----------------------------- */
  // Every character belongs to the message, wherever the keyboard is sitting;
  // `keyOnTheNewThreadCard` holds the rule and what it is for. It listens on
  // the window rather than on the card because a click on the card's own
  // padding leaves the keyboard on BODY, which is not inside the card, and a
  // handler on the card never hears a key pressed there.
  const card = useRef<HTMLDivElement>(null);
  const caretTo = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = caretTo.current;
    const box = textRef.current;
    if (at === null || !box) return;
    caretTo.current = null;
    box.focus();
    box.setSelectionRange(at, at);
  });
  // The character lands where the caret was, which a text field remembers
  // after it has been blurred.
  const typeIntoTheMessage = (ch: string) => {
    const box = textRef.current;
    const from = box ? box.selectionStart : text.length;
    const to = box ? box.selectionEnd : text.length;
    setText(text.slice(0, from) + ch + text.slice(to));
    caretTo.current = from + ch.length;
  };
  const typing = useRef(typeIntoTheMessage);
  typing.current = typeIntoTheMessage;
  const menuUp = useRef(open);
  menuUp.current = open;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const at = document.activeElement as HTMLElement | null;
      const where: Keyboard = !at || at === document.body ? 'nothing'
        : at.tagName === 'TEXTAREA' || at.tagName === 'INPUT' || at.isContentEditable ? 'a field'
          : card.current?.contains(at) ? 'the card' : 'away';
      const means = keyOnTheNewThreadCard({
        key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, menuOpen: !!menuUp.current, on: where, inline,
      });
      if (means !== 'the message') return;
      // Before the button under it hears it: Space and Enter on a focused
      // button are a press, and on Send that press is the half-written task.
      e.preventDefault();
      typing.current(e.key === 'Enter' ? '\n' : e.key);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // Long project names fade rather than end in an ellipsis, which was turned
  // down twice on the old card; only a name that really overflows fades.
  const projName = useRef<HTMLSpanElement>(null);
  const [projCut, setProjCut] = useState(false);
  useLayoutEffect(() => {
    const el = projName.current;
    if (el) setProjCut(el.scrollWidth > el.clientWidth + 0.5);
  }, [product?.name, person]);

  /* ------------------------------- send --------------------------------- */
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // THE TUTORIAL'S SEND CAN NEVER BE A DEAD END (w-9f6975906c, 2026-10-05).
  // Her screenshot: the tutorial's card open with an empty box, so Send stayed
  // off and she was stuck for fifteen minutes. If the practice text did not
  // arrive, Send sends it anyway.
  const typed = !text.trim() && scripted && !person ? `${PRACTICE_TASK.title}\n\n${PRACTICE_TASK.body}` : text;
  const message = threadMessage(typed, person ? [] : attachments, named);
  const refusal = person ? null : practiceRefusal(product, { scripted: !!scripted });
  // The other reason Send can be off: there is no project to send to at all
  // (w-f8d123be62). It gets a line in the bar rather than a tooltip, because
  // the whole fault was that nothing on screen said anything.
  const stopper = noProjectYet(product, { person: !!person, noComputer: onCloudPhone() });
  // A task needs somewhere to live whoever it is for, so a task to a person
  // is held to the task's bar, not the message's.
  const asMessage = !!person && sendAs === 'message';
  const canSend = !sending && (asMessage ? !!text.trim() || attachments.length > 0 : !!message && !!product && !refusal);

  // The dialog closes on Send; the box on the page stays, so it empties. The
  // send goes on with the words it already took, and a failed one reopens them
  // in the dialog (`onFailed`).
  const emptyForTheNext = () => { setText(''); setAttachments([]); setSending(false); };

  const sendTask = async (when: { runAt?: number; start?: 'later'; repeat?: { every: 'day' | 'weekday' | 'week'; on?: number; at: string } } = {}) => {
    // A teammate takes the words in the team chat rather than as a thread.
    if (mate) { void sendToTeammate(); return; }
    if (!canSend || !product || !message) return;
    setSending(true);
    setError(null);
    setOpen(null);
    // HANDED OVER BEFORE ANYTHING IS ASKED OF THE COMPUTER (w-461fbd8d2d). The
    // card used to sit here, words and all, until the answer came back: a few
    // milliseconds on the desktop and a relay round trip on a phone, which read
    // as Send not having worked. The words come off the card now and go with
    // the send, for Z, and back onto it if the send does not stand.
    //
    // The written-down copy stays until something answers (`dropComposeDraft`).
    const taken = markComposeDraftSending();
    try { localStorage.setItem(LAST_PRODUCT_KEY, product.slug); } catch { /* the send still stands */ }
    onSending?.({ kind: when.repeat ? 'repeat' : 'task', product: product.slug, ...(when.runAt ? { runAt: when.runAt } : {}), ...(when.start ? { start: when.start } : {}) });
    if (inline) emptyForTheNext();
    try {
      const attached = await persistAttachments(product.slug, attachments);
      const body = [message.body, attached].filter(Boolean).join('\n\n');
      // A TASK GIVEN TO A PERSON RUNS ON NOBODY (w-c34591721f). `assignee`
      // already holds every agent off, on every Mac (shared/team-rules.mjs),
      // so sending a model with it would be a model nothing will ever use.
      const given = person ? taskFields({ personId: person.id, due }) : null;
      const harness = given ? {} : harnessFields({
        engine: pick.engine, model: pick.model,
        effort: effortPicked(effort, effortRows) ? effort : null,
        engineCount: engineRows.length, codexDefault,
      });
      const priority = prio ? priorityValueOf(prio) : 5;
      if (when.repeat) {
        // A repeating task is a rule, not a work item, so it goes down the same
        // separate path the old card's did, with the model and engine beside it.
        const rule = await api.composeRepeat({
          product: product.slug, title: message.title, body: body || undefined, priority, rule: when.repeat,
          ...(harness.engine ? { engine: harness.engine } : {}), ...(harness.model ? { model: harness.model } : {}),
        });
        dropComposeDraft(taken);
        onSent(null, { kind: 'repeat', product: product.slug, title: message.title, ruleId: rule?.id, draft: taken });
      } else {
        const made = await api.compose({
          product: product.slug, title: message.title, body: body || undefined, kind: 'directive', priority,
          ...(when.runAt ? { runAt: when.runAt } : {}),
          // ADD IT TO LATER: the thread is written down and nothing starts it
          // until she does (w-afb66e6661). The one row on this menu with no
          // clock in it, and the only one that answers "I am not ready yet".
          ...(when.start ? { start: when.start } : {}),
          ...harness,
          ...(given ?? {}),
          ...(team ? sharingFields(visibility, chosenHere) : {}),
          ...(onAuto ? { labels: [AUTO_LABEL] } : {}),
          // The tutorial's own task, and only ever that one. See `scripted`.
          ...(scripted ? { labels: scripted.labels } : {}),
        });
        dropComposeDraft(taken);
        onSent(made, { kind: 'task', product: product.slug, title: message.title, draft: taken, ...(when.runAt ? { runAt: when.runAt } : {}), ...(when.start ? { start: when.start } : {}) });
      }
    } catch (err) {
      // Every word goes back: a send that failed and also ate what she wrote
      // is two failures, and the second is the expensive one. With the card
      // already closed, the caller reopens it on them. Ordinarily they are
      // still written down and this declines, which is the same thing.
      restoreComposeDraft(taken);
      const said = `Not sent: ${String((err as Error)?.message ?? err)}`;
      if (onFailed) { onFailed(said, {}); return; }
      setError(said);
      setSending(false);
    }
  };

  const sendMessage = async () => {
    if (!canSend || !person) return;
    setSending(true);
    setError(null);
    // Handed over at once, as a task is, and the written-down copy kept until
    // the cloud answers (sendTask above).
    const taken = markComposeDraftSending();
    const toMany = extra.length ? [person.id, ...also] : undefined;
    onSending?.({ kind: 'message', to: person.id, ...(toMany ? { toMany } : {}) });
    if (inline) emptyForTheNext();
    const failed = (said: string) => {
      restoreComposeDraft(taken);
      if (onFailed) { onFailed(said, { to: person.id, ...(also.length ? { also } : {}) }); return; }
      setError(said);
      setSending(false);
    };
    // THE LEVEL GOES WITH THE WORDS (w-7ba439c883): it decides where the
    // message sits in the inbox it lands in. Only on the first message of a
    // conversation, which is the main process's rule, not this card's.
    //
    // A LEVEL NOBODY PICKED IS NOT SENT, and the chip reads Medium either way.
    // The two land in the same place, because an unsent level is composeItem's
    // 0 and the inbox reads 0 as Medium. What it keeps is the other Mac's own
    // reading of the message (main/message-priority.mjs): a level the sender
    // chose is theirs and is left alone, and a message nobody ranked is still
    // sorted there rather than arriving flat.
    let res: Awaited<ReturnType<typeof api.teamMessage>>;
    try {
      res = await api.teamMessage(
        toMany ?? person.id,
        named.encode(text.trim()),
        prio ? priorityValueOf(prio) : undefined,
        attachments.map(({ name, dataBase64, srcPath }) => ({ name, dataBase64, srcPath })),
      );
    } catch (err) {
      failed(`Not sent: ${String((err as Error)?.message ?? err)}`);
      return;
    }
    if (!res.ok) {
      failed(`Not sent: ${res.error ?? 'the team cloud did not answer.'}`);
      return;
    }
    dropComposeDraft(taken);
    onSent(null, { kind: 'message', to: person.id, draft: taken, ...(toMany ? { toMany } : {}), ...(res.made ? { made: res.made } : {}) });
  };

  // Send As decides which of the two a person gets: a task is a row in a
  // project with their name on it, a message goes on the end of the
  // conversation the two of you already have (main/team/index.mjs).
  const sendToTeammate = async () => {
    const words = text.trim();
    if (!mate || !words || sending || !onToTeammate) return;
    setSending(true);
    setError(null);
    const taken = markComposeDraftSending();
    const err = await onToTeammate(mate, words, product?.slug ?? null);
    setSending(false);
    if (err) { restoreComposeDraft(taken); setError(err); }
    else { dropComposeDraft(taken); setText(''); onClose(); }
  };
  const send = () => (person && sendAs === 'message' ? sendMessage() : sendTask());
  const talk = useWebDictation({ text, setText, field: textRef }, () => void send());
  // ⌘↵ SENDS WHEREVER THE CURSOR IS while the card is open (w-9f6975906c).
  // It used to be heard only inside the card, so once a menu or a click had
  // taken focus out of it the key did nothing: "Command+Enter in the tutorial
  // isn't working so the only thing I can do is hit Skip". The card's own
  // handler still runs first and marks the press handled, so it never sends twice.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    // On the page the card's own onKeyDown hears ⌘↵ inside it, and outside it
    // the key is not the card's.
    if (inline) return;
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      e.preventDefault();
      void sendRef.current();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    const got = await collectFiles(files);
    if (got.length) setAttachments((a) => [...a, ...got]);
  };

  /* ------------------------------- menus -------------------------------- */
  const chooseTo = (id: string) => {
    if (adding && person && id !== 'agent') {
      if (id !== person.id && !also.includes(id)) setAlso((was) => [...was, id]);
      setAdding(false); setQuery(''); close('text');
      return;
    }
    setAdding(false);
    setMate(null);
    setAuto(false);
    writeLastRecipient({ to: id, mate: null, auto: false });
    setTo(id); setAlso([]); setError(null); close('text');
  };
  const chooseMate = (id: string) => { setAdding(false); setAuto(false); setTo('agent'); setAlso([]); setMate(id); writeLastRecipient({ to: 'agent', mate: id, auto: false }); setError(null); close('text'); };
  const chooseAuto = () => { setAdding(false); setMate(null); setTo('agent'); setAlso([]); setAuto(true); writeLastRecipient({ to: 'agent', mate: null, auto: true }); setError(null); close('text'); };

  const toMenu = (
    <div className="tc-menu tc-drop tc-to-menu" role="listbox" aria-label="To" onKeyDown={menuKeys}>
      {!adding && autoHere && (
        <button type="button" data-item className={`tc-row ${onAuto ? 'on' : ''}`} onPointerEnter={hover} onClick={chooseAuto}>
          <AutoFace /><span className="tc-row-label">Auto</span><small className="tc-row-aside">picks who when you send</small>
        </button>
      )}
      {/* ONE ROW PER AGENT WHERE THIS MAC HAS TWO, and the one row it has
          always drawn where it has one. Picking an agent is picking where the
          task runs, so it moves the model with it (`chooseAgent`). */}
      {!adding && (agents.length
        ? agents.map((a) => (
          <button key={a.id} type="button" data-item className={`tc-row ${!person && !mate && !onAuto && pick.engine === a.id ? 'on' : ''}`}
            onPointerEnter={hover} onClick={() => { chooseAgent(a.id); chooseTo('agent'); }}>
            <AgentFace /><span className="tc-row-label">{a.label}</span>
          </button>
        ))
        : (
          <button type="button" data-item className={`tc-row ${person || mate || onAuto ? '' : 'on'}`} onPointerEnter={hover} onClick={() => chooseTo('agent')}>
            <AgentFace /><span className="tc-row-label">Agent</span>
          </button>
        ))}
      {!adding && agentMates && onToTeammate && (<>
        <span className="tc-sep" />
        <span className="tc-menu-head">Teammates</span>
        {agentMates.map((t) => (
          <button key={t.id} type="button" data-item className={`tc-row ${mate === t.id ? 'on' : ''}`} onPointerEnter={hover} onClick={() => chooseMate(t.id)}>
            <TeammateMark t={t} /><span className="tc-row-label">{t.name}</span>{t.role && <small className="tc-row-aside">{t.role}</small>}
          </button>
        ))}
        <button type="button" data-item className={`tc-row ${mate === 'new' ? 'on' : ''}`} onPointerEnter={hover} onClick={() => chooseMate('new')}>
          <i className="tq tq-sm tq-hash" aria-hidden="true">+</i><span className="tc-row-label">Someone new</span><small className="tc-row-aside">makes a teammate for this</small>
        </button>
      </>)}
      {team && others.length > 0 && (<>
        {!adding && <span className="tc-sep" />}
        <span className="tc-menu-head">People</span>
        <input
          data-item
          className="tc-find"
          placeholder="Find a person"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && query.trim() && found[0]) { e.preventDefault(); chooseTo(found[0].id); } }}
        />
        {found.map((p) => (
          <button key={p.id} type="button" data-item className={`tc-row ${to === p.id ? 'on' : ''}`} onPointerEnter={hover} onClick={() => chooseTo(p.id)}>
            <Face person={p} /><span className="tc-row-label">{p.name}</span>
          </button>
        ))}
        {!found.length && <span className="tc-none">Nobody on the team matches that.</span>}
      </>)}
    </div>
  );

  const engineLabel = (id: string) => engineRows.find((e) => e.id === id)?.label ?? ENGINES.find((e) => e.id === id)?.label ?? id;

  // The menu itself is ./ModelMenu.tsx, which the reply box draws too.
  const modelMenu = (
    <ModelMenu
      className="tc-menu tc-drop tc-model-menu"
      page={modelPage}
      onPage={setModelPage}
      recent={recent}
      every={every}
      more={more}
      pick={pick}
      onPick={(p) => { pickModel(p); close('text'); }}
      labelOf={labelOf}
      engineLabel={engineLabel}
      engineTags={engineTags}
      effortRows={effortRows}
      effortLit={effortLit}
      onEffort={pickEffort}
      onKeyDown={menuKeys}
      onHover={hover}
    />
  );

  // IS THIS A TASK OR A MESSAGE. Two rows, in the head's own menu, because
  // the head is where the card already answers what a thread IS. Picking
  // Message puts the day away: a message has nothing to be due.
  const sendAsMenu = (
    <div className="tc-menu tc-drop" role="listbox" aria-label="Send As" onKeyDown={menuKeys}>
      {(['message', 'task'] as SendAs[]).map((k) => (
        <button key={k} type="button" data-item className={`tc-row ${sendAs === k ? 'on' : ''}`} onPointerEnter={hover}
          onClick={() => { setSendAs(k); if (k === 'message') setDue(null); close('text'); }}>
          <span className="tc-row-label">{k === 'task' ? 'Task' : 'Message'}</span>
        </button>
      ))}
    </div>
  );

  // THE DAY, AND THE WAY OUT OF HAVING ONE. "No Deadline" sits first because
  // most tasks never carry a day, and the row has to read as an answer rather
  // than as a field somebody forgot (w-c34591721f).
  const dueOnMenu = (
    <div className="tc-menu tc-drop" role="listbox" aria-label="Due On" onKeyDown={menuKeys}>
      {dueChoices().map((c) => (
        <button key={c.key ?? 'none'} type="button" data-item className={`tc-row ${c.key === due ? 'on' : ''}`} onPointerEnter={hover}
          onClick={() => { setDue(c.key); close('text'); }}>
          <span className="tc-row-label">{c.label}</span>
        </button>
      ))}
    </div>
  );

  const projectMenu = (
    <div className="tc-menu tc-rise" role="listbox" aria-label="Project" onKeyDown={menuKeys}>
      {/* THE LIST IS ALREADY IN PRIORITY ORDER, AND NOW IT SAYS SO, with the
          way to change it beside the words. The drag that used to live in this
          menu was the only way to set the order and almost nobody found it;
          the order now has its own page in Settings, and this is its door. */}
      {onReorderProjects ? (
        <span className="tc-menu-head tc-head-split">
          <span>By priority</span>
          {/* The card closes behind it; the draft is saved on every keystroke,
              so it is all still there next time the card opens. */}
          <button type="button" className="tc-head-link" onClick={onReorderProjects}>Reorder</button>
        </span>
      ) : <span className="tc-menu-head">Project</span>}
      {offered.map((p) => (
        <button key={p.slug} type="button" data-item className={`tc-row ${p.slug === product?.slug ? 'on' : ''}`} onPointerEnter={hover}
          onClick={() => { pickProject(p.slug); close('text'); }}>
          <Swatch slug={p.slug} /><span className="tc-row-label">{p.name}</span>
        </button>
      ))}
      {/* MAKING A PROJECT IS A THING YOU CAN DO FROM HERE, ALWAYS (approved
          2026-10-05). Not only when the list is empty: somebody with ten
          projects who wants an eleventh is in this menu too, and the old
          answer was to close the card and go to Settings. The hairline is what
          keeps it from reading as a twelfth project. */}
      {onNewProject && (<>
        {offered.length > 0 && <span className="tc-menu-rule" />}
        <button type="button" data-item className="tc-row tc-new-project" onPointerEnter={hover}
          onClick={() => { close('text'); onNewProject(); }}>
          <PlusIcon /><span className="tc-row-label">New project</span>
        </button>
      </>)}
    </div>
  );

  const priorityMenu = (
    <div className="tc-menu tc-rise tc-narrow" role="listbox" aria-label="Priority" onKeyDown={menuKeys}>
      <span className="tc-menu-head">Priority</span>
      {PRIORITIES.map((p) => (
        <button key={p.id} type="button" data-item className={`tc-row ${p.id === prioShown ? 'on' : ''}`} onPointerEnter={hover}
          onClick={() => { pickPrio(p.id); close('text'); }}>
          <PrioGlyph id={p.id} /><span className="tc-row-label">{p.label}</span>
        </button>
      ))}
    </div>
  );

  /* ONE CHIP, DRAWN IN BOTH BARS (w-7ba439c883). A task and a message both
     carry a level now, so the trigger is written once here rather than twice in
     the bars below: two copies of the same four words is how the composer and
     the reply dock drifted apart the first time (components/Priority.tsx). */
  const priorityChip = (
    <span className="tc-anchor" ref={anchor('priority')}>
      <button type="button" data-trigger className={`tc-chip ${open === 'priority' ? 'open' : ''}`} title="Priority"
        aria-haspopup="listbox" aria-expanded={open === 'priority'} onClick={() => toggle('priority')} onKeyDown={triggerKeys('priority')}>
        <PrioGlyph id={prioShown} />{priorityLabelOf(prioShown)}
      </button>
      {open === 'priority' && priorityMenu}
    </span>
  );

  // WHO SEES IT: three rows, and Chosen people turns the menu into the same
  // people list the To field uses. Ticking a name stays open (she is naming a
  // few people, and closing on the first makes her open it three times); Done
  // closes it. The row under it says who it reaches as she builds the list.
  const visiblePeople = findPeople(others, query);
  const visibilityMenu = (
    <div className="tc-menu tc-rise tc-vis-menu" role="listbox" aria-label="Who sees it" onKeyDown={menuKeys}>
      {visPage === 'rows' ? (<>
        <span className="tc-menu-head">Who sees it</span>
        {VISIBILITY_ROWS.map((v) => (
          <button key={v.id} type="button" data-item className={`tc-row tc-two ${v.id === visibility ? 'on' : ''}`} onPointerEnter={hover}
            onClick={() => {
              pickVisibility(v.id);
              if (v.id === 'people') setVisPage('people');
              else close('text');
            }}>
            {/* The same people mark for both shared rows: the words say how
                widely, and a second invented glyph would say it twice. */}
            {v.id === 'private' ? <LockIcon /> : <PeopleIcon />}
            <span className="tc-row-label">
              {v.label}
              <small>{v.id === 'people' && chosenHere.length ? `${chosenWords(chosenHere, others)} see its summary.` : v.line}</small>
            </span>
          </button>
        ))}
      </>) : (<>
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => setVisPage('rows')}>
          <span className="tc-row-label">‹ Who sees it</span>
        </button>
        <span className="tc-sep" />
        <span className="tc-menu-head">People who see it</span>
        <input
          data-item
          className="tc-find"
          placeholder="Find a person"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && query.trim() && visiblePeople[0]) { e.preventDefault(); toggleChosen(visiblePeople[0].id); } }}
        />
        {visiblePeople.map((p) => (
          <button key={p.id} type="button" data-item role="option" aria-selected={chosen.includes(p.id)}
            className={`tc-row ${chosen.includes(p.id) ? 'on' : ''}`} onPointerEnter={hover} onClick={() => toggleChosen(p.id)}>
            <Face person={p} /><span className="tc-row-label">{p.name}</span>{chosen.includes(p.id) && <small>✓</small>}
          </button>
        ))}
        {!visiblePeople.length && <span className="tc-none">Nobody on the team matches that.</span>}
        {!chosenHere.length && <span className="tc-none">Pick a person, or nobody but you will see it.</span>}
      </>)}
    </div>
  );

  const now = Date.now();
  const tomorrow = tomorrowMorning(now);
  const monday = mondayMorning(now);
  const typedAt = momentFromWords(laterText, now);
  const typedRule = readRule(repeatText);
  const laterMenu = (
    <div className="tc-menu tc-rise tc-right tc-wide" role="menu" aria-label="Send later" onKeyDown={menuKeys}>
      {laterPage === 'list' ? (<>
        <span className="tc-menu-head">Send later</span>
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => sendTask({ start: 'later' })}>
          <ClockIcon /><span className="tc-row-label">Add it to Later</span>
        </button>
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => sendTask({ runAt: tomorrow })}>
          <ClockIcon /><span className="tc-row-label">Tomorrow morning</span><small>{laterHint(tomorrow)}</small>
        </button>
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => sendTask({ runAt: monday })}>
          <ClockIcon /><span className="tc-row-label">Monday morning</span><small>{laterHint(monday)}</small>
        </button>
        {/* A TIME IN WORDS, where a browser date field used to be: the same
            grammar as the Schedule box on a thread. Typing on any row above
            lands here (menuKeys). */}
        <span className="tc-pick">
          <ClockIcon />
          <input
            data-item
            className="tc-when"
            placeholder="Or type: 3h, fri 6pm, tomorrow 9am"
            aria-label="Send at a time you type"
            value={laterText}
            onChange={(e) => setLaterText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && typedAt) { e.preventDefault(); sendTask({ runAt: typedAt.ts }); } }}
          />
          {laterText.trim() && (typedAt
            ? <button type="button" data-item className="tc-schedule" onClick={() => sendTask({ runAt: typedAt.ts })}>{typedAt.hint}</button>
            : <small className="tc-when-no">Not a time yet</small>)}
        </span>
        <span className="tc-sep" />
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => setLaterPage('repeat')}>
          <RepeatIcon /><span className="tc-row-label">Repeat it</span>
        </button>
      </>) : (<>
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => setLaterPage('list')}>
          <span className="tc-row-label">‹ Send later</span>
        </button>
        <span className="tc-sep" />
        <span className="tc-menu-head">Repeat it</span>
        {repeatPresets(now).filter((r) => r.rule).map((r) => (
          <button key={r.label} type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => sendTask({ repeat: r.rule! })}>
            <RepeatIcon /><span className="tc-row-label">{r.label}</span>
          </button>
        ))}
        {/* A RULE IN WORDS, the way the page before takes a time: three
            presets were the only rules this page could set. Typing on a row
            above lands here (menuKeys). */}
        <span className="tc-pick">
          <RepeatIcon />
          <input
            data-item
            className="tc-when"
            placeholder="Or type: every day 5pm, fridays 4pm"
            aria-label="Repeat on a rule you type"
            value={repeatText}
            onChange={(e) => setRepeatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typedRule && 'rule' in typedRule) { e.preventDefault(); sendTask({ repeat: typedRule.rule }); }
            }}
          />
          {repeatText.trim() && (typedRule && 'rule' in typedRule
            ? <button type="button" data-item className="tc-schedule" onClick={() => sendTask({ repeat: typedRule.rule })}>{typedRule.label[0].toUpperCase() + typedRule.label.slice(1)}</button>
            : <small className="tc-when-no">{typedRule ? 'Can’t repeat that' : 'Not a repeat yet'}</small>)}
        </span>
      </>)}
    </div>
  );

  /* ------------------------------- card --------------------------------- */
  // Each head field is a labelled row on the dialog and a chip at the front of
  // the bar on the page.
  const trigger = (key: MenuKey) => `${inline ? 'tc-chip' : 'tc-word'} ${open === key ? 'open' : ''}`;
  const fields: { label: string; node: ReactNode }[] = [
    { label: 'To', node: (
      <span className="tc-anchor" ref={anchor('to')}>
        <button type="button" data-trigger className={trigger('to')} aria-haspopup="listbox" aria-expanded={open === 'to'}
          onClick={() => toggle('to')} onKeyDown={triggerKeys('to')}>
          {mate ? (mateRow ? <TeammateMark t={mateRow} /> : <i className="tq tq-sm tq-hash" aria-hidden="true">+</i>) : person ? <Face person={person} /> : inline ? null : onAuto ? <AutoFace /> : <AgentFace />}
          <span className="tc-word-text">{mate ? mateRow?.name ?? 'Someone new' : person ? person.name : onAuto ? 'Auto' : agentWordFor(engineRows, pick.engine)}</span>
        </button>
        {extra.map((p) => (
          <span key={p.id} className="tc-also">
            <Face person={p} />{p.name}
            <button type="button" aria-label={`Remove ${p.name}`} title={`Remove ${p.name}`} onClick={() => setAlso((was) => was.filter((x) => x !== p.id))}>×</button>
          </span>
        ))}
        {person && others.length > group.length && (
          <button type="button" className="tc-add" aria-label="Add someone" title="Add someone"
            onClick={() => { setAdding(true); setQuery(''); if (open !== 'to') toggle('to'); }}>+</button>
        )}
        {open === 'to' && toMenu}
      </span>
    ) },
    ...(rows.includes('sendAs') ? [{ label: 'Send As', node: (
      <span className="tc-anchor" ref={anchor('sendAs')}>
        <button type="button" data-trigger className={trigger('sendAs')} aria-haspopup="listbox" aria-expanded={open === 'sendAs'}
          onClick={() => toggle('sendAs')} onKeyDown={triggerKeys('sendAs')}>
          <span className="tc-word-text">{sendAs === 'task' ? 'Task' : 'Message'}</span>
        </button>
        {open === 'sendAs' && sendAsMenu}
      </span>
    ) }] : []),
    ...(rows.includes('dueOn') ? [{ label: 'Due On', node: (
      <span className="tc-anchor" ref={anchor('dueOn')}>
        <button type="button" data-trigger className={trigger('dueOn')} aria-haspopup="listbox" aria-expanded={open === 'dueOn'}
          onClick={() => toggle('dueOn')} onKeyDown={triggerKeys('dueOn')}>
          {/* A day nobody set is drawn in the faint ink a placeholder
              uses: it is an answer, but a quiet one. */}
          <span className={`tc-word-text${due ? '' : ' tc-unset'}`}>{dueWords(due)}</span>
        </button>
        {open === 'dueOn' && dueOnMenu}
      </span>
    ) }] : []),
    ...(rows.includes('model') ? [{ label: 'Model', node: (
      <span className="tc-anchor" ref={anchor('model')}>
        <button type="button" data-trigger className={trigger('model')} aria-haspopup="listbox" aria-expanded={open === 'model'}
          onClick={() => toggle('model')} onKeyDown={triggerKeys('model')}>
          <span className="tc-word-text">{labelOf(pick)}</span>
        </button>
        {open === 'model' && modelMenu}
      </span>
    ) }] : []),
  ];
  const headChips = inline ? fields.map((f) => <Fragment key={f.label}>{f.node}</Fragment>) : null;

  // Read after the move lands: focus going from one control to the next blurs
  // the first, and a window losing focus to another app leaves activeElement
  // where it was.
  const [inBox, setInBox] = useState(false);
  const writingNow = () => { setTimeout(() => setInBox(!!card.current?.contains(document.activeElement)), 0); };
  const hasWords = !!text.trim() || attachments.length > 0;
  useEffect(() => { if (inline) onWriting?.(inBox || hasWords); }, [inline, inBox, hasWords]);
  useEffect(() => () => onWriting?.(false), []);
  if (handOver && inline) {
    handOver.current = () => {
      const t = textRef.current;
      return {
        to, also, body: text, mate, sendAs, due, visibility: picked, chosen: chosenPicked,
        ...(t && document.activeElement === t ? { caret: [t.selectionStart, t.selectionEnd] as [number, number] } : {}),
      };
    };
  }

  const box = (
      <div
        ref={card}
        className={`tc-card${inline ? ' tc-inline' : ''}`}
        role={inline ? 'group' : 'dialog'}
        aria-label="New thread"
        onFocus={inline ? writingNow : undefined}
        onBlur={inline ? writingNow : undefined}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void send(); return; }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            // On the page Escape steps out of the box and keeps the words.
            if (open) close('trigger'); else if (inline) (document.activeElement as HTMLElement | null)?.blur(); else onClose();
          }
        }}
      >
        {!inline && (
          <div className="tc-head">
            {fields.map((f) => (
              <div key={f.label} className="tc-field">
                <span className="tc-label">{f.label}</span>
                {f.node}
              </div>
            ))}
          </div>
        )}

        {convo && onOpenConversation && (
          <div className="tc-note tc-continues">
            Continues your conversation with {names}. <button type="button" onClick={() => onOpenConversation(convo, text)}>Open it</button>
          </div>
        )}

        {named.chips}
        {statusLine && <div className="tc-note tc-connection-status" role="status">{statusLine}</div>}
        <textarea
          ref={textRef}
          className={`tc-text ${named.over}`}
          rows={inline ? 1 : undefined}
          value={text}
          onChange={(e) => { talk.typed(); setText(e.target.value); named.track(e.target); }}
          onSelect={(e) => named.track(e.currentTarget)}
          onScroll={(e) => named.track(e.currentTarget)}
          onKeyDown={(e) => { named.keyDown(e); }}
          placeholder={mate === 'new' ? 'What should they do? They set themselves up from it and ask what they need' : mateRow ? `What should ${mateRow.name} do?` : person ? `Message ${names}` : placeholderFor(null)}
          onPaste={async (e) => {
            const pasted = await fromPaste(e);
            if (pasted.length) { e.preventDefault(); setAttachments((a) => [...a, ...pasted]); }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            await addFiles(e.dataTransfer.files);
          }}
        />
        {named.menu}
        <AttachRow attachments={attachments} onRemove={(i) => setAttachments((x) => x.filter((_, j) => j !== i))} />

        {refusal && <div className="tc-note">{refusal}</div>}
        {dropped > 0 && (
          <div className="tc-note">
            {dropped === 1
              ? 'One pasted image is too big to save. Closing the card loses it.'
              : `${dropped} pasted images are too big to save. Closing the card loses them.`}
          </div>
        )}
        {/* A MESSAGE TO A PERSON CARRIES ITS FILES (w-140ac855b1). It used to
            say they stayed here, because the conversation they are saved in
            may not exist until the message makes it; the send hands them over
            and main/team/index.mjs saves them once it knows where. */}
        {error && <div className="tc-note tc-error" role="alert">{error}</div>}
        {!talk.on && talk.problem && <div className="tc-note">{talk.problem}</div>}

        {person && sendAs === 'message' ? (
          <div className="tc-bar">
            {headChips}
            {/* HOW URGENT IT IS, AND NOTHING ELSE (w-7ba439c883, approved
                2026-10-05). The corner used to carry "Goes to Maya's inbox.",
                which was put there because a bare corner reads as a control
                that failed to draw; with the chip in it the corner is not bare,
                and the sentence was saying what the To field one line above
                already says. The chip is the task card's own, because a message
                lands in a list sorted by the same four words. */}
            {priorityChip}
            <button type="button" className="tc-icon" title="Attach files" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
              <ClipIcon />
            </button>
            <input ref={fileRef} type="file" multiple hidden onChange={async (e) => { await addFiles(e.target.files); e.target.value = ''; }} />
            <span className="tc-send solo">
              <button type="button" className="tc-send-main" disabled={!canSend} onClick={() => void send()} title={`Send · ${SEND}`}>
                Send <kbd>{SEND}</kbd>
              </button>
            </span>
          </div>
        ) : mate ? (
          <div className="tc-bar">
            {headChips}
            {mate === 'new' && (
              <span className="tc-anchor" ref={anchor('project')}>
                <button type="button" data-trigger className={`tc-chip ${open === 'project' ? 'open' : ''}`} title={product?.name ?? 'Which project'}
                  aria-haspopup="listbox" aria-expanded={open === 'project'} onClick={() => toggle('project')} onKeyDown={triggerKeys('project')}>
                  {product && <Swatch slug={product.slug} />}
                  <span className="tc-chip-name">{product?.name ?? 'No project'}</span>
                </button>
                {open === 'project' && projectMenu}
              </span>
            )}
            <span className="tc-send solo">
              <button type="button" className="tc-send-main" disabled={!text.trim() || sending} onClick={() => void send()} title={`Send · ${SEND}`}>
                Send <kbd>{SEND}</kbd>
              </button>
            </span>
          </div>
        ) : (
          <div className="tc-bar">
            {headChips}
            <span className="tc-anchor" ref={anchor('project')}>
              <button type="button" data-trigger className={`tc-chip ${open === 'project' ? 'open' : ''}`} title={product?.name ?? 'Which project'}
                aria-haspopup="listbox" aria-expanded={open === 'project'} onClick={() => toggle('project')} onKeyDown={triggerKeys('project')}>
                {product && <Swatch slug={product.slug} />}
                <span ref={projName} className={`tc-chip-name ${projCut ? 'cut' : ''}`}>{product?.name ?? 'No project'}</span>
              </button>
              {open === 'project' && projectMenu}
            </span>
            {priorityChip}
            {team && (
              <span className="tc-anchor" ref={anchor('visibility')}>
                <button type="button" data-trigger className={`tc-chip ${open === 'visibility' ? 'open' : ''}`} title="Who sees it"
                  aria-haspopup="listbox" aria-expanded={open === 'visibility'} onClick={() => toggle('visibility')} onKeyDown={triggerKeys('visibility')}>
                  {visibility === 'private' ? <LockIcon /> : <PeopleIcon />}
                  {visibility === 'team' ? 'Team' : visibility === 'private' ? 'Private' : chosenWords(chosenHere, others)}
                </button>
                {open === 'visibility' && visibilityMenu}
              </span>
            )}
            {talk.on ? <Listening talk={talk} /> : (
            <button type="button" className="tc-icon" title="Attach files" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
              <ClipIcon />
            </button>
            )}
            {talk.allowed && !talk.on && <MicButton talk={talk} />}
            <input ref={fileRef} type="file" multiple hidden onChange={async (e) => { await addFiles(e.target.files); e.target.value = ''; }} />
            {/* WHY SEND IS OFF, WHEN IT IS OFF FOR WANT OF A PROJECT. My
                Workspace is made for everybody at boot, so this should never
                draw; it draws when making it failed, which used to be a log
                line and a dead button. */}
            {stopper && (
              <span className="tc-why">
                {stopper.reason}{' '}
                {onNewProject && stopper.action
                  ? <button type="button" className="tc-why-do" onClick={onNewProject}>{stopper.action}</button>
                  : stopper.action}
              </span>
            )}
            <span className="tc-send" ref={anchor('later')}>
              <button type="button" className="tc-send-main" disabled={!canSend} onClick={() => void send()} title={refusal ?? stopper?.reason ?? `Send · ${SEND}`}>
                Send <kbd>{SEND}</kbd>
              </button>
              <button type="button" data-trigger className="tc-send-caret" disabled={!canSend} aria-label="Send later"
                aria-haspopup="menu" aria-expanded={open === 'later'} onClick={() => toggle('later')} onKeyDown={triggerKeys('later')}>
                <CaretIcon />
              </button>
              {open === 'later' && laterMenu}
            </span>
          </div>
        )}
      </div>
  );
  if (inline) return box;
  // Closing the box ends its dictation, so a click outside it waits for Stop.
  return <div className="modal-backdrop tc-veil" onClick={() => { if (!talk.on) onClose(); }}>{box}</div>;
}

/* ------------------------------- glyphs --------------------------------- */

function Swatch({ slug }: { slug: string }) {
  return <span className="tc-swatch" aria-hidden="true"><i style={{ background: projectSwatch(slug) }} /></span>;
}

// THE APP'S OWN PRIORITY BARS. Urgent is a fourth bar, never an exclamation
// mark in a box (w-bba20a03f5, Priority.tsx), whatever the drawing showed.
const PrioGlyph = ({ id }: { id: PriorityId }) => <span className="tc-prio"><PriorityIcon id={id} /></span>;

const PeopleIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <circle cx="9" cy="9" r="3.2" /><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.8.6 3 2.1 3.4 4.7" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <rect x="5.5" y="10.5" width="13" height="9" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);
const ClipIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7" />
  </svg>
);
const CaretIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);
// Sized and weighted to sit where a project's swatch sits, so "New project"
// lines up with the names above it rather than stepping sideways.
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></svg>
);
const RepeatIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M17 3l3 3-3 3" /><path d="M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H4" />
  </svg>
);

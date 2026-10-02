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
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Product, WorkItem } from '../types';
import type { Engine } from '../../../shared/engines.mjs';
import { ENGINES } from '../../../shared/engines.mjs';
import { api } from '../api';
import { TeamContext, Face, firstName } from '../team/people';
import { conversationWith } from './page-rules';
import { collectFiles, fromPaste, persistAttachments, type PendingAttachment } from '../attachments';
import { AttachRow } from '../components/AttachRow';
import { PRIORITIES, priorityLabelOf, priorityValueOf, readLastPriority, writeLastPriority, type PriorityId } from '../priority';
import { readComposeDraft, saveComposeDraft, clearComposeDraft } from '../drafts';
import { LAST_PRODUCT_KEY } from '../compose-project';
import { practiceRefusal } from '../compose-says';
import { defaultModelFor, engineModelLabel, readLastModel, writeLastModel, type ModelChoice } from '../models';
import { defaultEffortFor, effortChoicesFor, effortPicked, effortShown, readLastEffort, writeLastEffort } from '../effort';
import { engineThisMacOffers, readLastEngine, writeLastEngine } from '../engines';
import { repeatPresets } from '../components/When';
import { fitMenu } from '../keep-in-window';
import {
  allModels, findPeople, harnessFields, inputValueOf, laterHint, momentFromInput, mondayMorning, moreCount,
  onlyYouAnd, placeholderFor, projectsOffered, projectSwatch, recentModels, sameModel,
  sharingFields, startingProject, teammates, threadMessage, tomorrowMorning, chosenWords, VISIBILITY_ROWS,
  type Harness, type ModelPick, type Visibility,
} from './composer-rules';
import './thread-composer.css';

/** What went out, so the caller can say so and offer the way back. */
export interface ThreadSent {
  kind: 'task' | 'repeat' | 'message';
  product?: string;
  title?: string;
  /** A Send later moment, when there was one. */
  runAt?: number;
  /** The repeating rule's id, so ending it can be the undo. */
  ruleId?: string;
  /** Everyone a message went to, when it went to more than one person. */
  toMany?: string[];
  /** The person a message went to. */
  to?: string;
}

type MenuKey = 'to' | 'model' | 'project' | 'priority' | 'visibility' | 'later';

export function ThreadComposer({
  products, items, engines, codexModels, codexModelDefault, defaultProduct, initial, scripted, onClose, onSent, onOpenConversation, onReorderProjects,
}: {
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
  initial?: { to?: string; also?: string[]; body?: string } | null;
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
  /** Picking someone you already talk to opens that conversation instead,
   *  carrying whatever was typed into its reply box (2026-10-01: a strip of
   *  the last few lines reads badly for a conversation that is hundreds of
   *  lines long). */
  onOpenConversation?: (item: WorkItem, draft: string) => void;
  /** Opens Settings > Priority, from the "Reorder" beside the project menu's heading. */
  onReorderProjects?: () => void;
  onClose: () => void;
  /** Called once the send stands, BEFORE the draft is cleared, so the caller can still read it for an undo. */
  onSent: (item: WorkItem | null, sent?: ThreadSent) => void;
}) {
  const team = useContext(TeamContext);
  const others = useMemo(() => (team ? teammates(team.state.people, team.me) : []), [team]);

  /* ------------------------------- who ---------------------------------- */
  const [to, setTo] = useState<string>(() => (initial?.to && others.some((p) => p.id === initial.to) ? initial.to : 'agent'));
  const person = to === 'agent' ? null : others.find((p) => p.id === to) ?? null;
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
  const groupConvo = person && extra.length ? conversationWith([person.id, ...also], { products, items, me: team?.me ?? null }) : null;

  /* ------------------------------ words --------------------------------- */
  const opened = useRef(readComposeDraft());
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

  /* ---------------------------- priority -------------------------------- */
  const [prio, setPrio] = useState<PriorityId | null>(() => (opened.current.priority as PriorityId | null) ?? readLastPriority());
  const prioShown: PriorityId = prio ?? 'medium';
  const pickPrio = (id: PriorityId) => { setPrio(id); writeLastPriority(id); };

  /* --------------------------- visibility ------------------------------- */
  // EVERY NEW THREAD STARTS AS TEAM, AND WHO SEES IT IS CHOSEN FOR THAT THREAD.
  // Visibility follows what the task is, not where it lives. It was
  // remembered per project for a while, and a tester then found the next
  // thread silently Private; nothing carries over now.
  // AND IT MAY BE A FEW PEOPLE RATHER THAN THE TEAM (w-41ff964775): "you might
  // only want certain people to see what you're up to". Chosen people opens the
  // same picker the To field uses, and the pick stands only while somebody is
  // on the list; with nobody on it the thread is sent Private, because that is
  // who can see it (composer-rules.ts `sharingFields`).
  const [visibility, setVisibility] = useState<Visibility>('team');
  const [chosen, setChosen] = useState<string[]>([]);
  const [visPage, setVisPage] = useState<'rows' | 'people'>('rows');
  const pickVisibility = (v: Visibility) => { setVisibility(v); };
  const toggleChosen = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((p) => p !== id) : [...c, id]));
  // Anyone who leaves the team comes off the list with them.
  const chosenHere = chosen.filter((id) => others.some((p) => p.id === id));

  /* ------------------------------ model --------------------------------- */
  const engineRows = engines?.length ? engines : [ENGINES[0]];
  const codexOffered = engineRows.some((e) => e.id === 'codex');
  const codexDefault = codexModelDefault ?? null;
  const modelOpts = { codexModels, codexDefault };
  const remembered = (): ModelPick => {
    const engine: Harness = engineThisMacOffers(readLastEngine(), engineRows) === 'codex' ? 'codex' : 'claude';
    return { engine, model: readLastModel(undefined, engine, codexDefault) ?? defaultModelFor(engine, codexDefault) };
  };
  const [pick, setPick] = useState<ModelPick>(remembered);
  // A Codex pick on a Mac that stopped offering Codex goes back to Claude Code,
  // the rule the old card followed: a word this Mac cannot run is not held.
  useEffect(() => {
    if (pick.engine === 'codex' && !codexOffered) setPick({ engine: 'claude', model: readLastModel(undefined, 'claude') ?? defaultModelFor('claude') });
  }, [codexOffered]);
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
  const recent = useMemo(
    () => recentModels(items, { codexModels, codexDefault, codexOffered }),
    [items, codexModels, codexDefault, codexOffered],
  );
  const every = useMemo(() => allModels({ codexModels, codexOffered }), [codexModels, codexOffered]);
  const more = moreCount(recent, every);

  /* ------------------------------ menus --------------------------------- */
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [modelPage, setModelPage] = useState<'recent' | 'all'>('recent');
  const [laterPage, setLaterPage] = useState<'list' | 'repeat'>('list');
  const [picking, setPicking] = useState(false);
  const [pickAt, setPickAt] = useState(() => inputValueOf(tomorrowMorning()));
  const anchors = useRef<Partial<Record<MenuKey, HTMLElement | null>>>({});
  const anchor = (key: MenuKey) => (el: HTMLElement | null) => { anchors.current[key] = el; };
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (key: MenuKey) => {
    setOpen((o) => (o === key ? null : key));
    setModelPage('recent');
    setLaterPage('list');
    // Who sees it opens on its three rows, even if the picker was last open.
    setVisPage('rows');
    setPicking(false);
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
  }, [query, picking]);

  const menuKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('trigger'); return; }
    // The date field keeps its own arrows: they step the day and the hour.
    if (t instanceof HTMLInputElement && t.type === 'datetime-local') return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-item]:not([disabled])')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[(at + 1) % rows.length]?.focus(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); rows[at <= 0 ? rows.length - 1 : at - 1]?.focus(); return; }
    // Typing on a row of the To menu types into "Find a person".
    const find = e.currentTarget.querySelector<HTMLInputElement>('.tc-find');
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
    const stored = saveComposeDraft({ text, attachments, priority: prio, when: { runAt: 0, repeat: null }, dropped: 0 });
    setDropped(stored.dropped);
  }, [text, attachments, prio]);

  useEffect(() => {
    const t = textRef.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
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
  const message = threadMessage(text, person ? [] : attachments);
  const refusal = person ? null : practiceRefusal(product, { scripted: !!scripted });
  const canSend = !sending && (person ? !!text.trim() : !!message && !!product && !refusal);

  const sendTask = async (when: { runAt?: number; repeat?: { every: 'day' | 'weekday' | 'week'; on?: number; at: string } } = {}) => {
    if (!canSend || !product || !message) return;
    setSending(true);
    setError(null);
    setOpen(null);
    try {
      const attached = await persistAttachments(product.slug, attachments);
      const body = [message.body, attached].filter(Boolean).join('\n\n');
      try { localStorage.setItem(LAST_PRODUCT_KEY, product.slug); } catch { /* the send still stands */ }
      const harness = harnessFields({
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
        onSent(null, { kind: 'repeat', product: product.slug, title: message.title, ruleId: rule?.id });
      } else {
        const made = await api.compose({
          product: product.slug, title: message.title, body: body || undefined, kind: 'directive', priority,
          ...(when.runAt ? { runAt: when.runAt } : {}),
          ...harness,
          ...(team ? sharingFields(visibility, chosenHere) : {}),
          // The tutorial's own task, and only ever that one. See `scripted`.
          ...(scripted ? { labels: scripted.labels } : {}),
        });
        onSent(made, { kind: 'task', product: product.slug, title: message.title, ...(when.runAt ? { runAt: when.runAt } : {}) });
      }
      clearComposeDraft();
    } catch (err) {
      // The card stays open with every word in it: a send that failed and also
      // ate what she wrote is two failures, and the second is the expensive one.
      setError(`Not sent: ${String((err as Error)?.message ?? err)}`);
      setSending(false);
    }
  };

  const sendMessage = async () => {
    if (!canSend || !person) return;
    setSending(true);
    setError(null);
    const res = await api.teamMessage(extra.length ? [person.id, ...also] : person.id, text.trim());
    if (!res.ok) {
      setError(`Not sent: ${res.error ?? 'the team cloud did not answer.'}`);
      setSending(false);
      return;
    }
    onSent(null, { kind: 'message', to: person.id, ...(extra.length ? { toMany: [person.id, ...also] } : {}) });
    clearComposeDraft();
  };

  const send = () => (person ? sendMessage() : sendTask());

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
    if (id !== 'agent' && onOpenConversation) {
      const convo = conversationWith(id, { products, items, me: team?.me ?? null });
      if (convo) { onOpenConversation(convo, text); return; }
    }
    setTo(id); setAlso([]); setError(null); close('text');
  };

  const toMenu = (
    <div className="tc-menu tc-drop tc-to-menu" role="listbox" aria-label="To" onKeyDown={menuKeys}>
      {!adding && (
        <button type="button" data-item className={`tc-row ${person ? '' : 'on'}`} onPointerEnter={hover} onClick={() => chooseTo('agent')}>
          <span className="tc-agent" aria-hidden="true" /><span className="tc-row-label">Agent</span>
        </button>
      )}
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

  const modelRow = (p: ModelPick) => (
    <button
      key={`${p.engine}:${p.model}`}
      type="button"
      data-item
      className={`tc-row ${sameModel(p, pick) ? 'on' : ''}`}
      onPointerEnter={hover}
      onClick={() => { pickModel(p); close('text'); }}
    ><span className="tc-row-label">{labelOf(p)}</span></button>
  );
  const engineLabel = (id: string) => engineRows.find((e) => e.id === id)?.label ?? ENGINES.find((e) => e.id === id)?.label ?? id;

  const modelMenu = (
    <div className="tc-menu tc-drop tc-model-menu" role="listbox" aria-label="Model" onKeyDown={menuKeys}>
      {modelPage === 'recent' ? (<>
        <span className="tc-menu-head">Recent</span>
        {recent.map(modelRow)}
        <span className="tc-sep" />
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => setModelPage('all')}>
          <span className="tc-row-label">All models</span>
          {more > 0 && <small>{more} more ›</small>}
        </button>
      </>) : (<>
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => setModelPage('recent')}>
          <span className="tc-row-label">‹ Recent</span>
        </button>
        <span className="tc-sep" />
        <div className="tc-cols">
          <div className="tc-col">
            <span className="tc-menu-head">{engineLabel('claude')}</span>
            {every.claude.map(modelRow)}
          </div>
          {every.codex.length > 0 && (
            <div className="tc-col">
              <span className="tc-menu-head">{engineLabel('codex')}</span>
              {every.codex.map(modelRow)}
            </div>
          )}
        </div>
      </>)}
      {effortRows.length > 0 && (<>
        <span className="tc-sep" />
        <span className="tc-effort-head" id="tc-effort-head">Effort</span>
        <span className="tc-effort" role="radiogroup" aria-labelledby="tc-effort-head">
          {effortRows.map((e) => (
            <button
              key={e.id}
              type="button"
              data-item
              role="radio"
              aria-checked={e.id === effortLit}
              className={e.id === effortLit ? 'lit' : ''}
              onPointerEnter={hover}
              // The level stays in the menu: she may be here to set the model
              // and the level both, and closing on the first makes her reopen it.
              onClick={() => pickEffort(e.id)}
            >{e.label}</button>
          ))}
        </span>
      </>)}
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
  const pickedAt = momentFromInput(pickAt, now);
  const laterMenu = (
    <div className="tc-menu tc-rise tc-right tc-wide" role="menu" aria-label="Send later" onKeyDown={menuKeys}>
      {laterPage === 'list' ? (<>
        <span className="tc-menu-head">Send later</span>
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => sendTask({ runAt: tomorrow })}>
          <ClockIcon /><span className="tc-row-label">Tomorrow morning</span><small>{laterHint(tomorrow)}</small>
        </button>
        <button type="button" data-item className="tc-row" onPointerEnter={hover} onClick={() => sendTask({ runAt: monday })}>
          <ClockIcon /><span className="tc-row-label">Monday morning</span><small>{laterHint(monday)}</small>
        </button>
        <button type="button" data-item className={`tc-row ${picking ? 'on' : ''}`} onPointerEnter={hover} onClick={() => setPicking((p) => !p)}>
          <ClockIcon /><span className="tc-row-label">Pick a date and time</span>
        </button>
        {picking && (
          <span className="tc-pick">
            <input
              type="datetime-local"
              className="tc-date"
              value={pickAt}
              min={inputValueOf(now)}
              autoFocus
              onChange={(e) => setPickAt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && pickedAt) { e.preventDefault(); sendTask({ runAt: pickedAt }); } }}
            />
            <button type="button" data-item className="tc-schedule" disabled={!pickedAt} onClick={() => pickedAt && sendTask({ runAt: pickedAt })}>Schedule</button>
          </span>
        )}
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
      </>)}
    </div>
  );

  /* ------------------------------- card --------------------------------- */
  return (
    <div className="modal-backdrop tc-veil" onClick={onClose}>
      <div
        className="tc-card"
        role="dialog"
        aria-label="New thread"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void send(); return; }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (open) close('trigger'); else onClose();
          }
        }}
      >
        <div className="tc-head">
          <div className="tc-field">
            <span className="tc-label">To</span>
            <span className="tc-anchor" ref={anchor('to')}>
              <button type="button" data-trigger className={`tc-word ${open === 'to' ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open === 'to'}
                onClick={() => toggle('to')} onKeyDown={triggerKeys('to')}>
                {person ? <Face person={person} /> : <span className="tc-agent" aria-hidden="true" />}
                <span className="tc-word-text">{person ? person.name : 'Agent'}</span>
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
          </div>
          {!person && (
            <div className="tc-field">
              <span className="tc-label">Model</span>
              <span className="tc-anchor" ref={anchor('model')}>
                <button type="button" data-trigger className={`tc-word ${open === 'model' ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open === 'model'}
                  onClick={() => toggle('model')} onKeyDown={triggerKeys('model')}>
                  <span className="tc-word-text">{labelOf(pick)}</span>
                </button>
                {open === 'model' && modelMenu}
              </span>
            </div>
          )}
        </div>

        {groupConvo && onOpenConversation && (
          <div className="tc-note tc-continues">
            Continues your conversation with {names}. <button type="button" onClick={() => onOpenConversation(groupConvo, text)}>Open it</button>
          </div>
        )}

        <textarea
          ref={textRef}
          className="tc-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={person ? `Message ${names}` : placeholderFor(null)}
          onPaste={async (e) => {
            if (person) return;
            const pasted = await fromPaste(e);
            if (pasted.length) { e.preventDefault(); setAttachments((a) => [...a, ...pasted]); }
          }}
          onDragOver={(e) => { if (!person) e.preventDefault(); }}
          onDrop={async (e) => {
            if (person) return;
            e.preventDefault();
            await addFiles(e.dataTransfer.files);
          }}
        />
        {!person && <AttachRow attachments={attachments} onRemove={(i) => setAttachments((x) => x.filter((_, j) => j !== i))} />}

        {refusal && <div className="tc-note">{refusal}</div>}
        {!person && dropped > 0 && (
          <div className="tc-note">
            {dropped === 1
              ? 'One pasted image is too big to save. Closing the card loses it.'
              : `${dropped} pasted images are too big to save. Closing the card loses them.`}
          </div>
        )}
        {/* A message to a person carries words only for now, so files she
            attached for an agent are said out loud rather than dropped. */}
        {person && attachments.length > 0 && (
          <div className="tc-note">
            {attachments.length === 1 ? 'The attached file stays here' : `The ${attachments.length} attached files stay here`}: a message to a person carries words only.
          </div>
        )}
        {error && <div className="tc-note tc-error" role="alert">{error}</div>}

        {person ? (
          <div className="tc-bar">
            <span className="tc-only">{extra.length ? `Only you, ${names} see this.` : onlyYouAnd(person)}</span>
            <span className="tc-send solo">
              <button type="button" className="tc-send-main" disabled={!canSend} onClick={() => void send()} title="Send · ⌘↵">
                Send <kbd>⌘↵</kbd>
              </button>
            </span>
          </div>
        ) : (
          <div className="tc-bar">
            <span className="tc-anchor" ref={anchor('project')}>
              <button type="button" data-trigger className={`tc-chip ${open === 'project' ? 'open' : ''}`} title={product?.name ?? 'Which project'}
                aria-haspopup="listbox" aria-expanded={open === 'project'} onClick={() => toggle('project')} onKeyDown={triggerKeys('project')}>
                {product && <Swatch slug={product.slug} />}
                <span ref={projName} className={`tc-chip-name ${projCut ? 'cut' : ''}`}>{product?.name ?? 'No project'}</span>
              </button>
              {open === 'project' && projectMenu}
            </span>
            <span className="tc-anchor" ref={anchor('priority')}>
              <button type="button" data-trigger className={`tc-chip ${open === 'priority' ? 'open' : ''}`} title="Priority"
                aria-haspopup="listbox" aria-expanded={open === 'priority'} onClick={() => toggle('priority')} onKeyDown={triggerKeys('priority')}>
                <PrioGlyph id={prioShown} />{priorityLabelOf(prioShown)}
              </button>
              {open === 'priority' && priorityMenu}
            </span>
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
            <button type="button" className="tc-icon" title="Attach files" aria-label="Attach files" onClick={() => fileRef.current?.click()}>
              <ClipIcon />
            </button>
            <input ref={fileRef} type="file" multiple hidden onChange={async (e) => { await addFiles(e.target.files); e.target.value = ''; }} />
            <span className="tc-send" ref={anchor('later')}>
              <button type="button" className="tc-send-main" disabled={!canSend} onClick={() => void send()} title={refusal ?? 'Send · ⌘↵'}>
                Send <kbd>⌘↵</kbd>
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
    </div>
  );
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
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></svg>
);
const RepeatIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M17 3l3 3-3 3" /><path d="M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3" /><path d="M20 13v2a3 3 0 0 1-3 3H4" />
  </svg>
);

/** "Bea", "Bea and Carla", "Bea, Carla and Dev". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}


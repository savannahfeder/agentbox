// THE AGENT IMPORT, ON ITS OWN.
//
// Until this card the offer lived on the last screen of the first run and
// nowhere else. Somebody who pressed past it, or who installed Claude Code the
// day after their setup, had no way back to it short of walking the whole thing
// again. So this is that card with the walk taken off it.
//
// WHAT IT HAS THAT THE WALK'S CANNOT, AND WHY IT STOPPED BEING THE SAME CARD.
// Inside the setup there is exactly one project and one folder, so the walk's
// two-sided switch is the right shape there. Out here the sides were never two.
//
// The card was four grey lines of the same size, one of which happened to be
// the only way to reach half the agents. So the card is now a section per inbox
// the rows can land in — a name at the top of each, the folder under it, its own
// agents ticked beneath — and the sections are built by `destinations` rather
// than by anything in here.
//
// AND NOBODY MAKES A PROJECT BY HAND ANY MORE.We can and we did: the folder was
// already found and the name was already derived. What stood between them was a
// word to press, a field to type in and a second button. All three are gone.
// One press makes the projects and files the rows.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { COPY, type AgentFile } from '../onboarding';
import {
  CARD, DOOR, SECTION, allPicked, bringAllLine, canBring, destinations, folderOfProject, goLine,
  countWord, countKinds, nameOfProject, picksOf, pressLine, projectAtOpen, sectionState,
  toggleSection, togglePicked, totalLine,
  type AgentFolder, type Destination, type Project, type SessionThread,
} from '../agent-import-card';
// The same two words the inbox row will use about this thread, out of the same
// file, so the card and the row it files can never describe one differently.
import { startedIn, whenWords } from '../../../shared/agent-import.mjs';
import { NAME } from '../../../shared/product-name.mjs';

/**
 * The tick on a kept agent, drawn rather than typed for the same reason as the
 *  walk's: a check written as a character is a different size in every font a
 *  Mac decides to use. */
function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

/**
 * THE MARK THAT SAYS A PROJECT OPENS.
 *
 *  It already expanded. Pressing the name opened the block and its agents were
 *  drawn underneath, and that had been true since the round before. It still
 *  read as a row that did not open, which is the whole finding: MEASURED on the real card
 *  (scripts/measure-opening-a-project.mjs, eight folders), a closed project row
 *  carried ZERO carets, ZERO chevrons and ZERO svgs. The only thing on it that
 *  said it opens was `aria-expanded="false"`, so a screen reader was told and a
 *  person looking at the screen was not.
 *
 *  So this is not a feature. It is the missing half of one, and it is drawn
 *  rather than typed for the same reason the tick is: a caret written as a
 *  character is a different size and a different weight in every font a Mac
 *  reaches for, and this one has to sit on a baseline next to a count. */
function Caret() {
  return (
    <svg className="ia-caret" width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M9 5.5 16.5 12 9 18.5" />
    </svg>
  );
}

/**
 * WHAT THIS CARD NEEDS WHEN IT IS THE LAST SCREEN OF THE FIRST RUN.
 *
 *  The reason it was wrong is that there were TWO of these cards. This one
 *  is what ⌘K opens. The walk kept an older copy of its own — a two-sided
 *  switch with everything ticked — and six rounds of work on this row never
 *  touched it, because the note at the top of ../agent-import-card.ts said the
 *  walk's card was the right shape inside the setup and left it there. That
 *  reasoning is now overruled, so the walk draws THIS
 *  card and there is one of them.
 *
 *  Three things change inside the walk and nothing else does:
 *    - There is no way to close it. The walk is the way out, so Escape steps
 *      back from the choose screen and then stops rather than dropping her into
 *      an app the walk has not finished handing over.
 *    - There is a third, quiet way on: `Open my inbox`, the walk's own words,
 *      which ends the walk having brought nothing in. Without it a Mac with
 *      agents on it could not reach the inbox without importing something,
 *      which the old card never demanded.
 *    - The folders are handed in rather than scanned again. The walk has
 *      already read the disk a beat early so this card is whole the moment it
 *      appears, and reading it twice on the last screen of a setup is the
 *      slowest possible place to do it. */
export interface WalkMode {
  /**
   * The sentence under the headline, saying these names came off this
   * Mac.*/
  line: string;
  /** End the walk with nothing brought in. */
  onSkip: () => void;
  /**
   * The word on that way out. The walk's own, so it is the button she has
   *  already seen on every version of this screen. */
  skip: string;
  /**
   * Every folder on this Mac with agents in it, already read by the walk.
   *  Null means still reading, exactly as the card's own scan means it. */
  folders: AgentFolder[] | null;
}

export function ImportAgents({ products, filter, walk, onDone, onNewProject, onProjectMade, onClose }: {
  products: Project[];
  /** The project the inbox is filtered to, if any. */
  filter: string | null;
  /** Set only when this card IS the last screen of the first run. See WalkMode. */
  walk?: WalkMode;
  /** What was filed, so the caller can say it out loud and redraw the inbox. */
  onDone: (p: {
    added: number; already: number; name: string; inboxes: number; made: string[]; noun?: string;
  }) => void;
  /**
   * Nowhere to file into and no folder to make one out of. The card hands over
   *  to the one card that fixes that rather than explaining and stopping. */
  onNewProject: () => void;
  /**
   * A project was made ON this card, around a folder that had agents in it.
   *  The app redraws its sidebar. */
  onProjectMade?: (slug: string) => void;
  onClose: () => void;
}) {
  const last = (() => {
    try { return localStorage.getItem('zero.lastProduct'); } catch { return null; }
  })();
  const [project, setProject] = useState<string | null>(() => projectAtOpen(products, { filter, last }));
  // Null while her Mac is being read, so the card never says there is nothing
  // here before it has looked. That failure has its own name in the walk.
  const [found, setFound] = useState<{ user: AgentFile[]; project: AgentFile[] } | null>(null);
  // THE TICKS, BY PATH, and they start EMPTY. Two folders on one Mac can both
  // hold an agent called `code-reviewer`, and this card shows several folders at
  // once, so a tick keyed by name would turn one on by turning the other on.
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  // Every folder on this Mac with agents in it, read once alongside the agents
  // themselves, because the answer does not change while a card is open.
  // NULL UNTIL THE SCAN COMES BACK, not an empty list. Measured 2026-08-26 with
  // twenty folders on the disk: the scan is slower than the file read, the ticks
  // settled on the two sections that had arrived, and the eighteen folders that
  // landed a moment later came up EMPTY. The card said "Bring in five agents"
  // over twenty-eight of them. At eight folders the scan won the race and the
  // bug was invisible.
  const [others, setOthers] = useState<AgentFolder[] | null>(walk ? walk.folders : null);
  // THE USER'S OWN CLAUDE CODE THREADS, which count as the agents on this
  // Mac. NULL until the walk of ~/.claude/projects comes back, for the same
  // reason `others` is: measured 2026-08-29 it is 1.7 seconds over 2,445
  // transcripts, comfortably the slowest of the three reads, and a card that
  // drew itself without them would say "Add all four agents" over thirteen and
  // then settle under her hand.
  const [threads, setThreads] = useState<SessionThread[] | null>(null);
  // A PROJECT MADE HERE IS USABLE HERE, IMMEDIATELY. The app's own product list
  // arrives on the next refresh, and until it does the card would have a project
  // chosen that it cannot find a name or a folder for.
  const [made, setMade] = useState<Project[]>([]);

  // WHICH OF THE TWO SCREENS IS UP.The card opens on the doors and only ever
  // goes one step in; there is no third screen and no walk.
  const [screen, setScreen] = useState<'door' | 'pick'>('door');
  // Which sections are showing their agents, on the choose screen. Several can
  // be open at once, because closing one to read another is a press she did not
  // ask for.
  const [open, setOpen] = useState<string[]>([]);

  const all = useMemo(
    () => [...products, ...made.filter((m) => !products.some((p) => p.slug === m.slug))],
    [products, made],
  );

  const folder = folderOfProject(all, project);
  const name = nameOfProject(all, project);

  /**
   * THE PROJECT CAN ARRIVE AFTER THE CARD DOES.
   *
   *  `projectAtOpen` runs once, in a `useState` initialiser, which is right out
   *  in ⌘K: the app has been running for hours and its product list is on the
   *  screen behind the card. Inside the walk it is not. The last step begins and
   *  this card is drawn in the same frame, while the app's own product list is
   *  still a poll behind — so `projectAtOpen` ran against an EMPTY list, settled
   *  on null, and never looked again.
   *
   *  MEASURED, driving the real walk (scripts/shot-the-walk-imports-agents.mjs):
   *  door one said "Bring in all ten agents. They land in four inboxes" and then
   *  filed seven into three. The three missing ones were the home folder set,
   *  whose inbox is the project this had decided was null, and the card said
   *  "Make a project and they have an inbox" over a project she had made four
   *  screens earlier.
   *
   *  So it looks again until it has one that exists. It stops the moment it
   *  does, which is what keeps it from overruling a project she picked herself:
   *  hers is in `all`, so the first line returns. */
  useEffect(() => {
    if (project && all.some((p) => p.slug === project)) return;
    const next = projectAtOpen(all, { filter, last });
    if (next && next !== project) setProject(next);
  }, [all, filter, last, project]);

  // INSIDE THE WALK THE SCAN HAS ALREADY HAPPENED, a beat early, so this card
  // is whole the moment it appears rather than filling in under her eyes on the
  // last screen of a setup.
  const handed = walk?.folders;
  useEffect(() => {
    if (walk) { setOthers(handed ?? null); return; }
    let live = true;
    (async () => {
      const f = await api.agentFolders();
      if (live) setOthers(f);
    })();
    return () => { live = false; };
  }, [walk, handed]);

  // THE THREADS ARE READ HERE EVEN INSIDE THE WALK, unlike the folders above.
  // The walk hands its folders in because it scanned for them a screen early to
  // decide whether to draw this card at all, and it makes no such decision about
  // threads: a Mac with nine of them and no agent files is a Mac this card has
  // something to offer.
  useEffect(() => {
    let live = true;
    (async () => {
      const t = await api.agentThreads();
      if (live) setThreads(t);
    })();
    return () => { live = false; };
  }, []);

  // READ AGAIN WHENEVER THE PROJECT CHANGES, because the project side IS the
  // project's folder: `<repo>/.claude/agents`. A card that kept the first
  // project's list under a second project's name would be lying in the half of
  // itself that is hardest to check.
  useEffect(() => {
    let live = true;
    setFound(null);
    (async () => {
      const r = await api.agentFiles({ folder, product: project });
      if (!live) return;
      setFound({ user: r.user, project: r.project });
    })();
    return () => { live = false; };
  }, [folder, project]);

  // WHAT IS ALREADY IN IS NOT OFFERED AGAIN (w-db6f5e331e). The main process
  // marks each conversation that already has a row; offering those read as
  // "Add all five" over five rows already in the inbox, and added nothing.
  const offered = useMemo(() => (threads ?? []).filter((t) => !t.imported), [threads]);
  const alreadyIn = (threads?.length ?? 0) - offered.length;
  const dests = useMemo(
    () => destinations({ found, folders: others ?? [], products: all, project, threads: offered }),
    [found, others, all, project, offered],
  );

  const on = useMemo(() => new Set(picked), [picked]);
  const some = dests.length > 0;
  // THE MAC HAS BEEN READ, all three ways. Stated once, because the card asks
  // this question in seven places and a card that has read two of the three is
  // a card that says a number it is about to change.
  const read = !!found && !!others && threads !== null;
  const ready = canBring({ read, picked, dests });

  /**
   * LOOKING AGAIN, ON A CARD THAT CAME BACK EMPTY.
   *
   * a tester, 2026-08-24, is who this is for: Claude Code was installed in
   * front of her while the walk was open, and the empty answer on the screen
   * had been read off a Mac that did not have it a minute earlier. Both halves
   * are taken again — the file read AND the disk scan — because on a Mac with
   * no Claude Code both of them come back empty for the same reason.
   *
   *  It sets the two pieces of state directly rather than nudging the effects
   *  above. Inside the walk the folders are handed in and there is no scan
   *  effect to nudge, so a card that could only look again outside the walk
   *  would be missing the button on the screen this row is about. */
  const [looking, setLooking] = useState(false);
  const lookAgain = useCallback(async () => {
    if (looking) return;
    setLooking(true);
    try {
      // The conversations too (w-db6f5e331e): on a Mac with only Codex they
      // are the whole of what this card can offer, and a Codex thread started
      // while the card was open was the one thing it never picked up.
      const [r, f, t] = await Promise.all([
        api.agentFiles({ folder, product: project }),
        api.agentFolders(),
        api.agentThreads(),
      ]);
      setFound({ user: r.user, project: r.project });
      setOthers(f);
      setThreads(t);
    } finally { setLooking(false); }
  }, [looking, folder, project]);

  /**
   * THE ONE PRESS, and it is the whole of the answer. Both doors end here.
   *
   *  For every section with something ticked in it: the project it lands in, made
   *  first if it does not exist yet, then the rows. A section that is already a
   *  project is filed into by name, and the two sections that share a project
   *  (the home folder set and that project's own folder) are filed in ONE call,
   *  because the call also saves which agents that project took and a second call
   *  would save only its own half of them.
   *
   *  IT TAKES THE LIST RATHER THAN READING THE TICKS. "Bring in all sixteen" is
   *  a press with no ticks behind it: setting them and then pressing would press
   *  against the state React has not handed back yet.
   *
   * AND A SECTION NOW HOLDS TWO KINDS. Her agent files and the threads she had
   * in that folder land in the same inbox and are filed by two calls, because
   * they are two different rows: one asks an agent for its first job, the other
   * is her own conversation arriving as a task. Both counts add up into one
   * sentence afterwards, because from where she is standing it was one press.
   * */
  const bring = useCallback(async (paths: string[]) => {
    if (busy || paths.length === 0) return;
    setBusy(true);
    try {
      const take = new Set(paths);
      type Load = { names: string[]; ids: string[] };
      const byProject = new Map<string, Load>();
      const fresh: { folder: string; name: string; load: Load }[] = [];
      for (const d of dests) {
        const names = d.items.filter((a) => take.has(a.path)).map((a) => a.name);
        const ids = (d.threads ?? []).filter((t) => take.has(t.path)).map((t) => t.id);
        if (!names.length && !ids.length) continue;
        if (d.kind === 'new' && d.folder) fresh.push({ folder: d.folder, name: d.name, load: { names, ids } });
        else if (d.slug) {
          const had = byProject.get(d.slug) ?? { names: [], ids: [] };
          byProject.set(d.slug, { names: [...had.names, ...names], ids: [...had.ids, ...ids] });
        }
      }

      let added = 0;
      let already = 0;
      let inboxes = 0;
      let landed = '';
      const newly: string[] = [];

      /**
       * Both kinds into one project, and the two numbers added together. A
       *  press that filed four agents and five threads moved nine rows. */
      const file = async (slug: string, load: Load) => {
        if (load.names.length) {
          const r = await api.importAgents({ product: slug, agents: load.names });
          added += r.added; already += r.already;
        }
        if (load.ids.length) {
          const r = await api.importThreads({ product: slug, threads: load.ids });
          added += r.added; already += r.already;
        }
        inboxes += 1;
      };

      for (const [slug, load] of byProject) {
        await file(slug, load);
        landed = nameOfProject(all, slug);
      }
      for (const f of fresh) {
        let slug: string | null = null;
        try {
          const got = await api.createProduct({ name: f.name, repoPath: f.folder }) as { slug?: string } | null;
          slug = got?.slug ?? null;
        } catch { slug = null; }
        // A project the store refused is not silently dropped from the count:
        // nothing was filed for it, so nothing is counted for it, and the line
        // she reads says how many inboxes really moved.
        if (!slug) continue;
        newly.push(f.name);
        setMade((m) => [...m, { slug: slug as string, name: f.name, repoPath: f.folder }]);
        onProjectMade?.(slug);
        await file(slug, f.load);
        landed = f.name;
      }
      // WHICH WORD THE TOAST USES FOR "THAT ONE ALREADY HAS A ROW". Only the
      // singular needs it, and only one kind can be in a press of one.
      const kinds = countKinds(dests, paths);
      onDone({
        added, already, name: inboxes === 1 ? landed : '', inboxes, made: newly,
        noun: kinds.agents ? 'agent' : 'thread',
      });
    } finally { setBusy(false); }
  }, [busy, dests, all, onDone, onProjectMade]);

  /**
   * Nothing is ticked when this is pressed, so it hands the whole card to
   * `bring` rather than ticking sixteen boxes first. */
  const bringAll = useCallback(() => bring(allPicked(dests)), [bring, dests]);

  // ⌘↵ PRESSES WHICHEVER SCREEN IS UP, the key that carries every card in this
  // app, and Escape steps back one screen before it closes. Plain Enter is left
  // to whichever tick she is standing on, exactly as on the walk's version.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (picking) { setPicking(false); return; }
        if (screen === 'pick') { setScreen('door'); return; }
        // AND INSIDE THE WALK IT STOPS THERE. Escape off the doors would put
        // her in an app the setup has not handed over yet, with the practice
        // project still on the screen. The way on is the third door.
        if (walk) return;
        onClose();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // AND ON A MAC WITH NOTHING TO BRING, ⌘↵ IS THE WAY ON. The walk
        // teaches ⌘↵ as the key that carries every card, and this card now
        // appears with nothing on it, so the key it taught has to do the one
        // thing this card can do. Without it the last screen of the setup is
        // the only one in the walk that answers to no key at all.
        if (walk && !some) { walk.onSkip(); return; }
        if (screen === 'door') bringAll();
        else if (ready) bring(picked);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [bring, bringAll, picked, picking, ready, screen, some, walk, onClose]);


  /* ------------------------ WHAT THE LIST STILL OWES ----------------------- */
  // Both answers survive the redesign, because they are corrections and not
  // taste.
  //
  //   THE TOTAL LIVES OUTSIDE THE SCROLL. Measured on the real card: eight
  //   folders, five of them below the fold, and a scrollbar zero pixels wide.
  //   Nothing on the screen said the number eight, so pressing the button
  //   without ever knowing what it was about to do was the ordinary path.
  //
  //   A PROJECT IS A THING YOU CAN TICK, and with nothing ticked when the screen
  //   opens, one project is ONE press. It took thirteen to fifteen on the old
  //   card.

  // HOW MANY PROJECTS ARE UNDER THE FOLD, counted off the real list rather than
  // guessed from a height. Measured on the real card: eight folders, five of
  // them below a fold nothing on the screen mentioned.
  const scroller = useRef<HTMLDivElement | null>(null);
  const [below, setBelow] = useState(0);
  const gauge = useCallback(() => {
    const el = scroller.current;
    if (!el) { setBelow(0); return; }
    // MEASURED OFF THE SCREEN, not off `offsetTop`. `offsetTop` is relative to
    // whichever ancestor happens to be positioned, which in a modal is not this
    // list, and comparing it to a scrollTop counted three of these wrong.
    const box = el.getBoundingClientRect();
    const heads = [...el.querySelectorAll<HTMLElement>('[data-sec]')];
    setBelow(heads.filter((h) => h.getBoundingClientRect().top + 10 > box.bottom).length);
  }, []);
  useEffect(() => { gauge(); });
  const moreBelow = below > 0 && (
    <button className="ia-more" onClick={() => {
      const el = scroller.current;
      if (el) el.scrollBy({ top: el.clientHeight - 44, behavior: 'smooth' });
    }}>{countWord(below)} more below</button>
  );

  const total = totalLine(dests);
  const stateOf = (d: Destination) => sectionState(d, picked);
  const whole = (d: Destination) => setPicked(toggleSection(dests, picked, d.key));
  const opened = (k: string) => open.includes(k);
  const flip = (k: string) => setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const nameOf = (d: Destination) => (d.kind === 'everywhere' ? SECTION.everywhere : d.name);
  const press = pressLine(dests, picked);

  /**
   * THE TICK, AND IT IS NOT A FORM CONTROL. The filled blue-grey box the card
   *  wore was the loudest thing on it fifteen times over. This is a hairline
   *  square that only carries ink when it is on, and a bar when a project is
   *  half kept. */
  const Box = ({ s }: { s: 'all' | 'some' | 'none' }) => (
    <span className={`ia-box is-${s}`} aria-hidden="true">
      {s === 'all' && <Tick />}
      {s === 'some' && <span className="ia-half" />}
    </span>
  );

  /**
   * ONE AGENT. The description is one line and clipped at the end of the line
   *  rather than mid-word, because fifteen half-finished sentences is what a
   *  wall of grey is made of. */
  const agentRow = (a: AgentFile) => {
    const kept = on.has(a.path);
    return (
      <button
        key={a.path}
        className={kept ? 'ia-agent on' : 'ia-agent'}
        aria-pressed={kept}
        onClick={() => setPicked(togglePicked(dests, picked, a.path))}
      >
        <Box s={kept ? 'all' : 'none'} />
        <span className="ia-agent-text">
          <span className="ia-agent-name">{a.title}</span>
          {a.line && <span className="ia-agent-line">{a.line}</span>}
        </span>
      </button>
    );
  };

  /**
   * ONE THREAD SHE HAD. The same row as an agent's, because on this card they
   * are the same act: a thing on her Mac, ticked, to land in an inbox.
   *
   *  The name is the first thing typed into it, and the line under it is
   *  when and where, which is the whole of what tells the two kinds apart on a
   *  screen with both. An agent's line is what it does and it never has a day of
   *  the week in it; "In a terminal, yesterday" cannot be read as a description
   *  of a helper. That is why there is no heading over these, and no badge on
   *  them: every review of this card found too much text on it. */
  const threadRow = (t: SessionThread) => {
    const kept = on.has(t.path);
    const when = whenWords(t.when);
    const said = `${startedIn(t.source)}${when ? `, ${when}` : ''}`;
    return (
      <button
        key={t.path}
        className={kept ? 'ia-agent on' : 'ia-agent'}
        aria-pressed={kept}
        onClick={() => setPicked(togglePicked(dests, picked, t.path))}
      >
        <Box s={kept ? 'all' : 'none'} />
        <span className="ia-agent-text">
          <span className="ia-agent-name">{t.title}</span>
          <span className="ia-agent-line">{`${said[0].toUpperCase()}${said.slice(1)}`}</span>
        </span>
      </button>
    );
  };

  /**
   * WHERE THE HOME FOLDER SET LANDS. Its agents work in every project, so
   *  something has to name one, and the name is the control that changes it.
   *  The one sentence on the card that is a question rather than a statement. */
  const homeLine = (d: Destination) => (
    <span className="ia-goes">
      {all.length > 0 ? (
        <>
          {SECTION.landBefore}{' '}
          <button
            type="button"
            className="ia-word"
            aria-expanded={picking}
            onClick={(e) => { e.stopPropagation(); if (all.length > 1) setPicking((v) => !v); }}
          >{name}</button>{SECTION.landAfter}
        </>
      ) : SECTION.landNowhere}
      {picking && all.length > 1 && (
        <span className="ia-projects" role="listbox">
          {all.map((p) => (
            <button
              key={p.slug}
              role="option"
              aria-selected={p.slug === project}
              className={p.slug === project ? 'ia-project on' : 'ia-project'}
              onClick={(e) => { e.stopPropagation(); setPicking(false); setProject(p.slug); }}
            >{p.name}</button>
          ))}
        </span>
      )}
    </span>
  );

  /* ------------------------------- THE DOORS ------------------------------ */
  // So this screen is two sentences and a number. The first door says how many
  // agents it is about to take and, under it, how many projects that makes,
  // because making five projects in her sidebar is news and news goes before the
  // press rather than in the toast after it.
  const doors = (
    <div className="ia-doors">
      <button className="ia-door is-first" onClick={bringAll} disabled={busy}>
        <span className="ia-door-name">{bringAllLine(dests)}<kbd>⌘↵</kbd></span>
        <span className="ia-door-why">{pressLine(dests, allPicked(dests)) || CARD.foot}</span>
      </button>
      <button className="ia-door" onClick={() => setScreen('pick')}>
        <span className="ia-door-name">{DOOR.pick}</span>
        <span className="ia-door-why">{DOOR.pickWhy}</span>
      </button>
      {/* The one promise the card keeps on both screens, because door one is a
          single press that makes projects and it is the press that most needs
          to be told nothing is moved. */}
      <p className="ia-read">{DOOR.never}</p>
    </div>
  );

  /* --------------------------- THE CHOOSE SCREEN -------------------------- */
  // ONE screen, never a walk. Every project is a closed block, so eight of them
  // are eight lines and not a wall, and opening one is how you get to its
  // agents.
  const chooser = (
    <>
    <div className={below > 0 ? 'ia-scroll ia-stack ia-fading' : 'ia-scroll ia-stack'}
      ref={scroller} onScroll={gauge}>
      {dests.map((d) => (
        <div className={opened(d.key) ? 'ia-blk open' : 'ia-blk'} key={d.key} data-sec="">
          <div className="ia-blk-head">
            <button className="ia-pick" onClick={() => whole(d)}
              aria-label={`Keep everything in ${nameOf(d)}`}><Box s={stateOf(d)} /></button>
            <button className="ia-blk-main" onClick={() => flip(d.key)} aria-expanded={opened(d.key)}>
              <span className="ia-blk-line">
                <span className="ia-blk-name">{nameOf(d)}</span>
                {d.kind === 'new' && <span className="ia-tag">{SECTION.newBadge}</span>}
                {/* The count and the mark are one thing, on the right: the
                    number says how many are inside and the caret says you can
                    go and look at them. The number on its own read as a fact
                    about the row rather than a door into it. */}
                <span className="ia-blk-n">{SECTION.n(picksOf(d))}</span>
                <Caret />
              </span>
              <span className="ia-blk-where">
                {d.kind === 'everywhere' ? <>{SECTION.homeFolder}. {homeLine(d)}</> : d.where}
              </span>
            </button>
          </div>
          {/* Agents first, then the threads, newest first as they arrive. Not
              because agents matter more, but because a section's order has to be
              the same every time she opens it, and the agent list is the one
              that does not change while she is looking at it. */}
          {opened(d.key) && (
            <div className="ia-blk-list">
              {d.items.map(agentRow)}
              {(d.threads ?? []).map(threadRow)}
            </div>
          )}
        </div>
      ))}
    </div>
    {moreBelow}
    </>
  );

  // Side by side, One at a time and One line each were deleted here on
  // 2026-08-26, with Stacked's "Only this" shortcut and the `New project`
  // sentence. Their copy is in decisions.md under round five, verbatim, so
  // nothing is unrecoverable and nothing is still switchable.

  const body = screen === 'pick' ? chooser : doors;

  return (
    // A BACKDROP THAT CLOSES IS A WAY OUT, so inside the walk it is not one.
    // Same scrim, same card, and a click beside it does nothing.
    <div className="modal-backdrop compose-backdrop" onClick={walk ? undefined : onClose}>
      <div className={`modal ia-card on-${screen}${walk ? ' in-walk' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* THE HEADER NEVER SCROLLS, and the count is in it for that reason.
            On the choose screen the headline becomes the way back, because a
            second screen with no way off it is the rejected eight-page walk. */}
        <div className="ia-top">
          {screen === 'pick' ? (
            <button className="ia-back" onClick={() => setScreen('door')}>{DOOR.pick}</button>
          ) : (
            /*
             * THE HEADLINE SAYS WHICH OF THE TWO CARDS THIS IS (
               2026-08-28). `head` promises to bring agents across and there is
               nothing to promise on a Mac with none, which is the screen seen
               on 08-24: a headline offering agents over a line saying
               there were none. Now the headline is the answer and the lines
               under it say where {NAME} looked. */
            <h1 className="ia-head">{read && !some ? CARD.headNone : CARD.head}</h1>
          )}
          {/* ALL AND NONE WERE HERE AND THEY ARE DELETED (2026-08-26).

                ALL was door one, one screen later. Pressing it ticked all
                sixteen and the button read "Bring in 16 agents", which is the
                door she had just walked past to get here — it says "Bring in
                all 16 agents". Two words on this screen for the thing the
                previous screen is entirely about.

                NONE was the state this screen already opens in. It ticks
                nothing at open (`picked` starts empty), so on arrival None
                pointed at no change at all.

              What is left is the total, which is the one thing in this header
              that says something the list cannot: how much is under the fold.
           */}
          {read && some && (
            <div className="ia-top-right">
              <span className="ia-total">{total}</span>
            </div>
          )}
        </div>

        {/* WHERE THESE NAMES CAME FROM, on the walk only and on the door screen only. Out in
           ⌘K it is not needed at all: nobody reaches that card by accident.
         */}
        {walk && screen === 'door' && some && <p className="ia-offer">{walk.line}</p>}

        {!read && <div className="ia-empty">{CARD.reading}</div>}

        {/* AND WHEN THERE IS NOTHING ON THE MAC. Two lines under the headline and no third:
           where Agentbox looked, and how to come back to this when there is something to
           bring.

            `Look again` is a real re-read of both halves, for the person who
            installs Claude Code with this screen still open.
         */}
        {read && !some && (
          <div className="ia-none">
            <p className="ia-none-where">{alreadyIn > 0 ? CARD.allIn(alreadyIn) : CARD.noneWhere(SECTION.homeFolder)}</p>
            <p className="ia-none-later">{CARD.noneLater}</p>
            <button type="button" className="ia-look-again" onClick={lookAgain} disabled={looking}>
              {looking ? CARD.looking : CARD.lookAgain}
            </button>
          </div>
        )}

        {read && some && body}

        {read && some && all.length === 0 && !dests.some((d) => d.kind === 'new') && (
          <p className="ia-line">
            {CARD.noProject}{' '}
            <button type="button" className="ia-word" onClick={onNewProject}>{CARD.newProject}</button>
          </p>
        )}

        {read && some && screen === 'pick' && (
          <>
            {/* WHAT THE PRESS IS ABOUT TO DO, said before it rather than after.
                A project being made is news, so it is named here and not left
                to the toast. */}
            <p className="ia-read">
              {COPY.agentsRead}
              {press && <> {press}</>}
            </p>
            <div className="ia-foot">
              <button className="dock-send" disabled={!ready || busy} onClick={() => bring(picked)}>
                {goLine(dests, picked)} <kbd>⌘↵</kbd>
              </button>
            </div>
          </>
        )}

        {/* THE WAY PAST THE OFFER, IN THE WALK ONLY. Quiet, because it is not
            the recommendation and this screen is the offer; present on every
            state of the door screen, because the card it replaced could always
            be finished with nothing ticked, and a setup that will not let you
            into the app until you import something is a worse card than the one
            it replaces. Not on the choose screen: there the way back
            is the headline and the way on is the button under the list. */}
        {walk && screen === 'door' && (
          <button type="button" className="ia-walk-on" onClick={walk.onSkip} disabled={busy}>
            {walk.skip}
          </button>
        )}
      </div>
    </div>
  );
}

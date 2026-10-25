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
//
// AND NOW IT IS ONE TICKED LIST (w-db6f5e331e, 2026-10-05). The founder, over
// the old two-screen card with a block per folder: "very confusing, can't
// figure out what it does or how it works. super cluttered". Her pick of three
// drawings: "Every recent conversation is a single line, already ticked,
// showing where it came from and when. One button: 'Add 6 to your inbox'. No
// folders, no project tags, no second screen." `destinations` still decides
// where each line lands; the card just no longer draws it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { SEND, sayKeys } from '../this-keyboard';
import { type AgentFile } from '../onboarding';
import {
  CARD, LIST, PICKUP, SEARCH, SECTION, canBring, listLine, destinations, folderOfProject, countKinds, importLines, nameOfProject,
  finishedForDone, matchesName, pickupChats, pickupLine, pickupLines, projectAtOpen, reachLine, searchLines,
  type AgentFolder, type PickupLine, type Project, type SessionThread,
} from '../agent-import-card';

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
    added: number; already: number; name: string; inboxes: number; made: string[]; noun?: string; done?: number;
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
  // WHAT SHE UNTICKED, BY PATH. Every line starts ticked (her pick, Option A),
  // so the card keeps the exceptions rather than the ticks: a line that arrives
  // late, or after Look again, arrives ticked like the rest. By path because two
  // folders can both hold an agent called `code-reviewer`.
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
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
  /* ----------------------- FINDING AN OLDER ONE ------------------------- */
  // THE TEN DAYS ABOVE ARE THE LIST. THIS IS HOW YOU REACH PAST THEM
  // (w-6418318cd5, the idea from GitHub #31). A chat from July could not be
  // brought in at all, because the only list the card ever drew was the recent
  // one.
  //
  // THE DEEP READ HAPPENS ONCE, ON THE FIRST KEYSTROKE, and never on open: it
  // is a year of transcripts rather than ten days, and a card that took it
  // every time it appeared would be slow for everybody to buy something most
  // people never press. Afterwards it is held by the main process, so every
  // keystroke after the first filters a list that is already in hand.
  const [query, setQuery] = useState('');
  const [deep, setDeep] = useState<SessionThread[] | null>(null);
  const [reached, setReached] = useState(0);
  const searching = query.trim().length > 0;
  useEffect(() => {
    if (!searching || deep) return;
    let live = true;
    (async () => {
      const r = await api.searchAgentThreads();
      if (!live) return;
      setDeep(r.threads);
      setReached(r.reached);
    })();
    return () => { live = false; };
  }, [searching, deep]);

  /**
   * WHAT A SEARCH PUT ON THE LIST AND YOU KEPT.
   *
   *  A match is NOT ticked when it arrives: you typed four letters and nine
   *  rows came back, and not one of them is a row you chose. The ten-day list
   *  is the opposite and stays the opposite, because arriving ticked is the
   *  founder's own pick on that list (w-db6f5e331e).
   *
   *  Ticking a match moves it HERE, and this joins the ten days. So clearing
   *  the field does not quietly drop what you found: the chat from July is on
   *  the list under the field, ticked, counted by the button, and visible. A
   *  button that counted rows which were not on the screen is the silence this
   *  card has been correcting since the scrollbar. */
  const [kept, setKept] = useState<SessionThread[]>([]);

  // A PROJECT MADE HERE IS USABLE HERE, IMMEDIATELY. The app's own product list
  // arrives on the next refresh, and until it does the card would have a project
  // chosen that it cannot find a name or a folder for.
  const [made, setMade] = useState<Project[]>([]);

  const all = useMemo(
    () => [...products, ...made.filter((m) => !products.some((p) => p.slug === m.slug))],
    [products, made],
  );

  const folder = folderOfProject(all, project);

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
  const offered = useMemo(() => {
    const recent = (threads ?? []).filter((t) => !t.imported);
    // Anything kept out of a search joins them, deduped by path, so one chat
    // can never be two rows on this card.
    const seen = new Set(recent.map((t) => t.path));
    return [...recent, ...kept.filter((t) => !seen.has(t.path))];
  }, [threads, kept]);
  const alreadyIn = (threads?.length ?? 0) - (threads ?? []).filter((t) => !t.imported).length;
  const dests = useMemo(
    () => destinations({ found, folders: others ?? [], products: all, project, threads: offered }),
    [found, others, all, project, offered],
  );

  // THE MATCHES, BUILT THROUGH THE SAME TWO FUNCTIONS AS THE LIST, so a chat
  // found by name reads exactly the way the recent ones read and lands in the
  // same inbox by the same rule. Anything already in the inbox is left out,
  // and so is anything the ten-day list is already showing.
  const deepDests = useMemo(
    () => destinations({
      found: null,
      folders: others ?? [],
      products: all,
      project,
      threads: (deep ?? []).filter((t) => !t.imported),
    }),
    [deep, others, all, project],
  );
  const hits = useMemo(() => searchLines(importLines(deepDests), query), [deepDests, query]);

  const lines = useMemo(() => importLines(dests), [dests]);
  const picked = useMemo(() => lines.map((l) => l.path).filter((p) => !unticked.has(p)), [lines, unticked]);

  // SETUP'S LAST SCREEN, AS APPROVED (R1, w-62228098e6): the chats you were in
  // the middle of, the finished ones from this week sent to Done, and the tick
  // that keeps new chats coming. A Mac with no chats keeps the list below.
  const chats = useMemo(() => pickupChats(threads ?? []), [threads]);
  const pickup = !!walk && threads !== null && chats.waiting.length + chats.finished.length > 0;
  const askLines = useMemo(() => pickupLines(dests), [dests]);
  const pickedAsks = useMemo(() => askLines.filter((l) => !unticked.has(l.path)).map((l) => l.path), [askLines, unticked]);
  const toDone = useMemo(() => finishedForDone(dests, chats.finished, pickedAsks), [dests, chats.finished, pickedAsks]);
  const [keepNew, setKeepNew] = useState(true);
  const flip = (path: string) => setUnticked((u) => {
    const next = new Set(u);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });
  // Ticking a match keeps it; unticking it gives it back. The row's tick reads
  // `kept` rather than `unticked`, because a match arrives off.
  const keptPaths = useMemo(() => new Set(kept.map((t) => t.path)), [kept]);
  const flipHit = (path: string) => setKept((was) => {
    if (was.some((t) => t.path === path)) return was.filter((t) => t.path !== path);
    const found = (deep ?? []).find((t) => t.path === path);
    return found ? [...was, found] : was;
  });
  const some = lines.length > 0;
  /**
   * WHAT THE BUTTON IS ABOUT TO ADD, AND IT IS ALWAYS WHAT IS ON THE SCREEN.
   *
   *  While a name is typed the recent list is not drawn, so a button counting
   *  it would be naming twenty-one rows nobody can see — the same silence the
   *  zero-pixel scrollbar was keeping, in the one place this card has been
   *  corrected twice already. So searching, it counts the matches you ticked;
   *  otherwise the list under it. Clearing the field puts those matches on the
   *  recent list, ticked, so the number only ever grows by things you can look
   *  at. */
  const onScreen = useMemo(
    () => (searching ? hits.filter((h) => keptPaths.has(h.path)).map((h) => h.path) : picked),
    [searching, hits, keptPaths, picked],
  );
  // THE MAC HAS BEEN READ, all three ways. Stated once, because the card asks
  // this question in seven places and a card that has read two of the three is
  // a card that says a number it is about to change.
  const read = !!found && !!others && threads !== null;
  const ready = canBring({ read, picked: onScreen, dests });
  // Once per card: a second read on "look again" would count the same offer twice.
  const toldOffered = useRef(false);
  useEffect(() => {
    if (!walk || !read || toldOffered.current) return;
    toldOffered.current = true;
    try { window.zero?.track?.('import_offered', pickup ? askLines.length : lines.length); } catch {}
  }, [walk, read, lines.length, pickup, askLines.length]);

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
      let done = 0;
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
          // Waiting on you to Needs you, finished to Done, as setup and the switch file them.
          const r = await api.importThreads({ product: slug, threads: load.ids, land: 'sorted' });
          added += r.added; already += r.already;
          done += r.done ?? 0;
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
          const got = await api.createProduct({ name: f.name, repoPath: f.folder, ofMany: true }) as { slug?: string } | null;
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
      // ONE PRESS, ONE "A REPO WAS CONNECTED", WITH HOW MANY (w-1116fbb68a,
      // 2026-10-08). `zero:create-product` counts a single connect itself and
      // is told to stay quiet above, because nine folders in one press sent
      // nine events and read as nine separate connections. `newly` is only
      // pushed for a project the store really made, so a folder it refused is
      // not in the number either. A name and a number is all the window may
      // send, which is exactly what this is.
      if (newly.length) { try { window.zero?.track?.('repo_connected', newly.length); } catch {} }
      if (walk) { try { window.zero?.track?.('import_taken', added); } catch {} }
      // WHICH WORD THE TOAST USES FOR "THAT ONE ALREADY HAS A ROW". Only the
      // singular needs it, and only one kind can be in a press of one.
      const kinds = countKinds(dests, paths);
      onDone({
        added, already, name: inboxes === 1 ? landed : '', inboxes, made: newly,
        noun: kinds.agents ? 'agent' : 'thread', done,
      });
    } finally { setBusy(false); }
  }, [busy, dests, all, onDone, onProjectMade, walk]);

  /**
   * R1'S ONE PRESS: the ticked waiting chats into Needs you, the finished ones
   *  from this week into Done, and the switch for new chats as the tick left
   *  it. With nothing to bring it is the way on. */
  const pressPickup = useCallback(async () => {
    if (busy) return;
    const take = [...pickedAsks, ...toDone.map((t) => t.path)];
    try { await api.setWorkspaceSetting({ key: 'importNew', value: keepNew }); } catch { /* the import still happens */ }
    if (take.length) await bring(take);
    else walk?.onSkip();
  }, [busy, pickedAsks, toDone, keepNew, bring, walk]);

  // ⌘↵ ADDS WHAT IS TICKED, the key that carries every card in this app, and
  // Escape closes. Plain Enter is left to whichever tick she is standing on.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // ESCAPE UNDOES THE SMALLEST THING FIRST. With a word in the name
        // field it empties the field and puts the recent list back; a key that
        // shut the whole card from under a half-typed search would throw away
        // every match you had already ticked.
        if (searching) { setQuery(''); return; }
        // INSIDE THE WALK IT STOPS THERE. Escape would put her in an app the
        // setup has not handed over yet. The way on is the walk's own button.
        if (walk) return;
        onClose();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (pickup) { pressPickup(); return; }
        // AND ON A MAC WITH NOTHING TO BRING, ⌘↵ IS THE WAY ON. The walk
        // teaches ⌘↵ as the key that carries every card, so on its last screen
        // with nothing on it the key has to do the one thing left to do.
        if (walk && !some) { walk.onSkip(); return; }
        if (ready) bring(onScreen);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [bring, onScreen, ready, some, walk, onClose, searching, pickup, pressPickup]);


  /**
   * THE TICK, AND IT IS NOT A FORM CONTROL. A hairline square that only
   *  carries ink when it is on. */
  const Box = ({ on }: { on: boolean }) => (
    <span className={`ia-box is-${on ? 'all' : 'none'}`} aria-hidden="true">
      {on && <Tick />}
    </span>
  );

  /**
   * ONE LINE: the tick, what it is, and where it came from and when. Nothing
   *  else, and no heading over any group of them. */
  const lineRow = (l: { path: string; title: string; meta: string }) => {
    const on = !unticked.has(l.path);
    return (
      <button key={l.path} className={on ? 'ia-agent ia-line-row on' : 'ia-agent ia-line-row'}
        aria-pressed={on} onClick={() => flip(l.path)}>
        <Box on={on} />
        <span className="ia-agent-name">{l.title}</span>
        <span className="ia-line-meta">{l.meta}</span>
      </button>
    );
  };

  /** A waiting chat, with the question it ended on under its name. */
  const askRow = (l: PickupLine) => {
    const on = !unticked.has(l.path);
    return (
      <button key={l.path} className={`ia-agent ia-line-row has-ask${on ? ' on' : ''}`}
        aria-pressed={on} onClick={() => flip(l.path)}>
        <Box on={on} />
        <span className="ia-agent-name">
          {l.title}
          {l.ask && <span className="ia-ask">{l.ask}</span>}
        </span>
        <span className="ia-line-meta">{l.meta}</span>
      </button>
    );
  };

  /** The same row, drawn off `kept`, because a match arrives unticked. */
  const hitRow = (l: { path: string; title: string; meta: string }) => {
    const on = keptPaths.has(l.path);
    return (
      <button key={l.path} className={on ? 'ia-agent ia-line-row on' : 'ia-agent ia-line-row'}
        aria-pressed={on} onClick={() => flipHit(l.path)}>
        <Box on={on} />
        <span className="ia-agent-name">{l.title}</span>
        <span className="ia-line-meta">{l.meta}</span>
      </button>
    );
  };

  /**
   * THE NAME FIELD. Not a button in the inbox header, which is where GitHub
   *  #31 put it: that header carries what is pressed every day and this is
   *  pressed when you remember something. It is on the card the two existing
   *  doors already open (⌘K, and New thread), where somebody already looking
   *  at their recent chats can say "not these, the one about pricing". */
  const field = (
    <div className="ia-find">
      <input
        className="ia-find-box"
        type="text"
        value={query}
        placeholder={SEARCH.placeholder}
        aria-label={SEARCH.placeholder}
        onChange={(e) => setQuery(e.target.value)}
      />
      {/* ONE LINE UNDER THE FIELD, never two: what this field is for before
          anybody types, and what it found afterwards, with the way back to the
          recent list at the right end of the same line. */}
      <div className="ia-find-under">
        <span className="ia-find-hint">
          {!searching
            ? SEARCH.hint
            : deep === null
              ? SEARCH.looking
              : <>
                {hits.length ? SEARCH.found(hits.length) : SEARCH.none(query.trim())}
                {reachLine(reached) && <span className="ia-find-reach"> {reachLine(reached)}</span>}
              </>}
        </span>
        {searching && <button type="button" className="ia-find-clear" onClick={() => setQuery('')}>{SEARCH.clear}</button>}
      </div>
    </div>
  );



  if (pickup && walk) {
    const n = pickedAsks.length;
    return (
      <div className="modal-backdrop compose-backdrop in-walk">
        <div className="modal ia-card ia-one in-walk" onClick={(e) => e.stopPropagation()}>
          <div className="ia-top"><h1 className="ia-head">{PICKUP.head}</h1></div>
          <p className="ia-line">{pickupLine(askLines.length ? chats.waiting : [])}</p>
          {askLines.length > 0 && <div className="ia-scroll ia-lines">{askLines.map(askRow)}</div>}
          {toDone.length > 0 && <p className="ia-done-note">{PICKUP.finished(toDone.length)}</p>}
          <div className="ia-lines ia-keep">
            <button className={`ia-agent ia-line-row${keepNew ? ' on' : ''}`} aria-pressed={keepNew}
              onClick={() => setKeepNew((v) => !v)}>
              <Box on={keepNew} />
              <span className="ia-agent-name">{PICKUP.keep}</span>
            </button>
          </div>
          <div className="ia-foot ia-foot-one">
            <button className="dock-send" disabled={busy} onClick={pressPickup}>
              {PICKUP.go(n)} <kbd>{SEND}</kbd>
            </button>
            <button type="button" className="ia-not-now" onClick={walk.onSkip} disabled={busy}>{PICKUP.notNow}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    // A BACKDROP THAT CLOSES IS A WAY OUT, so inside the walk it is not one.
    // Same scrim, same card, and a click beside it does nothing. `in-walk` lifts
    // it over setup's veil, which otherwise lay on top of it and dimmed it.
    <div className={`modal-backdrop compose-backdrop${walk ? ' in-walk' : ''}`} onClick={walk ? undefined : onClose}>
      <div className={`modal ia-card ia-one${walk ? ' in-walk' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* THE HEADLINE SAYS WHICH CARD THIS IS (2026-08-28): the offer when
            there is something to bring, the plain answer when there is not. */}
        <div className="ia-top">
          {/* AND IT SAYS "RECENT" ONLY OVER THE RECENT LIST (w-6418318cd5).
              A search puts chats from March on this card, and a headline
              offering "your recent agents" over them is the same sentence
              disagreeing with the screen that this card keeps being fixed
              for. */}
          <h1 className="ia-head">{searching ? SEARCH.head : read && !some ? (alreadyIn > 0 ? CARD.headAllIn : CARD.headNone) : LIST.head}</h1>
        </div>
        {read && some && !searching && <p className="ia-line">{listLine(threads ?? [], Date.now(), kept.length > 0)}</p>}

        {!read && <div className="ia-empty">{CARD.reading}</div>}

        {/* THE FIELD IS THERE EVEN WHEN THE TEN DAYS ARE EMPTY, which is the
            one state it matters most in: nothing this week does not mean
            nothing in July, and before this that screen was a dead end. */}
        {read && field}

        {searching && deep !== null && hits.length > 0 && (
          <div className="ia-scroll ia-lines">{hits.map(hitRow)}</div>
        )}

        {/* AND WHEN THERE IS NOTHING ON THE MAC. Two lines under the headline and no third:
           where Agentbox looked, and how to come back to this when there is something to
           bring.

            `Look again` is a real re-read of both halves, for the person who
            installs Claude Code with this screen still open.
         */}
        {read && !some && !searching && (
          <div className="ia-none">
            <p className="ia-none-where">{alreadyIn > 0 ? CARD.allIn(alreadyIn) : CARD.noneWhere(SECTION.homeFolder)}</p>
            <p className="ia-none-later">{sayKeys(alreadyIn > 0 ? CARD.laterAllIn : CARD.noneLater)}</p>
            <button type="button" className="ia-look-again" onClick={lookAgain} disabled={looking}>
              {looking ? CARD.looking : CARD.lookAgain}
            </button>
          </div>
        )}

        {read && some && !searching && (
          <div className="ia-scroll ia-lines">{lines.map(lineRow)}</div>
        )}

        {read && some && all.length === 0 && !dests.some((d) => d.kind === 'new') && (
          <p className="ia-line">
            {CARD.noProject}{' '}
            <button type="button" className="ia-word" onClick={onNewProject}>{CARD.newProject}</button>
          </p>
        )}

        {/* ONE BUTTON THAT SAYS HOW MANY, and the way past it. Inside the walk
            the way past is the walk's own button, because a setup that will not
            let you into the app until you import something is worse than one
            that offers. */}
        {read && (some || searching) && (
          <div className="ia-foot ia-foot-one">
            <button className="dock-send" disabled={!ready || busy} onClick={() => bring(onScreen)}>
              {LIST.add(onScreen.length)} <kbd>{SEND}</kbd>
            </button>
            <button type="button" className="ia-not-now" onClick={walk ? walk.onSkip : onClose} disabled={busy}>
              {walk ? walk.skip : LIST.notNow}{!walk && <kbd>esc</kbd>}
            </button>
          </div>
        )}
        {walk && read && !some && (
          <button type="button" className="ia-walk-on" onClick={walk.onSkip} disabled={busy}>
            {walk.skip}
          </button>
        )}
      </div>
    </div>
  );
}

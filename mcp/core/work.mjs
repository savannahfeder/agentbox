// Work items across every product: the unified queue.
//
// The substrate is deliberately thin. It knows how to hold an item, hand it to
// exactly one worker, and let go when that worker dies. It does NOT know what
// work is worth doing, what a milestone is, when to ask the founder, or whether
// a category has earned the right to act without asking. Every one of those is
// going to be rewritten several times as the surface above learns what it
// actually needs, and a substrate that had opinions about them would have to be
// rewritten alongside.
//
// The heartbeat lives here rather than in a tool, and that is a load-bearing
// choice. A heartbeat tool would depend on the model remembering to call it
// during work that is, by definition, absorbing its attention; it would forget,
// and a healthy worker would lose its claim mid-task, which is the worst version
// of this failure. Instead the SERVER PROCESS beats while it holds anything. The
// process lives exactly as long as the agent session that spawned it, so:
// session dies, child dies, beating stops, lease lapses, the item comes back.
// Liveness for free, and nothing to remember.

import path from 'node:path';
import { listProjects } from '../../main/store/project.mjs';
import {
  readWorkItems, readWorkItem, createWorkItem, updateWorkItem,
  claimWorkItem, heartbeatWorkItem, releaseWorkItem, LEASE_MS,
} from '../../main/store/work-items.mjs';
import { matchesFilter } from '../../shared/work-items.mjs';
import { unleaked } from '../../shared/agents.mjs';
import { CONTEXT_WORDS, DONE_STEPS, DONE_STEP_WORDS, SUMMARY_WORDS, doneSteps, wordsIn } from '../../shared/thread-cards.mjs';
import {
  parkPendingWrite, readPendingWrites, collectPendingWrites,
} from '../../main/store/pending-writes.mjs';
import { resolveProduct } from './account.mjs';
import { nameSlug } from '../../shared/product-name.mjs';

// The log prefix, named from the one place the app is named. It was a literal
// for as long as this server lived in another product's repo.
const LOG = `[${nameSlug}-store]`;

// Beat at a third of the lease, so two consecutive misses (a busy event loop, a
// slow disk) still leave a full beat of margin before anything lapses.
const HEARTBEAT_MS = Math.floor(LEASE_MS / 3);

/** Every work item across every product, newest activity first. */
export function listWorkItems({ product = null, status = null, kind = null, labels = null, includeDone = false, now = Date.now() } = {}) {
  const projects = product ? [resolveProduct(product)] : listProjects();
  const out = [];

  for (const p of projects) {
    let items = [];
    try { items = readWorkItems(p.dir, now); } catch { continue; } // a product with no ledger has no work
    for (const item of items) {
      if (!includeDone && item.status === 'done') continue;
      if (status && item.status !== status) continue;
      if (!matchesFilter(item, { kind, labels })) continue;
      out.push({ ...item, product: p.id, productName: p.name });
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Find which product owns an id, so callers do not have to track it. */
function locate(id, { product = null } = {}) {
  if (product) {
    const p = resolveProduct(product);
    const item = readWorkItem(p.dir, id);
    if (!item) throw new Error(`no work item ${id} in ${p.name}`);
    return { project: p, item };
  }
  for (const p of listProjects()) {
    let item = null;
    try { item = readWorkItem(p.dir, id); } catch { continue; }
    if (item) return { project: p, item };
  }
  throw new Error(`no work item ${id} in any product`);
}

// THE WORDS AN AGENT SENDS, WITH A LEAKED TOOL CALL CUT OFF THEM.
//
// `unleaked` holds what leaks and the row it cost. It is applied here, at the
// boundary where an agent's text arrives, and NOT in the store: the store also
// holds what the user typed, and the user's words are theirs whatever they
// contain. The pane cuts it again on the way out, because the rows that
// already carry it are still on screen.
const WORDS = ['result', 'note', 'body', 'title', 'label'];

function saidPlainly(fields, source) {
  if (source === 'founder' || !fields) return fields;
  const out = { ...fields };
  for (const f of WORDS) {
    if (typeof out[f] === 'string') out[f] = unleaked(out[f]);
  }
  return out;
}

export function createItem(product, fields = {}, { source = 'agent', from = [] } = {}) {
  const p = resolveProduct(product);
  const sources = [...from, fields.parent].filter(Boolean).map((id) => { try { return locate(id).item; } catch { return null; } });
  const kept = fields.visibility ? {} : privacyFrom(sources);
  const item = createWorkItem(p.dir, saidPlainly({ ...fields, ...kept }, source), { source });
  return { ...item, product: p.id, productName: p.name };
}

/*
 * A TASK AN AGENT FILES IS SEEN BY NO MORE PEOPLE THAN THE TASKS IT CAME FROM
 * (w-e053ed3581). The agent asked into a private chat holds a task seen only
 * by the chat, and what it files from there is written out of that chat; with
 * no word of its own, a filed task in a project that reads as the whole team
 * went on every teammate's board. So it takes the narrowest of its sources:
 * Private if any is, else only the people every one of them names. A source
 * with no word of its own leaves the project to decide, as before.
 */
export function privacyFrom(items) {
  let people = null;
  for (const item of items) {
    if (item?.visibility === 'private') return { visibility: 'private' };
    if (item?.visibility !== 'people') continue;
    const named = Array.isArray(item.visibleTo) ? item.visibleTo.filter(Boolean) : [];
    people = people ? people.filter((id) => named.includes(id)) : [...new Set(named)];
  }
  if (!people) return {};
  return people.length ? { visibility: 'people', visibleTo: people } : { visibility: 'private' };
}

export function updateItem(id, patch, { product = null, epoch = null, source = 'agent' } = {}) {
  const { project } = locate(id, { product });
  const item = updateWorkItem(project.dir, id, saidPlainly(patch, source), { epoch, source });
  return { ...item, product: project.id, productName: project.name };
}

/*
 * ONLY THE USER CLOSES A ROW THEY WROTE, UNLESS THEY SAID TO (w-e372d22a99).
 *
 * A worker's job on a row the user wrote is to return what was asked for. The
 * row closes only when the user asks for it to be closed.
 *
 * Until then a worker answered the ask and set it done in the same call, and
 * the row wore "Closed" from then on: on w-3384aa9e5c a worker claimed and
 * closed the row inside a minute, and the answer could only be found by
 * looking in Closed.
 *
 * So a `done` on a row labelled `founder` needs THE USER'S WORDS asking for it,
 * quoted in `closeBecause` and found in what they wrote on the row. Without
 * them the rest of the write lands and the row stays open: the answer reaches
 * the inbox as an answer (`answeredHerAsk`, list-rules.ts), and `awaitingHer`
 * (supervisor.mjs) keeps a second worker off it until the user speaks. The
 * quote is checked for being the user's, not for meaning close; that judgement
 * is the worker's, and the quote is what makes it one it has to make on purpose.
 *
 * A run of a repeating task is not a user's ask. The task was set up to run
 * daily and close quietly when there is nothing to say, so `repeat:` rows keep that.
 */
const plainly = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ')
  .trim();

export function herRow(item) {
  const labels = item?.labels ?? [];
  return labels.includes('founder') && !labels.some((l) => String(l).startsWith('repeat:'));
}

export function saidToClose(item, words) {
  const quote = plainly(words).replace(/^["'\s]+|["'.,!?\s]+$/g, '');
  if (quote.length < 4) return false;
  return [item?.answer, item?.body, item?.title].some((t) => plainly(t).includes(quote));
}

/*
 * A PUT-OFF THE USER ASKED FOR IS THEIRS (w-d6ea290028).
 *
 * A runAt an agent writes brakes workers and never hides the row
 * (`parkedByAgent`, list-rules.ts), so an agent cannot take its own question
 * out of the inbox. But "remind me in 4 days" asks for exactly that, and the
 * row sat in Needs you wearing Scheduled until Sunday, with the user unsure
 * whether closing it would lose the reminder.
 *
 * So a worker that quotes the user's own words asking for the put-off, in
 * `deferBecause`, checked exactly as `closeBecause` is, has the moment written
 * as the user's. That is what hides a row until it comes due, puts it in
 * Scheduled, and lets the user's L move it again.
 */
const DEFERRED_AS_AGENT = 'The put-off was saved as YOURS, not theirs, so the row stays in their inbox until then: the words in deferBecause are not ones they wrote on this row. If they did ask for it to be put off, send runAt again with deferBecause set to their exact words.';

/*
 * A SUMMARY LINE IS SHORT ENOUGH TO READ (w-b51b2e1c86). An agent's problem,
 * progress or solution over SUMMARY_WORDS words is taken out of the write and
 * the rest lands; the agent is told which line, how long, and to send it again.
 * Refused rather than cut, because a cut sentence says less than a short one.
 */
//
// Since w-54e9c7243f the summary is Context (`problem`, CONTEXT_WORDS) and Done
// (`progress`, at most DONE_STEPS lines of DONE_STEP_WORDS each); `solution`
// keeps the old one-sentence limit for any writer still sending it.
function takeOverLong(patch) {
  const said = [];
  if (typeof patch.problem === 'string' && wordsIn(patch.problem) > CONTEXT_WORDS) {
    said.push(`context, the problem field (${wordsIn(patch.problem)} words; ${CONTEXT_WORDS} at most)`);
    delete patch.problem;
  }
  if (typeof patch.progress === 'string') {
    const steps = doneSteps(patch.progress);
    const longest = Math.max(0, ...steps.map(wordsIn));
    if (steps.length > DONE_STEPS) said.push(`done, the progress field (${steps.length} steps; ${DONE_STEPS} at most, so keep the ones that matter)`);
    else if (longest > DONE_STEP_WORDS) said.push(`done, the progress field (a step of ${longest} words; ${DONE_STEP_WORDS} at most each)`);
    if (steps.length > DONE_STEPS || longest > DONE_STEP_WORDS) delete patch.progress;
  }
  if (typeof patch.solution === 'string' && wordsIn(patch.solution) > SUMMARY_WORDS) {
    said.push(`solution (${wordsIn(patch.solution)} words; ${SUMMARY_WORDS} at most)`);
    delete patch.solution;
  }
  if (!said.length) return {};
  return { summaryTooLong: `Not saved: ${said.join(', ')}. The summary has to fit the panel without scrolling; everything else you sent was written, and ${said.length === 1 ? 'that part keeps' : 'those parts keep'} what ${said.length === 1 ? 'it' : 'they'} said before. Send ${said.length === 1 ? 'it' : 'them'} again shorter.` };
}

const LEFT_OPEN = 'The row was left OPEN. The founder wrote it, and only she closes her own rows unless she asked you to: everything else you sent was written, and your answer reaches her inbox as an answer. If she did ask you to close it, send status done again with closeBecause set to her exact words asking for it.';

/**
 * What a refused write is told about itself. The sentence matters as much as
 * the file: the session that lost a night's work read "claim it first", had no
 * reason to think anything had survived, and ended its turn.
 */
function carried(parked) {
  if (!parked) return ' Your write could NOT be parked, so re-send it once you hold the claim.';
  return ` YOUR WRITE WAS NOT LOST: it is parked at ${parked.relPath} inside the product folder, and the next session to claim ${parked.item} is handed it. If this session should still be the one to say it, claim the item again and send it again.`;
}

/** What the session taking the row over is told at the moment it takes it. */
function pendingNotice(pending) {
  const n = pending.length;
  return `${n} write${n === 1 ? '' : 's'} to this row ${n === 1 ? 'was' : 'were'} refused when an earlier session lost its claim, and ${n === 1 ? 'it is' : 'they are'} waiting in \`pending\`. Nobody has seen ${n === 1 ? 'it' : 'them'}: not the founder, not the row. Read ${n === 1 ? 'it' : 'them'}, decide what is still true, and carry that into your own note or result. Your first write to this row files ${n === 1 ? 'it' : 'them'} as delivered.`;
}

/**
 * A registry of the claims THIS server process holds, and the timer that keeps
 * them alive. Purely in-memory, and that is correct: it describes this process's
 * liveness, and it is supposed to vanish when the process does.
 */
export function createClaimRegistry({ heartbeatMs = HEARTBEAT_MS, holder } = {}) {
  // `live` is the difference between holding the row and merely still being
  // allowed to speak on it. A finished row gives its claim straight back, so
  // nothing waits on a lease for work that is over, but the session keeps its
  // epoch: the founder replies to finished rows constantly, and the session she
  // is replying to has to be able to answer her.
  const held = new Map(); // workItemId -> { dir, epoch, pending, live }
  let timer = null;
  const liveCount = () => [...held.values()].filter((h) => h.live).length;

  const beat = () => {
    for (const [id, { dir, epoch, live }] of held) {
      if (!live) continue;
      try {
        const current = readWorkItem(dir, id);
        if (!current?.claim || current.epoch !== epoch || current.claim.holder !== holder) {
          held.get(id).live = false;
          continue;
        }
        heartbeatWorkItem(dir, id, { epoch, holder });
      } catch (err) {
        // A failed beat is not fatal: the lease still has two beats of margin,
        // and the next one may well succeed. Losing the claim is the correct
        // outcome if they all keep failing.
        console.error(`${LOG} heartbeat failed for ${id}: ${err?.message ?? err}`);
      }
    }
    stopTimer();
  };

  const ensureTimer = () => {
    if (timer || !liveCount()) return;
    timer = setInterval(beat, heartbeatMs);
    // Never keep the process alive just to beat: if the agent session is done,
    // this server should exit, and the lapse is exactly the signal we want.
    timer.unref?.();
  };

  const stopTimer = () => {
    if (timer && !liveCount()) { clearInterval(timer); timer = null; }
  };

  // Park a refused write in the product that owns the row. The lookup can fail
  // (an id that belongs to no product at all), and a failure to park must never
  // hide the refusal itself, so it degrades to a null and the caller still
  // throws.
  const parkIn = (dir, id, patch, epoch, reason) => {
    try {
      return parkPendingWrite(dir, id, patch, { holder, epoch, reason });
    } catch (err) {
      console.error(`${LOG} could not park a refused write for ${id}: ${err?.message ?? err}`);
      return null;
    }
  };

  const park = (id, patch, reason) => {
    let dir = null;
    try { dir = locate(id).project.dir; } catch { return null; }
    return parkIn(dir, id, patch, null, reason);
  };

  const registry = {
    holder,
    async claim({ product = null, id = null, filter = null }) {
      // A claim by id can address any product; a filtered pull walks products in
      // order until one yields, so a worker with nothing specific to do gets the
      // first available item anywhere rather than nothing.
      const projects = product ? [resolveProduct(product)] : (id ? [locate(id).project] : listProjects());

      for (const p of projects) {
        const result = await claimWorkItem(p.dir, { id, filter, holder });
        if (result.claimed) {
          // A write an earlier session had refused is handed over HERE, at the
          // moment the row changes hands, because that is the only moment a
          // session can be told something without having to remember to look.
          const pending = readPendingWrites(p.dir, result.item.id);
          held.set(result.item.id, { dir: p.dir, epoch: result.epoch, pending: pending.length > 0, live: true });
          ensureTimer();
          return {
            ...result,
            item: { ...result.item, product: p.id, productName: p.name },
            ...(pending.length ? { pending, pendingNotice: pendingNotice(pending) } : {}),
          };
        }
        // Asking for a specific id and being refused is an answer, not a reason
        // to go looking in other products.
        if (id) return result;
      }
      return { claimed: false, reason: 'nothing available in any product' };
    },

    /**
     * Finish or update an item this process holds, under its own epoch.
     *
     * A refused write is PARKED rather than dropped. Both refusals are covered
     * and they fail differently: not holding the claim throws here, while a
     * claim that lapsed and was taken by somebody else does not throw at all —
     * the line is appended and the fold quietly skips it, so the caller gets
     * back an item that looks fine and is missing every word it just wrote.
     * That second one is the quieter of the two and it reads the same to the
     * founder: a message that was never there.
     *
     * NOT HOLDING THE ROW IS NOW A REASON TO TAKE IT, NOT A REASON TO REFUSE.
     * The refusal was written for the case it almost never caught. Measured
     * across the 119 writes parked on the founder's store since 24 August 2026:
     * 99 were a session writing before it had claimed, and 12 were a session
     * writing again after finishing the row, which drops the claim from this
     * map. In all 111 the row was free to this session or already its own, and
     * the message was parked anyway, so 211,573 characters of finished agent
     * writing missed the row on the first attempt and the founder watched
     * sessions sit out a lease to say something they had already written. So a
     * write on a row we are not holding tries the claim first, and only parks
     * when the claim is genuinely refused, which means somebody else is on it.
     */
    async update(id, patch) {
      let holding = held.get(id);
      if (!holding?.live) {
        let taken = null;
        try { taken = await registry.claim({ id }); } catch { /* an id in no product: park below */ }
        const fresh = held.get(id);
        if (fresh?.live) holding = fresh;
        else if (!holding) {
          // Nobody handed it over and we have no standing on it, so this is the
          // refusal the fence exists for: somebody else is working the row.
          const why = taken?.heldBy
            ? `${id} is held by ${taken.heldBy}`
            : `${holder} could not take ${id} (${taken?.reason ?? 'no such work item'})`;
          const parked = park(id, patch, `${holder} was not holding ${id} when it wrote`);
          throw new Error(`${why}, so this write could not be made.${carried(parked)}`);
        }
        // Otherwise the row was finished by this session and the claim is back
        // on the shelf. We still own the epoch, so we may still speak, and the
        // fence below still catches the case where somebody else took over.
      }

      const { closeBecause, deferBecause, ...asked } = patch;
      let leftOpen = false;
      if (asked.status === 'done') {
        const before = readWorkItem(holding.dir, id);
        if (herRow(before) && !saidToClose(before, closeBecause)) {
          delete asked.status;
          leftOpen = true;
        }
      }
      let theirMoment = 0;
      let deferredAsAgent = null;
      if (deferBecause !== undefined && Number.isFinite(asked.runAt) && asked.runAt > 0) {
        const before = readWorkItem(holding.dir, id);
        if (herRow(before) && saidToClose(before, deferBecause)) {
          theirMoment = asked.runAt;
          delete asked.runAt;
        } else {
          deferredAsAgent = { deferredAsAgent: DEFERRED_AS_AGENT };
        }
      }
      const summaryTooLong = takeOverLong(asked);
      patch = asked;
      let item = Object.keys(patch).length
        ? updateWorkItem(holding.dir, id, patch, { epoch: holding.epoch })
        : readWorkItem(holding.dir, id);

      // The fence. A claim epoch above ours means the row changed hands while
      // we were working and the fold has just discarded the line we appended.
      if (item && item.epoch > holding.epoch) {
        held.delete(id);
        stopTimer();
        const parked = parkIn(holding.dir, id, patch, holding.epoch,
          `claim lapsed: ${holder} wrote under epoch ${holding.epoch}, the row is now on epoch ${item.epoch}`);
        throw new Error(`the claim on ${id} lapsed while this session worked and the row is now on epoch ${item.epoch}, so the store discarded this write.${carried(parked)}`);
      }

      // We were handed somebody else's message when we claimed, and we have now
      // spoken on this row, so it is ours to have carried and must not be handed
      // to a third session as if it were still waiting.
      if (holding.pending) {
        collectPendingWrites(holding.dir, id, { by: holder });
        holding.pending = false;
      }

      // Only now, past the fence, so a session that lost the row cannot still
      // put it away in the user's name.
      if (theirMoment) item = updateWorkItem(holding.dir, id, { runAt: theirMoment }, { source: 'founder' });

      // FINISHING A ROW GIVES THE CLAIM BACK NOW, not in five minutes. It used
      // to drop the row from this map and leave the claim line standing, so the
      // ledger went on reading "held by <this session>" for a full lease after
      // the work was over: the founder's next reply could not be answered, and
      // a session that tried was refused by its own name. The entry stays, and
      // it is the epoch that keeps this session able to answer her.
      if (item?.status === 'done' && holding.live) {
        try { releaseWorkItem(holding.dir, id, { epoch: holding.epoch }); }
        catch (err) { console.error(`${LOG} could not give back the claim on ${id}: ${err?.message ?? err}`); }
        holding.live = false;
        stopTimer();
      }
      // Left open, the claim still goes back now, for the same reason as a
      // finish: the work is over and her reply must find the row free. The
      // release is what puts the status back to open.
      if (leftOpen) {
        if (holding.live) {
          try { item = releaseWorkItem(holding.dir, id, { epoch: holding.epoch }); }
          catch (err) { console.error(`${LOG} could not give back the claim on ${id}: ${err?.message ?? err}`); }
          holding.live = false;
          stopTimer();
        }
        return { ...item, leftOpen: LEFT_OPEN, ...deferredAsAgent, ...summaryTooLong };
      }
      return { ...item, ...deferredAsAgent, ...summaryTooLong };
    },

    release(id) {
      const holding = held.get(id);
      if (!holding?.live) throw new Error(`this session does not hold ${id}`);
      const item = releaseWorkItem(holding.dir, id, { epoch: holding.epoch });
      held.delete(id);
      stopTimer();
      return item;
    },

    // Filing from this session: what it files is kept as private as every row
    // it has held, finished ones too, since it may still be answering on them.
    file(product, fields) {
      return createItem(product, fields, { from: [...held.keys()] });
    },

    holding: () => [...held.entries()].filter(([, h]) => h.live).map(([id]) => id),
    // Test seams; not part of normal use.
    _beat: beat,
    _stop: () => { if (timer) clearInterval(timer); timer = null; held.clear(); },
  };

  return registry;
}

export { LEASE_MS, HEARTBEAT_MS };

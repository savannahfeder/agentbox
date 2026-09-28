// THE ROW THAT SAYS HER TASKS ARE NOT RUNNING, AND WHAT IT SAYS WHEN SHE OPENS
// IT.
//
// Seventeen looks were drawn and photographed in her own inbox over four
// rounds. She picked one, 2026-08-29, of the row with a rule standing at its
// left edge in the app's own faint ink:
//
// SO IT IS NOT A NOTICE AND IT IS NOT A BANNER. It is a WorkItem, built here,
// dropped into the inbox at the top, and from that point on the list, the
// selection, the keys and the reading pane do not know it is different. That is
// the same move `agentRows` in App.tsx already makes for a live Claude Code
// session, and it is the only shape in this app that gets her sentence right:
// everything a row can do, this can do, except that it is drawn with a rule at
// its edge instead of a select box.
//
// WHAT IT MAY NOT DO is write. There is no ledger with a row called `trouble`
// in it, so `isTroubleRow` is what every action path checks before it tries,
// exactly as `item.agent` is checked today.
//
// NONE OF THE WORDS BELOW ARE CHOSEN HERE. Every sentence comes off
// shared/spawn-trouble.mjs, which is the one place this app is allowed to word
// a failure, so the row and the pane and the digest cannot drift into three
// vocabularies.

import type { Snapshot, TroubleCause, WorkItem } from './types';
import { strandedTitle } from '../../shared/spawn-trouble.mjs';
import { Name } from '../../shared/product-name.mjs';

type Trouble = NonNullable<NonNullable<Snapshot['supervisor']>['spawnTrouble']>;
type Cause = NonNullable<Trouble['byCause']>[number];

/** The one id this row ever has. It is not in any ledger and never will be. */
export const TROUBLE_ID = 'trouble';

export function isTroubleRow(i: { id?: string } | null | undefined): boolean {
  return !!i && i.id === TROUBLE_ID;
}

/**
 * WHAT HAPPENS NEXT, IN AS FEW WORDS AS ONE LINE OF A ROW HOLDS.
 *
 *  `causeNext` in spawn-trouble.mjs is a whole sentence, which is right in the
 *  pane and too long on the row: three causes of it overflow `.preview`, which
 *  clamps to one line, and the third one is lost. Measured 2026-08-28. So the
 *  row gets the fragment and the pane gets the sentence, and both come from the
 *  same place. The hour is read out of the sentence rather than reworded, so
 *  there is still only one place that decides how a limit prints its time. */
export function shortNext(c: Cause): string {
  if (c.cause === 'at-limit') {
    const at = /at (\d[^.]*)\./.exec(c.next);
    return at ? `back at ${at[1]}` : 'back when the limit resets';
  }
  if (c.cause === 'signed-out') return 'need a login';
  if (c.cause === 'org-blocked') return 'need an admin';
  if (c.cause === 'workspace') return 'need the folder trusted';
  if (c.cause === 'interrupted') return 'retrying on their own';
  return 'stopped, still trying';
}

function causes(t: Trouble): Cause[] {
  if (t.byCause?.length) return t.byCause;
  // A supervisor from before the breakdown existed still has to draw something,
  // and its own two sentences are the honest fallback.
  return [{ cause: t.cause === 'mixed' ? 'unknown' : t.cause, count: t.count ?? 1, what: t.message, next: t.remedy, act: null, hers: false }];
}

export function troubleCount(t: Trouble): number {
  return t.count ?? causes(t).reduce((n, c) => n + c.count, 0);
}

/**
 * The row's title, which is also the pane's heading. Worded in
 *  shared/spawn-trouble.mjs with everything else this app says about a stopped
 *  task, so the row and the sentence it came from count the same way. */
export function troubleTitle(t: Trouble): string {
  return strandedTitle(troubleCount(t));
}

/**
 * The row's second line: one short clause per cause, biggest and hers first
 *  (the order `causeBreakdown` already sorts them into). */
export function troubleSummary(t: Trouble): string {
  return causes(t).map((c) => `${c.count} ${shortNext(c)}`).join(' · ');
}

/**
 * WHAT OPENING IT SHOWS HER, which is the half she has never had.
 *
 * So the pane answers the two questions that debugging was for: which tasks,
 * and what each one is waiting on. The summary line leads, because the row and
 * the pane must open with the same sentence or she reads half a message in the
 * list and a different one when she opens it.
 *
 *  Titles are looked up rather than stored: `stopped` carries ids, and an id is
 *  not something she has ever seen. A row whose title cannot be found is still
 *  counted and still listed, saying so, because dropping it would make the list
 *  disagree with the number above it. */
export function troubleBody(t: Trouble, items: WorkItem[] = []): string {
  const byId = new Map(items.map((i) => [i.id, i]));
  const stopped = t.stopped ?? (t.ids ?? []).map((id) => ({ id, cause: 'unknown' as TroubleCause }));
  const parts: string[] = [troubleSummary(t)];
  for (const c of causes(t)) {
    const mine = stopped.filter((s) => s.cause === c.cause);
    parts.push(`**${c.what}.** ${c.next}`);
    if (mine.length) {
      parts.push(mine.map((s) => {
        const item = byId.get(s.id);
        return `- ${item ? item.title : 'A task that is no longer in your inbox'}${item?.productName ? ` (${item.productName})` : ''}`;
      }).join('\n'));
    }
  }
  // The rows the breakdown does not account for. Normally none; it is drawn
  // rather than dropped so the list under the heading always adds up to the
  // number in it.
  const named = new Set(causes(t).map((c) => c.cause));
  const rest = stopped.filter((s) => !named.has(s.cause));
  if (rest.length) {
    parts.push(`**${rest.length} more.** ${Name} keeps trying on its own.`);
    parts.push(rest.map((s) => `- ${byId.get(s.id)?.title ?? 'A task that is no longer in your inbox'}`).join('\n'));
  }
  return parts.join('\n\n');
}

/**
 * THE ROW ITSELF, in the shape everything downstream already reads.
 *
 *  BOTH TIMES ARE WHEN THIS STARTED, not when the row was built. Every other
 *  row's right end answers "how old is this", and the true answer here is the
 *  moment the first of these tasks got stuck: a pile that has been stuck since
 *  yesterday says yesterday, which is the fact she was missing. Built with the
 *  clock instead it would say "now" forever, which is the app looking busy
 *  about something that has not moved in an hour.
 *
 *  `priority` stays at the middle. The row does not wear an urgent mark, since
 *  she did not set one, and it does not need one: the inbox puts it first by
 *  name. `product` is empty because this is about all of them at once, and an
 *  empty `productName` draws nothing in the column that would name one. */
export function troubleRow(t: Trouble, items: WorkItem[] = []): WorkItem {
  return {
    id: TROUBLE_ID,
    product: '',
    productName: '',
    status: 'open',
    title: troubleTitle(t),
    body: troubleBody(t, items),
    kind: 'trouble',
    labels: [],
    priority: 5,
    epoch: 0,
    claim: null,
    createdAt: t.since,
    updatedAt: t.since,
  };
}

// One thing at a time, as the thread page draws it on the web app and the
// desktop (renderer/src/components/ItemThread.tsx): the thread's name and
// Context on top, then its newest answer under its bold line, with what came
// before behind a fold. The rules are the web app's own.
import {
  appWrote, drawnWhole, earlierCount, earlierThan, foldKey, foldedKeys, newestAnswer, pageTitle, spotIn, splitHeadline, standsAt, stepIn, toggleFold,
} from '../../../renderer/src/one-thing-at-a-time';

export { foldKey, foldedKeys, splitHeadline, spotIn, stepIn, toggleFold };

export const CHOICES_FOLDED = 'one.choicesFoldedOn';

const sameLine = (a: string, b: string) => a.replace(/[*\s]+/g, ' ').trim().toLowerCase() === b.replace(/[*\s]+/g, ' ').trim().toLowerCase();

export interface PageOf {
  title: string;
  context: string | null;
  /** The answer drawn alone under the summary; null when the page draws the conversation. */
  answer: { at: number; headline: string | null; rest: string } | null;
  /** The app's own note ("Shipped to main as ..."), quiet under the answer. */
  appNote: string | null;
  /** The word on the fold, or null when there is nothing behind one. */
  toggle: string | null;
  /** The conversation is drawn from this event; 0 is all of it. */
  from: number;
}

export function pageOf(item: any, events: any[], outcome: { at: number; text: string; field: 'result' | 'note' } | null, after: readonly unknown[], earlierOpen: boolean): PageOf {
  const byApp = appWrote(outcome as any, item.wrote);
  const lead = byApp ? null : outcome;
  const newest = newestAnswer(events, lead as any);
  const stands = newest && !earlierOpen ? standsAt(events, newest) : -1;
  const behind = stands >= 0 ? earlierThan(events, stands) : newest ? earlierCount(events, lead as any) : 0;
  const short = !earlierOpen && drawnWhole(behind);
  const from = short ? -1 : stands;
  const earlier = short ? 0 : behind;
  const steps = !short && !!newest && (events.some((e) => e.kind === 'work') || after.length > 0);
  const toggle = earlier > 0
    ? (earlierOpen ? 'Hide earlier messages' : `Show ${earlier} earlier ${earlier === 1 ? 'message' : 'messages'}`)
    : steps ? (earlierOpen ? 'Hide what the agent did' : 'Show what the agent did') : null;
  const title = pageTitle(item);
  let answer: PageOf['answer'] = null;
  if (newest && !earlierOpen && !short && from < 0) {
    const { headline, rest } = splitHeadline(newest.text);
    answer = { at: newest.at, headline: headline && !sameLine(headline, title) ? headline : null, rest };
  }
  return { title, context: item.problem ?? null, answer, appNote: byApp && outcome ? outcome.text : null, toggle, from: Math.max(from, 0) };
}

/** The choices' heading, unless it only repeats the bold line right above them. */
export const askUnderAnswer = (ask: string, headline: string | null | undefined) => (headline && ask && sameLine(ask, headline) ? '' : ask);

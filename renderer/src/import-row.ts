// THE ROW THAT ASKS WHETHER A CODEX CONVERSATION COMES IN, on the renderer's
// side. The rules and the words are in shared/codex-import.mjs; this is only
// what the list needs to draw it and what a key on it sends.
//
// So the row's right end is the two keys the list already draws as hints, Y and
// N, shown all the time instead of on hover, and the opened row is the ordinary
// options strip off the body.
import type { WorkItem } from './types';
import type { RowKey } from './list-rules';
import {
  CODEX_IMPORT_LABEL, CODEX_MIRROR_LABEL, NOT_IMPORTED_LABEL, codexIdOf as sharedCodexIdOf,
} from '../../shared/codex-import.mjs';

const has = (item: { labels?: string[] } | null | undefined, label: string) => (item?.labels ?? []).includes(label);

/** The row is asking. */
export const isImportRow = (item: WorkItem | null | undefined): boolean => !!item && has(item, CODEX_IMPORT_LABEL) && item.status !== 'done';
/** She said not now; it waits in Closed. */
export const isNotImportedRow = (item: WorkItem | null | undefined): boolean => !!item && has(item, NOT_IMPORTED_LABEL) && item.status === 'done';
/** She said yes; it is hers to read. */
export const isCodexRow = (item: WorkItem | null | undefined): boolean => !!item && has(item, CODEX_MIRROR_LABEL) && !!sharedCodexIdOf(item);

/* * ---------------------- AND WHERE IT LANDS ONCE IT IS IN ------------------
 w-d883b38446, 2026-09-18.

   IT WAS NEAR THE BOTTOM, AND THAT IS MEASURED. The inbox sorts on the score
   in shared/rank.mjs: her running order over her projects is worth a hundred
   points a step and the row's own priority breaks ties, with recency only
   after that. A conversation lands in the project whose folder it ran in
   (`whereThreadLands`), and an import comes in at the default priority of 5.
   Read off her real store on 2026-09-19, the conversation in her screenshot
   ("Animate agentbox launch storyboard") belongs to `zero`, which is 28th of
   her 33 projects: 605 points against the app's 3305. It sorted 19th of her
   21 open rows. Nothing was broken; the rule simply has no opinion about a
   thing she did by hand a minute ago.

   SO AN IMPORT SHE HAS NOT OPENED YET SITS ABOVE THE SCORED ROWS, and it
   leaves the top the moment she opens it. That is why the test is "seen"
   rather than a stretch of minutes: a window either expires while she is
   still looking for the row or leaves it squatting over her real work, and
   the honest end of "so I can find it" is her having found it. The seen set
   is the app's own (`zero.seen`, App.tsx), written when a row is opened.

   The same test draws the words on the row, so what is pinned and what says
   so cannot drift apart.
*/

/**
 * She imported it and has not opened it yet: top of the inbox, and the row
 *  says so. */
export const justImported = (item: WorkItem | null | undefined, seen: ReadonlySet<string>): boolean =>
  isCodexRow(item) && item!.status !== 'done' && !seen.has(item!.id);

/**
 * What the row prints where it would otherwise print a timestamp. she
 * called it importing a conversation. */
export const JUST_IMPORTED_WORD = 'just imported';

// 1 AND 2, NOT Y AND N (w-fb9051e597). Her words: "y and n was a bit strange
// anyways." The same card opened answers with 1 and 2 already, and N is free
// to mean a new task.
export const IMPORT_KEYS: RowKey[] = [{ key: '1', word: 'Yes' }, { key: '2', word: 'No' }];
export const NOT_IMPORTED_KEYS: RowKey[] = [{ key: 'I', word: 'Import' }];

/** The word the key sends. The main process reads it (`importChoice`). */
export type ImportChoice = 'yes' | 'no';
export const importAnswer = (choice: ImportChoice): string => (choice === 'yes' ? 'Yes' : 'Not now');

/** The heading Closed draws over the ones she declined. */
export const NOT_IMPORTED_HEADING = 'Not imported';

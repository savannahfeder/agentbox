// A TASK SENT ON "AGENT DECIDES" IS GIVEN ITS LEVEL BY THE SMALL MODEL.
//
// The new task cards open on Agent decides, which sends the task untagged
// (priority 0). This asks the namer's model (main/row-label.mts) for High,
// Medium or Low, once per task, and writes it as an agent, so a level the
// person picks later still wins by the fold's own rule.
//
// Never Urgent: Urgent takes a running session away from other work
// (shared/rank.mjs isUrgent), and that is too much to hang on a guess.
import { askSmallModel } from './row-label.mts';
import { isTaskRow } from '../shared/team-rules.mts';
import { teammateIdOf } from '../shared/teammates.mts';

/** The three words the model may answer, onto the app's own values (renderer/src/priority.ts). */
export const GUESSED_LEVELS: Record<string, number> = { high: 7, medium: 5, low: 2 };

export interface LevelItem {
  status?: string;
  title?: string;
  label?: string;
  body?: string;
  priority?: number;
  createdBy?: string | null;
  labels?: string[];
  wrote?: { priority?: { source?: string } };
  [field: string]: unknown;
}

const LIVE = new Set<string | undefined>(['open', 'claimed', 'blocked']);

/**
 * PURE. Is this a live task nobody gave a level? Not a conversation (the
 * message sorter has those), not a person's chosen level, and on the Mac of
 * whoever started it, so two teammates' Macs do not both ask.
 */
export function wantsLevel(item: LevelItem | null | undefined, product: { team?: { direct?: unknown } | null } | null | undefined, me?: string | null): boolean {
  if (!item || !LIVE.has(item.status)) return false;
  if (product?.team?.direct && !isTaskRow(item)) return false;
  if (teammateIdOf(item)) return false;
  if (Number.isFinite(item.priority) && item.priority! > 0) return false;
  if (item.wrote?.priority?.source === 'founder') return false;
  if (me && item.createdBy && item.createdBy !== me) return false;
  return !!String(item.title ?? '').trim() || !!String(item.body ?? '').trim();
}

/** PURE. The one question, about the task alone, cut short. */
export function levelPrompt(item: LevelItem | null | undefined): string {
  const cut = (s: unknown, n: number) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);
  return [
    'Here is a task someone gave to an AI agent and left for you to rank. How',
    'important is it compared with their other tasks? Most tasks are medium.',
    'Reply with one word: high, medium or low.',
    '',
    'high: something is broken or blocking people, or it is due today.',
    'medium: ordinary work: a feature, a fix, a question, a change.',
    'low: an idea, a cleanup or a nice-to-have that can wait weeks.',
    '',
    '--- task ---',
    cut(item?.title, 600),
    cut(item?.body, 1200),
    '---',
  ].join('\n');
}

/** PURE. The model's reply as one of the three words, or '' when it is not one. */
export function cleanLevel(text: unknown): string {
  const first = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  const word = first.replace(/^["'`“”‘’*]+|["'`“”‘’.!*]+$/g, '').trim().toLowerCase();
  return Object.hasOwn(GUESSED_LEVELS, word) ? word : '';
}

/** Ask the small model about one task. '' on every failure, never a throw. */
export function levelTask(item: LevelItem, opts: Parameters<typeof askSmallModel>[2] = {}) {
  return askSmallModel(levelPrompt(item), cleanLevel, opts);
}

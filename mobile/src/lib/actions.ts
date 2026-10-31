// WHAT A PRESS ON THE PHONE APP SENDS: the doors App.tsx calls for the same
// press, in the same order, through the phone site's own sending path
// (renderer/src/phone-send.ts), with the toast it raises and what its Undo
// calls. The choices ride as the window's handlers take them; phoneChoices
// keeps only the ones each kind of command may carry.

import { DONE } from '../../../renderer/src/done-word';
import { closesTheTask, type ParsedOption } from '../../../renderer/src/format';
import { clipToSentence, statusForReply, withdrawReply } from '../../../renderer/src/list-rules';
import { threadMessage } from '../../../renderer/src/threads/composer-rules';
import { sentLine } from '../../../renderer/src/compose-says';
import { attachmentLinks } from '../../../renderer/src/attachments';
import { doItHereWrites } from '../../../renderer/src/threads-made';
import type { PhoneSender } from '../../../renderer/src/phone-send';
import type { WorkItem } from '../../../renderer/src/types';
import { ruleLabel, type RepeatShape } from '../../../shared/repeats.mjs';
import type { Saved } from './attach';

export interface Choices { priority?: number; permissionMode?: string; model?: string; effort?: string; engine?: string; runAt?: number; start?: 'later' | 'now'; repeat?: RepeatShape; labels?: string[] }
export interface RuleRef { product: string; id: string; title: string }

export type Press =
  | { kind: 'reply'; text: string; choices?: Choices }
  | { kind: 'pick'; option: ParsedOption; choices?: Choices }
  | { kind: 'close' }
  /** `until` 0 brings it back from Later. */
  | { kind: 'later'; until: number; label?: string }
  | { kind: 'new'; product: string; text: string; saved?: Saved[]; choices?: Choices; to?: string; when?: string | null }
  | { kind: 'stop' }
  | { kind: 'run-now' }
  | { kind: 'move-to-cloud' }
  | { kind: 'send-back' }
  | { kind: 'send-now' }
  | { kind: 'pin'; pinned: boolean }
  | { kind: 'repeat-at'; rule: RuleRef; to: RepeatShape }
  | { kind: 'end-repeat'; rule: RuleRef }
  /** A proposal the thread filed, started as its own thread (App.tsx `resolve`); the item is the proposal. */
  | { kind: 'approve-filed' }
  /** A proposal done in the thread that filed it instead (App.tsx `doItHere`); the item is the proposal. */
  | { kind: 'do-here'; child: { id: string; product: string; title: string; parent?: string; body?: string | null }; parent: { id: string; product: string; status: WorkItem['status'] } }
  | { kind: 'approve'; approval: string; allow: boolean };

export type Door = keyof PhoneSender;
export interface Step { door: Door; payload: Record<string, unknown> }
export interface Plan {
  steps: Step[];
  /** What the toast says, ending " · press Z to undo" when it has an Undo (toast-parts.ts). */
  toast?: string;
  /** What Undo calls, given what the first step answered. */
  undo?: (made: any) => Step[];
  /** What the toast says once Undo has worked. */
  undone?: (made: any) => string;
}
export interface PressedItem { product: string; id: string; status: string; title?: string; productName?: string; runAt?: number | null; snoozedUntil?: number | null }

// App.tsx's TOAST_TITLE.
const TOAST_TITLE = 48;
const UNDO = ' · press Z to undo';

export function planFor(press: Press, item: PressedItem | null, now = Date.now()): Plan | null {
  if (press.kind === 'repeat-at') {
    return { steps: [{ door: 'setRepeat', payload: { product: press.rule.product, id: press.rule.id, rule: press.to } }], toast: `Now ${ruleLabel(press.to)}` };
  }
  if (press.kind === 'end-repeat') {
    return { steps: [{ door: 'endRepeat', payload: { product: press.rule.product, id: press.rule.id } }], toast: `Ended: ${press.rule.title}` };
  }
  if (press.kind === 'new') {
    const message = threadMessage(press.text, press.saved ?? []);
    if (!message) return null;
    const body = [message.body, attachmentLinks(press.saved ?? [])].filter(Boolean).join('\n\n');
    const { priority, repeat, ...rest } = press.choices ?? {};
    // Sent with Repeat, it is a rule whose runs are the threads (App.tsx's composer).
    if (repeat) {
      return {
        steps: [{ door: 'composeRepeat', payload: { product: press.product, title: message.title, ...(body ? { body } : {}), priority: priority ?? 5, rule: repeat, ...(rest.engine ? { engine: rest.engine } : {}), ...(rest.model ? { model: rest.model } : {}) } }],
        toast: `Repeating: ${ruleLabel(repeat)}`,
      };
    }
    return {
      steps: [{ door: 'compose', payload: { product: press.product, title: message.title, ...(body ? { body } : {}), kind: 'directive', priority: priority ?? 5, ...rest } }],
      toast: sentLine({ to: press.to ?? '', when: press.when ?? null, held: press.choices?.start === 'later' }),
      undo: (made) => (made?.id ? [{ door: 'answer', payload: { product: made.product, id: made.id, status: 'done' } }] : []),
      undone: (made) => `Withdrawn: ${clipToSentence(made?.title ?? '', TOAST_TITLE)}`,
    };
  }
  if (press.kind === 'approve') return { steps: [{ door: 'approve', payload: { id: press.approval, allow: press.allow } }] };
  if (!item) return null;
  const on = { product: item.product, id: item.id };
  const to = item.productName ?? '';

  const reply = (answer: string, choices: Choices, toast: string, undone: string): Plan => {
    const status = statusForReply(item.status);
    const runAt = Number(item.runAt) || 0;
    const snoozed = Number(item.snoozedUntil) || 0;
    const steps: Step[] = [{ door: 'answer', payload: { ...on, ...choices, answer, ...(status ? { status } : {}) } }];
    if (runAt > now) steps.push({ door: 'schedule', payload: { ...on, runAt: 0 } });
    if (snoozed > now) steps.push({ door: 'snooze', payload: { ...on, snoozedUntil: 0 } });
    return {
      steps,
      toast: `${toast}${UNDO}`,
      undo: () => [
        ...(runAt > now ? [{ door: 'schedule' as const, payload: { ...on, runAt } }] : []),
        ...(snoozed > now ? [{ door: 'snooze' as const, payload: { ...on, snoozedUntil: snoozed } }] : []),
        { door: 'stopSession', payload: { ...on, withdraw: true } },
        { door: 'answer', payload: { ...on, ...withdrawReply(item.status) } },
      ],
      undone: () => undone,
    };
  };
  const close = (): Plan => ({
    steps: [{ door: 'answer', payload: { ...on, status: 'done' } }],
    toast: `${DONE.verb}: ${clipToSentence(item.title ?? '', TOAST_TITLE)}${UNDO}`,
    undo: () => [{ door: 'answer', payload: { ...on, status: 'open' } }],
    undone: () => `Reopened: ${clipToSentence(item.title ?? '', TOAST_TITLE)}`,
  });

  switch (press.kind) {
    case 'reply':
      return press.text.trim() ? reply(press.text, press.choices ?? {}, to ? `Sent → ${to}` : 'Sent', 'Reply withdrawn, back in your inbox') : null;
    case 'pick':
      // "Close this task" is done, never sent: as a reply it would start a run to close it (App.tsx).
      if (closesTheTask(press.option.text)) return close();
      return reply(`Option ${press.option.n}: ${press.option.text}`, press.choices ?? {}, `Option ${press.option.n} → ${to}`, `Option ${press.option.n} withdrawn, back in your inbox`);
    case 'close':
      return close();
    case 'later': {
      const prior = Number(item.snoozedUntil) || 0;
      if (press.until > 0) {
        return {
          steps: [{ door: 'snooze', payload: { ...on, snoozedUntil: press.until } }],
          toast: `Moved to Later.${press.label ? ` Back ${press.label.toLowerCase()}` : ''}${UNDO}`,
          undo: () => [{ door: 'snooze', payload: { ...on, snoozedUntil: prior } }],
          undone: () => 'Back in your inbox',
        };
      }
      const runAt = Number(item.runAt) || 0;
      return {
        steps: [
          ...(prior ? [{ door: 'snooze' as const, payload: { ...on, snoozedUntil: 0 } }] : []),
          ...(runAt > now ? [{ door: 'schedule' as const, payload: { ...on, runAt: 0 } }] : []),
        ],
        toast: `Back in the inbox${UNDO}`,
        undo: () => [
          ...(prior ? [{ door: 'snooze' as const, payload: { ...on, snoozedUntil: prior } }] : []),
          ...(runAt > now ? [{ door: 'schedule' as const, payload: { ...on, runAt } }] : []),
        ],
        undone: () => 'Returned to Later',
      };
    }
    case 'stop':
      return { steps: [{ door: 'stopSession', payload: on }], toast: 'Stop sent. Your computer stops the agent when it gets it.' };
    case 'run-now':
      return { steps: [{ door: 'runNow', payload: on }], toast: 'Up next. It starts as soon as an agent is free.' };
    case 'move-to-cloud':
      return { steps: [{ door: 'moveToCloud', payload: { ...on, ids: [item.id] } }], toast: 'Moving to the cloud. It keeps working until the cloud has room.' };
    case 'send-back':
      return { steps: [{ door: 'reopen', payload: on }], toast: `Back in the queue → ${to}` };
    case 'send-now':
      return { steps: [{ door: 'sendNow', payload: on }] };
    case 'pin':
      // App.tsx's toast for the menu's row, which has no Undo there either.
      return { steps: [{ door: 'setThreadPins', payload: { pins: { [item.id]: press.pinned ? true : null } } }], toast: press.pinned ? 'Pinned to the top of your list' : 'Unpinned' };
    case 'approve-filed':
      return reply('Approved. Run it.', {}, `Running → ${(item.title ?? '').slice(0, 40)}`, 'Approval withdrawn, back in your inbox');
    case 'do-here': {
      const writes = doItHereWrites(press.child, press.parent);
      if (!writes) return null;
      const title = clipToSentence(press.child.title, TOAST_TITLE);
      return {
        steps: writes.map((w) => ({ door: 'answer' as const, payload: w })),
        toast: `Doing it in this thread: ${title}${UNDO}`,
        undo: () => [{ door: 'answer', payload: { product: press.child.product, id: press.child.id, status: 'open' } }],
        undone: () => `Back as its own thread: ${title}. The message already went.`,
      };
    }
  }
}

/** Runs a plan's steps in order and answers what the first one answered. */
export async function runSteps(sender: PhoneSender, steps: Step[]) {
  let first: any;
  for (const [i, s] of steps.entries()) {
    const out = await (sender[s.door] as (p: unknown) => Promise<unknown>)(s.payload);
    if (i === 0) first = out;
  }
  return first;
}

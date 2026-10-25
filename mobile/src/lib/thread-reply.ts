// SENDING A REPLY FROM THE PHONE APP: busy from the first tap, before any file
// uploads, and the box emptied only once the reply has gone, so a failed send
// keeps every word and file and an undone one gets its words back
// (renderer/src/drafts.ts, as Focus.tsx sends).

import type { Choices } from './actions';
import { withAttachments, type Saved } from './attach';
import { onceAtATime } from './compose';
import type { Draft } from './drafts';
import type { Picked } from '../platform/pick';

export interface ReplyDeps {
  draft: { text: string; files: Picked[]; take: () => Draft; restore: (taken: Draft) => boolean };
  busy: (on: boolean) => void;
  attach: (files: Picked[]) => Promise<Saved[]>;
  /** Sends the message; `undone` runs once its Undo has worked. */
  send: (text: string, choices: Choices, undone: () => void) => Promise<unknown>;
  failed: (message: string) => void;
}

export async function sendReply(deps: ReplyDeps, choices: Choices): Promise<boolean> {
  const { draft } = deps;
  if (!draft.text.trim() && !draft.files.length) return false;
  deps.busy(true);
  let taken: Draft | null = null;
  try {
    const saved = await deps.attach(draft.files);
    await deps.send(withAttachments(draft.text, saved), choices, () => { if (taken) draft.restore(taken); });
    taken = draft.take();
    return true;
  } catch (err) {
    deps.failed(String((err as Error)?.message ?? err));
    return false;
  } finally {
    deps.busy(false);
  }
}

/** One send at a time: busy is drawn a frame late, and two quick taps must still send once. */
export function replySender(deps: () => ReplyDeps, then?: (sent: boolean) => void) {
  return onceAtATime(async (choices: Choices) => {
    const sent = await sendReply(deps(), choices);
    then?.(sent);
  });
}

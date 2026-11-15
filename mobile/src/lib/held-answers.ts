// An answer to a permission card, held on the phone while its toast offers
// Undo. The computer acts on an answer the moment it arrives (shared/phone-undo.mts
// leaves approvals out of its hold), so Undo can only work before it is sent.

export interface HeldAnswers {
  /** Holds the answer; it goes on its own after `ms`. */
  hold: (id: string, allow: boolean) => void;
  /** Takes a held answer back. False when it has already gone. */
  undo: (id: string) => boolean;
  /** Sends everything held now, as when the app is put away. */
  flush: () => void;
  held: () => ReadonlySet<string>;
}

export function heldAnswers(send: (id: string, allow: boolean) => void, ms: number, changed: () => void = () => {}): HeldAnswers {
  const waiting = new Map<string, { allow: boolean; timer: ReturnType<typeof setTimeout> }>();
  const go = (id: string) => {
    const a = waiting.get(id);
    if (!a) return;
    clearTimeout(a.timer);
    waiting.delete(id);
    changed();
    send(id, a.allow);
  };
  return {
    hold(id, allow) {
      if (waiting.has(id)) return;
      waiting.set(id, { allow, timer: setTimeout(() => go(id), ms) });
      changed();
    },
    undo(id) {
      const a = waiting.get(id);
      if (!a) return false;
      clearTimeout(a.timer);
      waiting.delete(id);
      changed();
      return true;
    },
    flush() { for (const id of [...waiting.keys()]) go(id); },
    held: () => new Set(waiting.keys()),
  };
}

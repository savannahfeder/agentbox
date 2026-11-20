// In the reply box's place on a thread you gave away, or are giving: a reply
// there would take it back (shared/thread-cards.mts replyOnHandedOn), so none
// is offered.
import { handedToName } from '../../../shared/thread-cards.mts';

export type Handing = { name: string; error?: string; retry?: () => void };
export type GivenState = { kind: 'given' | 'giving' | 'failed'; name: string; error?: string };

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What the dock says: given, still on its way, or not given and why. */
export function givenState(item: { status?: string; answer?: string | null }, handing: Handing | null | undefined): GivenState | null {
  const given = handedToName(item);
  if (given) return { kind: 'given', name: first(given) };
  if (!handing) return null;
  return handing.error ? { kind: 'failed', name: first(handing.name), error: handing.error } : { kind: 'giving', name: first(handing.name) };
}

export function GivenDock({ state, onMessage, onReopen, onRetry, onKeep }: {
  state: GivenState;
  onMessage?: (() => void) | null;
  onReopen?: (() => void) | null;
  onRetry?: () => void;
  onKeep?: () => void;
}) {
  const { kind, name } = state;
  return (
    <div className={`dock-pill dock-pill-static dock-given${kind === 'failed' ? ' is-failed' : ''}`} role="status">
      <span className="dock-pill-text">
        {kind === 'given' ? `You gave this to ${name}` : kind === 'giving' ? `Giving this to ${name}…` : `Not given to ${name}: ${state.error}`}
      </span>
      {kind === 'given' && onMessage && <button type="button" className="dock-given-act" onClick={onMessage}>Message {name}</button>}
      {kind === 'given' && onReopen && <button type="button" className="dock-given-act" onClick={onReopen}>Reopen</button>}
      {kind === 'failed' && onRetry && <button type="button" className="dock-given-act" onClick={onRetry}>Try again</button>}
      {kind === 'failed' && onKeep && <button type="button" className="dock-given-act" onClick={onKeep}>Keep it</button>}
    </div>
  );
}

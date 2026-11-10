import type { Stop } from '../back-and-forward';
import { chord } from '../this-keyboard';

const Chevron = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** The back and forward arrows that start a page's header. */
export function BackForward({ backTo, forwardTo, onBack, onForward, name }: {
  backTo: Stop | null;
  forwardTo: Stop | null;
  onBack: () => void;
  onForward: () => void;
  name: (s: Stop) => string;
}) {
  return (
    <span className="back-forward">
      <button type="button" disabled={!backTo} onClick={onBack}
        aria-label={backTo ? `Back to ${name(backTo)}` : 'Back'}
        title={backTo ? `Back to ${name(backTo)} (${chord('⌘[')})` : undefined}>
        <Chevron d="M10 3.5L5.5 8l4.5 4.5" />
      </button>
      <button type="button" disabled={!forwardTo} onClick={onForward}
        aria-label={forwardTo ? `Forward to ${name(forwardTo)}` : 'Forward'}
        title={forwardTo ? `Forward to ${name(forwardTo)} (${chord('⌘]')})` : undefined}>
        <Chevron d="M6 3.5L10.5 8 6 12.5" />
      </button>
    </span>
  );
}

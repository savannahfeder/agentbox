import { clockOf, SLOW_AFTER_MS, type LocalStatus } from '../local-preview';
// WHAT THE PANE SAYS WHILE A LOCAL APP CONNECTS, OR WHEN NOTHING IS THERE.
// A short log, read top to bottom like a terminal: the address, what it tried
// and for how long, and where it stands now. Drawn in the chrome's own
// vocabulary: spaced mono capitals for each line, the one accent only on a live
// state, a hairline square button. Every colour and face is a theme token, so
// Ember Grid wears its orange and Geist and every other theme wears its own.
//
// THIS LOOK WAS PICKED over two others (w-cf58256de2); they are recorded in the
// product's decisions log and are not to be brought back.
export function LocalPreviewStatus({ status, onRetry }: { status: LocalStatus | null; onRetry: () => void }) {
  if (!status) return <div className="local-status" data-state="quiet" aria-hidden="true" />;
  return (
    <div className="local-status" data-state={status.state} role="status" aria-live="polite">
      <div className="local-status-host">{status.host}</div>
      <div className="local-status-log">
        <div className="local-status-line"><span className="local-status-mark">›</span><span>Opening</span><span className="local-status-clock">0:00</span></div>
        {status.state === 'slow' && <div className="local-status-line"><span className="local-status-mark">›</span><span>Slow to answer</span><span className="local-status-clock">{clockOf(SLOW_AFTER_MS)}</span></div>}
        <div className="local-status-line local-status-now">
          <span className="local-status-dot" aria-hidden="true" />
          <span>{status.label}</span>
          {status.state !== 'down' && <span className="local-status-clock">{status.clock}</span>}
        </div>
      </div>
      <div className="local-status-detail">{status.detail}</div>
      {status.retry && <button type="button" className="local-status-retry" onClick={onRetry}>Try again</button>}
    </div>
  );
}

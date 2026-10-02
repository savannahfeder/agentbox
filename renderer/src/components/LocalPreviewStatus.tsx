import type { LocalStatus } from '../local-preview';
// WHAT THE PANE SAYS WHILE A LOCAL APP CONNECTS, OR WHEN NOTHING IS THERE.
// Drawn in the chrome's own vocabulary: spaced mono capitals for the status,
// the one accent for a live state, a hairline square button. Every colour and
// face is a theme token, so Ember Grid wears its orange and Geist and every
// other theme wears its own.
//
// THREE LOOKS ARE ON TRIAL (w-cf58256de2). `data-look` picks one, off
// localStorage `zero.previewLook`, only until she picks; the losers and the
// switch then come out together.
export type PreviewLook = 'plate' | 'console' | 'rays';
export const PREVIEW_LOOK_KEY = 'zero.previewLook';
function lookNow(): PreviewLook {
  try {
    const v = localStorage.getItem(PREVIEW_LOOK_KEY);
    if (v === 'console' || v === 'rays') return v;
  } catch { /* no storage, the default */ }
  return 'plate';
}

export function LocalPreviewStatus({ status, onRetry }: { status: LocalStatus | null; onRetry: () => void }) {
  const look = lookNow();
  if (!status) return <div className="local-status" data-look={look} data-state="quiet" aria-hidden="true" />;
  const retry = status.retry && (
    <button type="button" className="local-status-retry" onClick={onRetry}>Try again</button>
  );
  if (look === 'console') {
    return (
      <div className="local-status" data-look={look} data-state={status.state} role="status" aria-live="polite">
        <div className="local-status-host">{status.host}</div>
        <div className="local-status-log">
          <div className="local-status-line"><span className="local-status-mark">›</span><span>Opening</span><span className="local-status-clock">0:00</span></div>
          {status.state === 'slow' && <div className="local-status-line"><span className="local-status-mark">›</span><span>Slow to answer, still trying</span><span className="local-status-clock">{status.clock}</span></div>}
          <div className="local-status-line local-status-now">
            <span className="local-status-dot" aria-hidden="true" />
            <span>{status.label}</span>
            {status.state !== 'down' && <span className="local-status-clock">{status.clock}</span>}
          </div>
        </div>
        <div className="local-status-detail">{status.detail}</div>
        {retry}
      </div>
    );
  }
  return (
    <div className="local-status" data-look={look} data-state={status.state} role="status" aria-live="polite">
      <div className="local-status-label">
        <span className="local-status-dot" aria-hidden="true" />
        <span>{status.label}</span>
        {status.state !== 'down' && <><span className="local-status-sep">·</span><span className="local-status-clock">{status.clock}</span></>}
      </div>
      <div className="local-status-host">{status.host}</div>
      <div className="local-status-detail">{status.detail}</div>
      {retry}
    </div>
  );
}

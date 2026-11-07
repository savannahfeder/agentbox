// ALERTS ON THIS PHONE, on the web app's Account page: how to add it to the
// home screen, which an iPhone asks before a web app may alert, then on, off
// and a test (../phone-alerts.ts).
import { useEffect, useState } from 'react';
import { Name } from '../../../shared/product-name.mjs';
import { ALERTS_SAY, alertsState, testAlert, turnOffAlerts, turnOnAlerts, type AlertsState } from '../phone-alerts';

const STEPS = ['In Safari, tap Share.', 'Tap Add to Home Screen.', `Open ${Name} from your home screen and turn alerts on here.`];
// Sent by the computer while nobody is at it (main/phone-alerts.mjs), and by
// the cloud while it is off (cloud/gateway/phone.mjs).
const SAY: Partial<Record<AlertsState, string>> = {
  off: 'Get an alert when an agent needs you.',
  on: "You get one when an agent needs you while you're away, even with your computer off.",
};

export function WebAlertsGroup() {
  const [state, setState] = useState<AlertsState | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void alertsState().then(setState); }, []);
  const run = (fn: () => Promise<void>, sayTo = setSaid) => async () => {
    setBusy(true); setSaid(null); setTested(null);
    try { await fn(); } catch (err) { sayTo(String((err as Error)?.message ?? err)); }
    setBusy(false);
  };
  if (!state) return null;
  const desc = said ?? (state === 'needs-home-screen'
    ? <ol className="set-steps">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
    : SAY[state] ?? ALERTS_SAY[state]);
  return (
    <div className="set-group" data-find="alerts">
      <div className="set-group-label"><span>Alerts on this phone</span></div>
      <div className="set-plate">
        <div className="set-row">
          <div className="set-row-text">
            <div className="set-row-label">{state === 'needs-home-screen' ? `Add ${Name} to your home screen` : state === 'on' ? 'Alerts are on' : 'Alerts'}</div>
            <div className="set-row-desc">{desc}</div>
          </div>
          {state === 'off' && <div className="set-row-ctl"><button type="button" className="set-ghost" disabled={busy} onClick={run(async () => setState(await turnOnAlerts()))}>Turn on</button></div>}
          {state === 'on' && <div className="set-row-ctl"><button type="button" className="set-ghost" disabled={busy} onClick={run(async () => setState(await turnOffAlerts()))}>Turn off</button></div>}
        </div>
        {state === 'on' && (
          <div className="set-row">
            <div className="set-row-text">
              <div className="set-row-label">Send a test alert</div>
              {tested && <div className="set-row-desc">{tested}</div>}
            </div>
            <div className="set-row-ctl">
              <button type="button" className="set-ghost" disabled={busy} onClick={run(async () => {
                setTested(await testAlert() ? 'Sent. With your computer off it can take two minutes.' : 'No computer is connected to send it.');
              }, setTested)}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

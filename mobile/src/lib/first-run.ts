// The first run's four steps, in order. Each is drawn with the same four bars.
export type Setup = 'account' | 'computer' | 'messages' | 'alerts';
export const SETUP_STEPS: Setup[] = ['account', 'computer', 'messages', 'alerts'];

/** Kept once alerts were offered, so "Not now" is not asked again. */
export const ALERTS_ASKED_KEY = 'agentbox-alerts-asked';

export function nextSetup(s: {
  signedIn: boolean; started: boolean; connect: boolean; noticeAnswered: boolean;
  alertsOn: boolean; alertsAsked: boolean; alertsHere: boolean;
}): Setup | null {
  if (!s.signedIn) return 'account';
  if (!s.started) return null;
  if (s.connect) return 'computer';
  if (!s.noticeAnswered) return 'messages';
  if (s.alertsHere && !s.alertsOn && !s.alertsAsked) return 'alerts';
  return null;
}

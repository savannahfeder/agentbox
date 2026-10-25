// WHAT THE CLOUD SETUP SAYS AT EVERY MOMENT (components/CloudSetup.tsx draws
// it; tests/the-cloud-is-set-up-on-its-own-screen reads it).
//
// Three rounds of her words shaped it, all on 2026-10-14:
//   - "The component shouldn't walk you through it": the cloud menu offers
//     Set up, and the setup is its own screen.
//   - "nobody reads text that's just in the bottom corner", then "this is way
//     too much reading ... I can't tell if these are components that I had to
//     click or read through": one line under each heading, and what can be
//     pressed looks pressable and nothing else does.
//   - "we shouldn't predefine which accounts to sign up with. Give people the
//     option": she adds whichever Claude and Codex accounts she wants.
// And she waited on Claude's page "stuck for about 30 seconds", not seeing
// that its code had to come back: the code is now read from the clipboard
// the moment she returns, and every wait says so with a moving mark.
import { signingIn, type CloudAccount, type CloudSignIn, type CloudStatus } from './cloud-menu';

export const SETUP = {
  screenLabel: 'Set up the cloud',
  homeHead: 'Run your agents in the cloud',
  // NOT "Add more any time" (w-dac993a554): the cloud runs on one account, so
  // inviting a second one was the screen asking for something it will not use.
  homeLede: 'Add the account it should use.',
  addClaude: 'Add Claude account',
  addCodex: 'Add Codex account',
  addOne: 'Add account',
  addWhich: 'Add which account?',
  kindClaude: 'Claude',
  kindCodex: 'Codex',
  planClaude: 'Pro or Max plan',
  planCodex: 'ChatGPT plan',
  remove: 'Remove',
  sameAccount: 'The same Claude account as one above, so it adds nothing. Remove it and add a different one.',
  again: 'Sign in again',
  done: 'Done',
  signInHead: (engine: CloudSignIn['engine'], as?: string | null) => (as ? `Sign in to ${as}` : engine === 'codex' ? 'Sign in to Codex' : 'Sign in to Claude'),
  openAgain: 'Open the page again',
  tryAgain: 'Try again',
  back: 'Back',
  pastePlaceholder: 'Paste the code',
  pasteGo: 'Continue',
  copy: 'Copy',
  copied: 'Copied',
  doneHead: 'You’re set up',
  doneLede: 'Where should new threads start?',
  inviteHead: 'Run your agents in the cloud',
  inviteLine: 'They keep working with your laptop closed, and as many run at once as you need.',
  inviteGo: 'Set up the cloud',
  inviteNote: 'About a minute to set up',
  payHead: 'Choose a plan',
  payLede: 'Pay on Stripe, then add the Claude or Codex account it runs on.',
  payWaitLede: 'Finish paying in your browser. This moves on by itself once you’ve paid.',
  menuBroken: 'A cloud account needs to sign in again.',
  menuFix: 'Fix',
  menuAccounts: (n: number) => (n === 0 ? 'None yet' : n === 1 ? '1 account' : `${n} accounts`),
  // AN ACCOUNT BEING ADDED IN THE BACKGROUND (2026-10-15), and one that was not.
  adding: 'Adding…',
  menuAdding: (engine: CloudSignIn['engine']) => `Adding your ${engine === 'codex' ? 'Codex' : 'Claude'} account…`,
  menuFailed: (engine: CloudSignIn['engine'], why: string | null) => `Your ${engine === 'codex' ? 'Codex' : 'Claude'} account wasn’t added.${why ? ` ${why}` : ''}`,
  toastFailed: (engine: CloudSignIn['engine']) => `Your ${engine === 'codex' ? 'Codex' : 'Claude'} account wasn’t added. Open the cloud menu to try again.`,
  menuManage: 'Manage',
};

// The menu's one line about setup, when there is one: an account that did
// not get added (with the way to try again), one being added, or one that
// stopped working.
export function menuSetupLine(status: CloudStatus): { say: string; go: string | null } | null {
  const accounts = status.accounts || [];
  const fresh = (status.signIns || []).filter((s) => !accounts.some((a) => a.key === s.key) || s.state === 'failed');
  const failed = fresh.find((s) => s.state === 'failed');
  if (failed) return { say: SETUP.menuFailed(failed.engine, failed.message), go: SETUP.tryAgain };
  const adding = (status.signIns || []).find((s) => s.state === 'checking');
  if (adding) return { say: SETUP.menuAdding(adding.engine), go: null };
  if (accounts.some((a) => a.state === 'broken')) return { say: SETUP.menuBroken, go: SETUP.menuFix };
  return null;
}

// HER PART OF A SIGN-IN HOLDS THE SCREEN, AND NOTHING ELSE DOES (2026-10-15:
// "anything over 3 seconds is too long ... doing it in the background"). Once
// she has pasted Claude's code or approved on OpenAI's page, the cloud's
// check goes on behind her accounts list, and how it ended is shown there.
const HERS = new Set<CloudSignIn['state']>(['starting', 'needs-code', 'waiting']);
export function activeSignIn(status: CloudStatus): CloudSignIn | null {
  return (status.signIns || []).find((s) => HERS.has(s.state)) ?? null;
}

// The rows the accounts list adds for sign-ins of new accounts: one being
// checked in the cloud, and one that failed, with why.
export function addingRows(status: CloudStatus): CloudSignIn[] {
  const accounts = status.accounts || [];
  return (status.signIns || []).filter((s) => (s.state === 'checking' || s.state === 'failed') && !accounts.some((a) => a.key === s.key));
}

// Done may be pressed once an account can run, or one is on its way.
export function mayFinish(status: CloudStatus): boolean {
  return anyReady(status.accounts || []) || (status.signIns || []).some((s) => s.state === 'checking');
}

// Sign-ins that failed since the last look, by their attempt, so a toast says
// so once and not on every redraw.
export function newlyFailedSignIns(before: Set<string>, status: CloudStatus | null | undefined): CloudSignIn[] {
  return (status?.signIns || []).filter((s) => s.state === 'failed' && !before.has(s.attempt ?? s.key));
}

// WHAT ONE SIGN-IN SAYS, in a line, and what it asks for. `busy` draws the
// moving mark beside the line, so a wait never looks like a stop.
export function signInView(s: CloudSignIn): { lead: string; busy: boolean; paste: boolean; codeToType: string | null } {
  const claude = s.engine === 'claude';
  if (s.state === 'starting') return { lead: claude ? 'Opening Claude’s sign-in…' : 'Opening OpenAI’s sign-in…', busy: true, paste: false, codeToType: null };
  if (s.state === 'needs-code') return { lead: 'Approve on Claude’s page, then copy the code it shows.', busy: false, paste: true, codeToType: null };
  if (s.state === 'waiting' && !s.code) return { lead: 'Sign in with ChatGPT in your browser.', busy: true, paste: false, codeToType: null };
  if (s.state === 'waiting') return { lead: 'Enter this code on OpenAI’s page.', busy: true, paste: false, codeToType: s.code };
  if (s.state === 'checking') return { lead: 'Checking…', busy: true, paste: false, codeToType: null };
  if (s.state === 'failed') return { lead: s.message || 'That didn’t work.', busy: false, paste: false, codeToType: null };
  return { lead: '', busy: false, paste: false, codeToType: null };
}

// Whether Done may be pressed: at least one account can run.
export const anyReady = (accounts: CloudAccount[]) => accounts.some((a) => a.ready);

/** Whether Done asks where threads start: only on the first setup, when no account had a working sign-in yet. */
export const doneAsksWhere = (accounts: CloudAccount[]) => !accounts.some((a) => a.ready || a.state === 'limited');

// The last screen's question: where new threads start, now that they can.
export const WHERE_ROWS = [
  { key: 'all', name: 'Everything', sub: 'In the cloud first' },
  { key: 'full', name: 'When this Mac is full', sub: 'On this Mac first' },
] as const;

// WHY A THREAD IS NOT IN THE CLOUD, in words (w-de59f3ff12). With the cloud on
// Everything, a thread that needs this computer still runs locally and others
// queue for their turn; the Status cell says "Working locally" or "Queued" and
// its card says why. The reasons come from main/supervisor.mjs `_whyLocal`
// and `_whyWaitingForCloud`.
import type { WhyNotCloud } from './types';

export interface WhyCard { head: string; body: string }

const ENGINE: Record<string, string> = { claude: 'Claude', codex: 'Codex' };
const engineName = (e: unknown) => ENGINE[String(e)] ?? 'this agent';

function local(why: string, detail: WhyNotCloud['detail']): string {
  switch (why) {
    case 'kept': return 'You chose to keep this thread on this computer.';
    case 'handed-back':
      // The cloud brief's own words for a run that has to merge (main/cloud/run.mjs).
      if (/^merging into main\b/i.test(String(detail ?? ''))) return 'Merging into main happens on this computer.';
      return detail ? `Its cloud run needed ${detail}, which only this computer has.` : 'Its cloud run needed something only this computer has.';
    case 'cloud-refused': return 'The cloud couldn’t start it, so it runs here instead.';
    case 'teammate': return 'A teammate talks in the team chat, which only this computer has.';
    case 'codex-reply': return 'Codex on this computer has this thread open, so its reply runs here.';
    case 'project': return 'The cloud doesn’t run threads from this project.';
    case 'folder': return 'It works in a folder that stays on this computer.';
    case 'no-account': return `No ${engineName(detail)} account is signed in to the cloud.`;
    case 'cloud-failing': return 'The cloud’s last runs failed before they started, so new threads run here for now.';
    case 'cloud-no-room': return noRoom(detail);
    case 'version': return `The cloud has a different version of ${engineName(detail)} from this computer.`;
    case 'cloud-account-limited': return 'The cloud’s account is at its usage limit, so this runs on the account this computer uses.';
    case 'started-before': return 'It started before the cloud was set to Everything.';
    default: return 'The cloud couldn’t take it when it started.';
  }
}

function noRoom(error: WhyNotCloud['detail']): string {
  switch (error) {
    case 'hours': return 'This month’s cloud hours are used up.';
    case 'agents': return 'Every cloud agent on your plan was busy when it started.';
    case 'paused': return 'The cloud wasn’t starting new runs when it started.';
    case 'terms': return 'The cloud’s new terms need accepting first.';
    default: return 'Your cloud plan has no agents to run it.';
  }
}

function forCloud(why: string, detail: WhyNotCloud['detail']): string {
  switch (why) {
    case 'two-at-a-time': return 'The cloud starts two threads at a time, and this one is in line.';
    case 'cloud-full': return `The cloud is running all ${detail ? `${detail} threads ` : ''}it can, so this starts when one finishes.`;
    case 'accounts-limited': return 'Your cloud accounts are at their usage limit, so this starts when one resets.';
    default: return 'It starts as soon as the cloud has room.';
  }
}

export function whyWords(w: WhyNotCloud): WhyCard {
  if (w.at === 'wait-cloud') return { head: 'Queued for the cloud', body: forCloud(w.why, w.detail) };
  if (w.at === 'wait-mac') return { head: 'Queued to run locally', body: `${local(w.why, w.detail)} It starts when this computer has room.` };
  // Supervisor#_moveRunsToTheCloud.
  if (w.why === 'moving') return { head: 'Moving to the cloud', body: 'It keeps working here and moves as soon as the cloud has room, picking up where it left off.' };
  return { head: 'Running locally', body: local(w.why, w.detail) };
}

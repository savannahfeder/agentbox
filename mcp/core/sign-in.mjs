// The store's half of a sign-in an agent puts in front of the person
// (shared/sign-in-ask.mjs). Each wait is under a minute, because Codex gives up
// on a tool call at 60 seconds; the agent calls again to keep waiting.
import { listProjects } from '../../main/store/project.mjs';
import { readWorkItem, updateWorkItem } from '../../main/store/work-items.mjs';
import { answerTo, cleanSignIn, newSignInId } from '../../shared/sign-in-ask.mjs';
import { resolveProduct } from './account.mjs';

export const WAIT_MS = 50_000;

function own(id, product) {
  const projects = product ? [resolveProduct(product)] : listProjects();
  for (const p of projects) {
    let item = null;
    try { item = readWorkItem(p.dir, id); } catch { continue; }
    if (item) return { dir: p.dir, item };
  }
  throw new Error(`no work item ${id}`);
}

const SAID = {
  'signed-in': 'They say they finished signing in. Check that the login finished (its command exited, or the server\'s tools are there now) and carry on.',
  landed: 'Their browser was sent back to the address in `url`. Hand it to the login waiting for it: an MCP server\'s complete_authentication tool, the prompt of `codex mcp login --no-browser`, or `curl` it at the login\'s own localhost address on this machine. Then carry on.',
  skipped: 'They chose not to sign in now. Finish what you can without it, and say in your answer what is left.',
};

/** Puts the ask on the thread, or closes it when the login finished by itself. */
export function askToSignIn(id, { service, url, code, why, ask, finished }, { product = null, now = Date.now() } = {}) {
  const { dir, item } = own(id, product);
  if (ask) {
    if (item.signIn?.id !== ask) throw new Error(`there is no sign-in ${ask} open on this thread`);
    if (finished) updateWorkItem(dir, id, { signIn: { ...item.signIn, done: true } }, { source: 'agent', now });
    return item.signIn;
  }
  const next = cleanSignIn({ id: newSignInId(), service, url, code, why, at: now });
  if (!next) throw new Error('a sign-in needs the service\'s name and its http or https link');
  updateWorkItem(dir, id, { signIn: next }, { source: 'agent', now });
  return next;
}

/** What the person did about the ask `askId`, waiting up to `waitMs` for it. */
export async function waitForSignIn(id, askId, { product = null, waitMs = WAIT_MS, pollMs = 1_000 } = {}) {
  const until = Date.now() + waitMs;
  for (;;) {
    const { item } = own(id, product);
    if (item.signIn?.id !== askId || item.signIn.done) return { status: 'closed', message: 'This sign-in is no longer open on the thread.' };
    const answer = answerTo(item, askId);
    if (answer) {
      const status = answer.said === 'signed-in' ? 'signed_in' : answer.said;
      return { status, ...(answer.url ? { url: answer.url } : {}), message: SAID[answer.said] };
    }
    if (item.status === 'done') return { status: 'closed', message: 'The thread was closed.' };
    if (Date.now() >= until) {
      return {
        status: 'waiting', ask: askId,
        message: 'Not answered yet. Call sign_in again with this ask to keep waiting. Between calls, check whether the login finished by itself; if it did, call sign_in with this ask and finished: true, which takes the card away.',
      };
    }
    await new Promise((r) => setTimeout(r, Math.min(pollMs, Math.max(0, until - Date.now()))));
  }
}

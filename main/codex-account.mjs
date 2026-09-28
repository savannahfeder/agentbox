// WHICH CODEX ACCOUNT THIS MAC IS SIGNED INTO.
//
// THE CARD USED TO HAVE A REASON FOR SAYING NOTHING, AND THE REASON HAS EXPIRED.
// renderer/src/components/Settings.tsx carried this, written when the Codex card
// was built: "`~/.codex/auth.json` carries a mode and an opaque account id, no
// email and no plan, and a uuid is not a person." That was true of the Codex CLI
// of the day. It is not true of 0.153.4, measured on her Mac 2026-09-18: the
// `id_token` beside those fields carries `email`, `name`, and a
// `chatgpt_plan_type` of "pro". So the half of "connected, and signed in as"
// that had no honest answer now has one, and Codex's card can say what Claude
// Code's account rows have always said.
//
// THE CLI ITSELF WILL NOT TELL YOU. `codex login status` answers "Logged in
// using ChatGPT" and names nobody, so there is nothing to shell out to even if
// we wanted to pay for a process. This is a read of one small file.
//
// NOTHING SECRET LEAVES THIS MODULE. `auth.json` holds an access token, a
// refresh token and an API key, and none of them are returned, logged, or put on
// any wire. The id_token's signature is not checked and does not need to be:
// this is not authenticating anybody, it is reading the name off a credential
// the machine already trusts, to print it back to the person who put it there.
// A forged one would only mislabel her own screen.
//
// IT IS READ WHEN THE PAGE ASKS, NOT KEPT. Settings is opened by hand a few
// times a day and she can sign in or out between two of those, so a cached
// answer is a screen that can be quietly wrong. Same judgement main/claude-plan.
// mjs makes for the Claude plan, and for the same reason.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The claim OpenAI hangs its ChatGPT facts off, verbatim. */
const AUTH_CLAIM = 'https://api.openai.com/auth';

/**
 * The plan ids whose proper names are known. Everything else is printed exactly
 *  as Codex spells it, and that is deliberate: her own token reads "prolite",
 *  which title-cases into "Prolite", a product name nobody at OpenAI has ever
 *  used. Inventing a label is how a screen tells a confident lie about what
 *  somebody is paying for, so an id we do not know is shown as the id. */
const PLANS = { free: 'Free', plus: 'Plus', pro: 'Pro', business: 'Business', team: 'Team', enterprise: 'Enterprise', edu: 'Edu' };

function planLabel(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  return PLANS[s] ?? s;
}

/**
 * Whether that label is a name anybody uses, or the raw id. The screen says
 *  "On the Pro plan" for one and "Codex reports the plan as prolite" for the
 *  other, because "On the prolite plan" reads like our typo rather than like
 *  Codex's word. */
function planIsNamed(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return !!s && !!PLANS[s];
}

/**
 * The middle of a JWT, which is plain base64url JSON. No verification: see the
 *  header of this file for why there is nothing here to verify. */
function claims(token) {
  if (typeof token !== 'string') return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    const json = JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

/**
 * Where this login lives. `configured` is the workspace's CODEX_HOME when it has
 *  one, which is the same rule main/supervisor.mjs `_codexHome` follows. */
export function codexAuthFile(home = null) {
  return path.join(home || path.join(os.homedir(), '.codex'), 'auth.json');
}

/**
 * WHO IS SIGNED INTO CODEX UNDER THIS HOME, or null because nobody is.
 *
 * Null is an ordinary answer and the card falls back to saying only that Codex is
 * connected, exactly as it did before this existed. Every field is independently
 * nullable: an account signed in with an API key has no email and no plan, and
 * the card then says the one true thing it can.
 *
 * @returns {{ email: string|null, name: string|null, plan: string|null,
 *   mode: string|null, accountId: string|null }|null}
 */
export function codexAccount(home = null, { file = null } = {}) {
  const at = file ?? codexAuthFile(home);
  let auth = null;
  try { auth = JSON.parse(fs.readFileSync(at, 'utf8')); } catch { return null; }
  if (!auth || typeof auth !== 'object') return null;

  const id = claims(auth?.tokens?.id_token);
  const chatgpt = id?.[AUTH_CLAIM] ?? null;
  const email = typeof id?.email === 'string' && id.email.trim() ? id.email.trim() : null;
  const name = typeof id?.name === 'string' && id.name.trim() ? id.name.trim() : null;
  const plan = planLabel(chatgpt?.chatgpt_plan_type);
  // The uuid, which is nobody's name and is only worth drawing when there is no
  // email to draw instead. Claude Code's rows make the same choice.
  const accountId = typeof auth?.tokens?.account_id === 'string' && auth.tokens.account_id
    ? auth.tokens.account_id
    : (typeof chatgpt?.chatgpt_account_id === 'string' ? chatgpt.chatgpt_account_id : null);
  const mode = typeof auth?.auth_mode === 'string' && auth.auth_mode ? auth.auth_mode : null;

  if (!email && !name && !plan && !accountId) return null;
  return { email, name, plan, planNamed: planIsNamed(chatgpt?.chatgpt_plan_type), mode, accountId };
}

/**
 * A FOLDER FOR THE NEXT CODEX LOGIN, MADE BEFORE ANYTHING IS ASKED TO USE IT.
 *
 * The command the card handed her was simply wrong: codex-cli will not create
 * the home it is pointed at, so the folder has to exist first. Making it here,
 * in the app, is better than telling her to run one more line.
 *
 * THE NAME IS COUNTED, NEVER GUESSED. `~/.codex-2` and up, skipping anything
 * that exists, so pressing Add twice cannot hand the second login the first
 * one's folder and overwrite a working account.
 *
 * @returns {{ home: string, profile: string }} `profile` is the word the fleet
 *   spawns on, which for every home but her primary one IS the path.
 */
export function makeCodexHome({ home = os.homedir(), mkdir = fs.mkdirSync, exists = fs.existsSync } = {}) {
  for (let n = 2; n < 100; n += 1) {
    const dir = path.join(home, `.codex-${n}`);
    if (exists(dir)) continue;
    mkdir(dir, { recursive: true });
    return { home: dir, profile: dir };
  }
  throw new Error('There are already a lot of Codex folders in your home directory.');
}

/**
 * The one line that signs a new account in, for the terminal to run. The home
 *  is spelled out rather than left to the shell, because `~` inside a variable
 *  assignment is not expanded by every shell the same way. */
export function codexLoginCommand(home) {
  return `CODEX_HOME=${home} codex login`;
}

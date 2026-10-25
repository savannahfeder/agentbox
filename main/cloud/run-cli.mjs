#!/usr/bin/env node
// THE PROGRAM THE SUPERVISOR STARTS IN PLACE OF `claude` FOR A CLOUD RUN.
//
//   ELECTRON_RUN_AS_NODE=1 <electron> main/cloud/run-cli.mjs <claude's argv>
//
// Same argv, env and cwd as the local run would have had. Everything it does
// is main/cloud/run.mjs; this only connects it to the real AWS account named
// in ~/.agentbox/cloud.json and names this account's cloud sign-in, which
// lives in the cloud and is never read here (main/cloud/logins.mjs).
// `cloudRunFromArgs` is the same, for one of many runs sharing a process
// (main/cloud/host.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { cloudRun, IMPORT_FAILED, LOGIN_TROUBLE } from './run.mjs';
import { NEW_THREAD, NEW_THREAD_CODEX } from '../../shared/cloud-kit.mjs';
import { cloudClients } from './clients.mjs';
import { readCloudConfig, readCloudKey, imageCaps, noteImageCaps } from './config.mjs';
import { pickCloudLogin, markCloudLogin, loginObjectKey, cloudAccountsFrom, cloudAccountFrom, cloudLoginInUse, noCloudAccountSentence } from './logins.mjs';

// SIGNED AS THE CLOUD RUNS' OWN USER AND NOBODY ELSE. AWS's libraries read
// keys from the environment before they read a named profile, so an app
// started from a shell signed in as an admin would run every cloud call as
// that admin. Those keys go, and the `agentbox-cloud` profile is what signs.
export function dropAwsSignIns(env = process.env) {
  for (const k of Object.keys(env)) {
    if (/^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|SECURITY_TOKEN|PROFILE|DEFAULT_PROFILE|CREDENTIAL_EXPIRATION|WEB_IDENTITY_TOKEN_FILE|ROLE_ARN)$/.test(k)) delete env[k];
  }
}

/**
 * The other sign-ins a run carries besides its own, so the agent can call the
 * other tool there the way it can on their Mac. A Claude run carries the Codex
 * account a Codex run would use, when it is ready; a Codex run carries nothing,
 * because Claude's token is long-lived and Codex's is not. Named only, like the
 * run's own.
 */
export function loginsCarriedBy(engine, { only = null, prefer = null, home } = {}) {
  if (engine !== 'claude') return [];
  const codex = pickCloudLogin('codex', { only, prefer, ...(home ? { home } : {}) });
  return codex ? [{ engine: 'codex', id: codex.id, key: loginObjectKey('codex', codex.id) }] : [];
}

/**
 * The cloud account a run of `engine` takes, from the run's own environment:
 * the test copy's list and the account this Mac runs on. With none to take,
 * `trouble` is why.
 */
export function loginForCloudRun(engine, env, { home, now = Date.now() } = {}) {
  const ask = { only: cloudAccountsFrom(env), prefer: cloudAccountFrom(env, engine), now, ...(home ? { home } : {}) };
  const rec = pickCloudLogin(engine, ask);
  return { rec, trouble: rec ? null : noCloudAccountSentence(engine, cloudLoginInUse(engine, ask), { now }) };
}

// One client pair per account and cloud key, shared by every run in a process.
const clients = new Map();
function clientsFor(config) {
  const k = JSON.stringify([config, typeof config.gateway === 'string' ? readCloudKey() : null]);
  if (!clients.has(k)) clients.set(k, cloudClients(config).catch((err) => { clients.delete(k); throw err; }));
  return clients.get(k);
}

/** One cloud run from the relay's own arguments; resolves to its exit code. */
export async function cloudRunFromArgs({ args, env, cwd, stdin, stdout, stderr, signals, pid, watchParent }) {
  const say = (m) => stderr.write(`agentbox cloud: ${m}\n`);
  const config = readCloudConfig();
  if (!config) { say('cloud runs are not set up on this Mac (run scripts/cloud-setup.mjs)'); return 1; }
  // `--agentbox-import-only`: bring an earlier run in this folder home, and
  // start nothing (Supervisor#_bringCloudHome).
  // `--agentbox-codex app-server ...`: a Codex run, its own `codex app-server`
  // in the sandbox, on the Codex login CODEX_HOME names.
  // `--agentbox-kit <claude's argv>`: leave this thread's next turn ready
  // for the cloud server to start with the computer shut, and start nothing
  // (shared/cloud-kit.mjs, Supervisor#_writeKit).
  const importOnly = args[0] === '--agentbox-import-only';
  const kitOnly = args[0] === '--agentbox-kit';
  // A kit for a Codex thread: `--agentbox-kit --agentbox-codex app-server`.
  const codex = args[0] === '--agentbox-codex' || (kitOnly && args[1] === '--agentbox-codex');
  const engine = codex ? 'codex' : 'claude';
  // The cloud account it runs on (main/cloud/logins.mjs pickCloudLogin). The
  // folder below only says where the conversation is kept.
  const { rec, trouble } = importOnly ? { rec: null, trouble: null } : loginForCloudRun(engine, env);
  if (!importOnly && !rec) { say(trouble); return LOGIN_TROUBLE; }
  const dir = rec?.key;
  let made;
  try { made = await clientsFor(config); } catch (err) { say(err.message); return LOGIN_TROUBLE; }
  const { transport, storage } = made;
  let kit = null;
  if (kitOnly) {
    kit = kitFrom(env);
    if (!kit) { say('no kit: the thread, its project, this computer or the reply\'s place was not named'); return 1; }
  }
  return cloudRun({
    importOnly,
    kit,
    engine,
    login: rec ? { engine, id: rec.id, key: loginObjectKey(engine, rec.id) } : null,
    also: rec ? loginsCarriedBy(engine, { only: cloudAccountsFrom(env), prefer: cloudAccountFrom(env, 'codex') }) : [],
    // A missing or refused login is marked so the menu asks for a new sign-in;
    // an expired Codex one is left for the supervisor to renew.
    onLoginTrouble: ({ state, id }) => {
      if (state === 'expired') markCloudLogin(engine, dir, id, { expiresAt: Date.now() });
      else markCloudLogin(engine, dir, id, { broken: state });
    },
    // An account at its usage limit sits out until it resets; the next run
    // takes another cloud account, or this Mac.
    onLimit: ({ until }) => { if (rec) markCloudLogin(engine, dir, rec.id, { limitedUntil: until }); },
    imageCaps: imageCaps(config),
    onCaps: (caps) => noteImageCaps(config, caps),
    remoteCommand: codex ? 'codex' : 'claude',
    argv: importOnly ? [] : args.slice((codex ? 1 : 0) + (kitOnly ? 1 : 0)),
    env, cwd, transport, storage,
    ...(stdin ? { stdin, stdout, stderr } : {}),
    ...(signals ? { signals } : {}),
    ...(pid ? { pid } : {}),
    ...(watchParent !== undefined ? { watchParent } : {}),
  });
}

// What the supervisor names for a kit: the thread, its project, this computer
// as the phone knows it, the reply's place (a file, read once) and where the
// copy is kept here.
export function kitFrom(env) {
  const device = env.AGENTBOX_KIT_DEVICE;
  const project = env.ZERO_PRODUCT;
  const item = env.ZERO_ITEM;
  if (!/^[0-9a-f]{12}$/.test(device || '') || !project || !item || !env.AGENTBOX_KIT_FRAME) return null;
  let frame = null;
  try { frame = JSON.parse(fs.readFileSync(env.AGENTBOX_KIT_FRAME, 'utf8')); } catch { return null; }
  fs.rmSync(env.AGENTBOX_KIT_FRAME, { force: true });
  if (typeof frame?.before !== 'string' || typeof frame?.after !== 'string') return null;
  const codex = env.AGENTBOX_KIT_CODEX ? codexKitAsked(env.AGENTBOX_KIT_CODEX) : undefined;
  if (codex === null) return null;
  const newThread = env.AGENTBOX_KIT_NEW ? newThreadAsked(env.AGENTBOX_KIT_NEW) : undefined;
  if (newThread === null) return null;
  return {
    device, project, item: newThread ? (codex ? NEW_THREAD_CODEX : NEW_THREAD) : item, frame: { before: frame.before, after: frame.after }, copy: env.AGENTBOX_KIT_COPY || null,
    ...(codex ? { codex } : {}), ...(newThread ? { newThread } : {}),
  };
}

// A project's kit for a new thread (Supervisor#_leaveNewThreadKit) names where
// the thread's folder will be, its first prompt with the marks, and the model
// and effort its command line runs, in a file read once.
function newThreadAsked(file) {
  let n = null;
  try { n = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  fs.rmSync(file, { force: true });
  if (typeof n?.cwd !== 'string' || !path.isAbsolute(n.cwd) || typeof n.brief !== 'string') return null;
  return {
    cwd: n.cwd, brief: n.brief, model: typeof n.model === 'string' ? n.model : null, effort: typeof n.effort === 'string' ? n.effort : null,
    // The engine the project gives a new thread nobody chose one for.
    ...(n.defaultEngine === 'claude' || n.defaultEngine === 'codex' ? { defaultEngine: n.defaultEngine } : {}),
  };
}

// A Codex thread's kit also names the thread to resume and its turn's
// settings (Supervisor#_writeKit), in a file read once; a new thread's names
// the thread to start instead (Supervisor#_leaveCodexNewThreadKit).
function codexKitAsked(file) {
  let asked = null;
  try { asked = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  fs.rmSync(file, { force: true });
  if (asked?.start && typeof asked.start === 'object' && asked.turn && typeof asked.turn === 'object' && asked.turn.threadId === undefined) return { start: asked.start, turn: asked.turn };
  if (typeof asked?.resume?.threadId !== 'string' || typeof asked?.turn?.threadId !== 'string') return null;
  return { resume: asked.resume, turn: asked.turn };
}

// Run as a program, not imported by the host: by the file's name, which holds
// inside the packaged app's archive as well as out of it.
const startedAsProgram = path.basename(process.argv[1] || '') === 'run-cli.mjs';
if (startedAsProgram) {
  dropAwsSignIns();
  cloudRunFromArgs({ args: process.argv.slice(2), env: process.env, cwd: process.cwd(), stdout: process.stdout, stderr: process.stderr }).then(
    (code) => process.exit(code ?? 1),
    (err) => { process.stderr.write(`agentbox cloud: stopped: ${err?.message || err}\n`); process.exit(IMPORT_FAILED); },
  );
}

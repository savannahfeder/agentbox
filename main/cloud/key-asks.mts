// A CLOUD RUN ASKING THIS COMPUTER FOR A KEY (request_cloud_key). The run
// names the key and where it is here; the person gets the app's own approval
// card; only an answer the app signed (main/approvals.mjs) reads the key,
// saves it for every cloud run (./keys.mjs) and hands it to the run asking.
//
// The card waits `waitMs`, not the whole run: an idle cloud machine is paid
// for by the hour. With no answer the agent ends its turn with the ask line,
// which carries the same place, so the thread's card still takes it in one press.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { answerIsHers, appendSpoolLine, cardDigest, readSpoolJson, removeSpoolEntry, spoolEntryExists, writeSpoolFile } from '../approvals.mts';
import { keyNameRefused, keyLabel } from '../../shared/cloud-keys.mts';
import { NEED } from '../../shared/cloud-needs.mts';
import { keySource, keySourceLine, sourceHoldsSignIns } from '../../shared/cloud-key-sources.mts';
import { SIGN_IN_REFUSED } from '../../shared/sign-in-places.mts';
import { readKeyFrom, keyIsThere } from './key-source.mts';
import type { KeySource, ReadOptions } from './key-source.mts';
import { cloudKeyNames, keysCarried, saveCloudKey } from './keys.mts';
import type { KeyStorage } from './keys.mts';

/** The `tool` of a key card in the approvals spool; renderer/src/approval-card.ts draws it. */
export const KEY_CARD = 'cloud_key';
const WAIT_MS = 15 * 60_000;
const ASKS_PER_RUN = 10;

export interface KeyAsk { name?: unknown; what?: unknown; place?: unknown; from?: unknown; entry?: unknown }
export interface KeyAnswer { status: 'saved' | 'already' | 'denied' | 'replied' | 'not_found' | 'no_answer' | 'unavailable'; message: string; path?: string }

export interface KeyAsksOptions extends ReadOptions {
  spool: string | null | undefined;
  publicKey: string | null | undefined;
  item: string | null;
  product: string | null;
  home: string;
  storage: KeyStorage & { getUrl: (k: string) => Promise<string> };
  // The keys this run was started with.
  carried: string[];
  // Whether the cloud machine takes a key mid-run (its image has `live-keys`).
  capable: () => boolean;
  deliver: (key: { name: string; url: string }) => Promise<boolean>;
  // Where the sandbox puts a key it was handed: cloud/sandbox/server.mjs placeKey.
  runKeysAt: string;
  stopped?: () => boolean;
  waitMs?: number;
  pollMs?: number;
  log?: (line: string) => void;
}

export function keyFileFor(runKeysAt: string, name: string) { return `${runKeysAt}/${name}`; }

export function createKeyAsks(o: KeyAsksOptions) {
  const { spool, publicKey, item, product, home, storage, carried, capable, deliver, runKeysAt, stopped = () => false, waitMs = WAIT_MS, pollMs = 2_000, log = () => {} } = o;
  const refusedHere = new Set<string>();
  const inFlight = new Map<string, Promise<KeyAnswer>>();
  const wakers = new Set<() => void>();
  let asked = 0; let closed = false;
  const over = () => closed || stopped();
  const nap = () => new Promise<void>((resolve) => {
    const wake = () => { clearTimeout(t); wakers.delete(wake); resolve(); };
    const t = setTimeout(wake, pollMs);
    wakers.add(wake);
  });

  const askLine = (name: string, what: string, src: KeySource) => `${NEED} key ${name} | ${what || name} | ${keySourceLine(src)}`;
  const ending: KeyAnswer = { status: 'unavailable', message: 'This cloud run is ending.' };

  // Into this run, when its machine can take it; said either way.
  async function handOver(name: string, fresh: boolean): Promise<KeyAnswer> {
    const kept = fresh ? 'Saved for every cloud thread from now on' : 'It was already saved for cloud threads';
    if (!capable()) return { status: 'saved', message: `${kept}, so the next run has it as $${name}. This cloud machine cannot take it while it runs: finish what you can without it, then end your turn offering to run it again.` };
    const saved = keysCarried({ home }).find((k) => k.name === name);
    if (!saved || over()) return ending;
    const ok = await deliver({ name, url: await storage.getUrl(saved.key) });
    if (!ok) return { status: 'saved', message: `${kept}, so the next run has it as $${name}, but it did not reach this machine. Finish what you can without it, then end your turn offering to run it again.` };
    const file = keyFileFor(runKeysAt, name);
    return { status: 'saved', path: file, message: `${kept}. This run started without it, so it is not in your environment: read it from ${file} in the command that needs it, as in ${name}="$(cat ${file})" <command>. Never print it.` };
  }

  // The card, until a signed answer, the deadline, or the run's end.
  async function card(request: { id: string; at: number; product: string | null; item: string | null; tool: string; input: Record<string, unknown> }, savedMeanwhile: () => boolean) {
    const dir = spool!;
    fs.mkdirSync(dir, { recursive: true });
    const answerName = `${request.id}.answer.json`;
    const requestName = `${request.id}.request.json`;
    const finish = (verdict: unknown) => {
      appendSpoolLine(dir, 'log.jsonl', `${JSON.stringify({ ...request, answer: verdict, decidedAt: Date.now() })}\n`);
      removeSpoolEntry(dir, requestName); removeSpoolEntry(dir, answerName);
    };
    if (!writeSpoolFile(dir, requestName, JSON.stringify(request))) return 'unasked';
    const until = Date.now() + waitMs;
    while (!over() && Date.now() < until) {
      if (spoolEntryExists(dir, answerName)) {
        const said = readSpoolJson(dir, answerName);
        if (!answerIsHers(request.id, said, publicKey!)) removeSpoolEntry(dir, answerName);
        else if (said.card !== cardDigest(request)) { finish({ allow: false, swapped: true }); return 'deny'; }
        else { finish(said); return said.allow ? 'allow' : { words: typeof said.note === 'string' ? said.note.trim().slice(0, 2_000) : '' }; }
      } else if (savedMeanwhile()) { finish({ allow: false, savedElsewhere: true }); return 'saved'; }
      else if (!spoolEntryExists(dir, requestName)) writeSpoolFile(dir, requestName, JSON.stringify(request));
      await nap();
    }
    finish({ allow: false, gone: over(), unanswered: !over() });
    return over() ? 'gone' : 'unanswered';
  }

  async function ask(args: KeyAsk = {}): Promise<KeyAnswer> {
    if (over()) return ending;
    const name = String(args.name ?? '').trim();
    const refused = keyNameRefused(name);
    if (refused) return { status: 'denied', message: refused };
    if (sourceHoldsSignIns({ place: args.place, from: args.from })) return { status: 'denied', message: `${SIGN_IN_REFUSED} Do not ask for it from anywhere else; finish without it.` };
    const src = keySource({ place: args.place, from: args.from, entry: args.entry }) as KeySource | null;
    if (!src) return { status: 'denied', message: 'Say where the key is on their computer: place keychain with the item\'s name, file with a path under their home folder (and entry for one variable of an .env file), or shell with the variable\'s name.' };
    const what = String(args.what ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (carried.includes(name)) return { status: 'already', message: `${name} is already in this run's environment.` };
    if (cloudKeyNames({ home }).some((k) => k.name === name)) return handOver(name, false);
    if (refusedHere.has(name)) return { status: 'denied', message: `They already said no to ${name} in this run. Do not ask again; finish without it.` };
    const there = await keyIsThere(src, o);
    if (!there.ok) return { status: there.missing ? 'not_found' : 'unavailable', message: `${there.error} If you know another place, ask again with it; otherwise finish what you can and end your turn with the line ${NEED} key ${name} | ${what || name} so they can paste it.` };
    if (!spool || !publicKey) return { status: 'unavailable', message: `This run cannot put a card in front of them. End your turn with the line ${askLine(name, what, src)}.` };
    if (asked >= ASKS_PER_RUN) return { status: 'denied', message: 'This run has asked for as many keys as it may.' };
    asked += 1;
    const request = { id: crypto.randomUUID(), at: Date.now(), product, item, tool: KEY_CARD, input: { name, what, ...src } };
    // Another run's card for the same key may be allowed first.
    const verdict = await card(request, () => cloudKeyNames({ home }).some((k) => k.name === name));
    log(`request_cloud_key ${name} from ${src.place}: ${typeof verdict === 'object' ? (verdict.words ? 'replied' : 'deny') : verdict}`);
    if (verdict === 'gone') return ending;
    if (verdict === 'saved') return handOver(name, false);
    // Their words instead of a yes: not a no, so the run may ask again as they say.
    if (typeof verdict === 'object' && verdict.words) return { status: 'replied', message: `They answered your request for ${name} in words instead of allowing it: "${verdict.words}". Do what they say; if they point you at another place for the key, ask again with it.` };
    if (verdict === 'unasked') return { status: 'unavailable', message: `The card could not be shown. End your turn with the line ${askLine(name, what, src)}.` };
    if (verdict === 'unanswered') return { status: 'no_answer', message: `No answer in ${Math.round(waitMs / 60_000) || 1} minutes. Finish what you can without it, then end your turn with the line ${askLine(name, what, src)} so it waits for them on the thread.` };
    if (verdict === 'deny' || typeof verdict === 'object') { refusedHere.add(name); return { status: 'denied', message: `They said no to ${name}. Do not ask for it again in this run; finish without it and say what it would have needed.` }; }
    const read = await readKeyFrom(src, o);
    if (!('value' in read)) return { status: read.missing ? 'not_found' : 'unavailable', message: `${read.error} End your turn with the line ${NEED} key ${name} | ${what || name} so they can paste it.` };
    await saveCloudKey(name, read.value, { storage, home, label: keyLabel(what) });
    return handOver(name, true);
  }

  const once = (args: KeyAsk = {}) => {
    const k = String(args?.name ?? '');
    if (!inFlight.has(k)) inFlight.set(k, ask(args).finally(() => inFlight.delete(k)));
    return inFlight.get(k)!;
  };
  once.close = () => { closed = true; for (const wake of [...wakers]) wake(); };
  return once;
}

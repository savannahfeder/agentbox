// CONNECTIONS, THE APP'S SIDE: sign in, check, and every call to a tool. Tokens
// come out of the vault here and go nowhere else: nothing on this object returns
// one, because anything a worker's children are handed, the worker can read
// (main/approvals.mjs).
import crypto from 'node:crypto';
import { ACCESS, clockAt, onLoopback, OWN_CLIENT_PORT, OWN_CLIENT_REDIRECT, STATES, stateWords } from '../../shared/connections-catalog.mjs';
import { connectionVault, CANNOT_ENCRYPT } from './vault.mjs';
import { refreshTokens, signIn, SIGN_IN_MS } from './oauth.mjs';
import { countRead, oneLineRead, stateOfError, talk } from './talk.mjs';

export const CHECK_MS = 20_000;
export const CALL_MS = 60_000;
const DAY_MS = 24 * 3600_000;

// A down connection is tried again after each of these, the last repeating,
// until RETRY_FOR_MS after it went down. Then only a person or a run tries it.
export const RETRY_STEPS_MS = [1, 2, 5, 10, 15, 30].map((m) => m * 60_000);
export const RETRY_FOR_MS = 8 * 3600_000;
// A blip shorter than this gets no row in Needs you when it ends.
export const RECOVERY_ROW_AFTER_MS = 5 * 60_000;

export const KEEP_ALIVE_EVERY_MS = 5 * 60_000;
export const RENEW_BEFORE_MS = 15 * 60_000;
export const WARN_BEFORE_MS = 30 * 60_000;
// Past this after its end a token is a Mac that was closed, not something to chase.
const RENEW_GIVES_UP_AFTER_MS = 60 * 60_000;
const FAILURES_KEPT = 50;
const OFFERED_MOST = 60;
const FAILED_WHY_MOST = 160;

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const SIGNED_OUT = new Set([STATES.NOT_SIGNED_IN, STATES.NOT_ALLOWED, STATES.CHOOSE_READS]);

/** When the app next tries a down connection by itself, or null when it will not. */
export function nextTryAt(status, { steps = RETRY_STEPS_MS, retryFor = RETRY_FOR_MS } = {}) {
  if (status?.state !== STATES.DOWN || !status.at) return null;
  const since = status.since ?? status.at;
  const next = status.at + steps[Math.min(Math.max(1, status.tries ?? 1), steps.length) - 1];
  return next <= since + retryFor ? next : null;
}

const fingerprint = (tool) => crypto.createHash('sha256').update(JSON.stringify([tool.name, tool.description ?? '', tool.inputSchema ?? null])).digest('base64url');
const prints = (tools) => Object.fromEntries(tools.map((t) => [t.name, fingerprint(t)]));
/** Tools added, gone or reworded since the person last saw the list. */
function toolsChanged(accepted, tools) {
  const now = prints(tools);
  return [...new Set([...Object.keys(accepted), ...Object.keys(now)])].filter((n) => accepted[n] !== now[n]).sort();
}

// Two yes-or-no facts about a sign-in, and all a tile may know of one.
const signInFacts = (c, entry) => ({
  redirect: entry.access === ACCESS.OWN_CLIENT ? OWN_CLIENT_REDIRECT : null,
  hasClient: !!c?.client?.client_secret,
  endsAt: c && !c.tokens?.refresh_token ? (c.expiresAt ?? null) : null,
});
const needsNoArgument = (t) => !t?.inputSchema?.required?.length;
const expiryOf = (tokens, at) => (Number(tokens?.expires_in) > 0 ? at + Number(tokens.expires_in) * 1000 : null);

/**
 * A tool with no written list reads only what its person ticked. A check needs a
 * ticked tool that runs with no argument, or there is no real read to prove it.
 */
function asChosen(entry, c) {
  if (entry.reads) return entry;
  const reads = c?.chosen ?? [];
  const tools = c?.status?.tools ?? [];
  const checkable = reads.find((n) => { const t = tools.find((x) => x.name === n); return t && needsNoArgument(t); });
  return { ...entry, reads, writes: [], check: checkable ? { tool: checkable, args: {}, things: null } : null };
}

function normalAddress(address) {
  try { const u = new URL(address); return `${u.origin}${u.pathname.replace(/\/+$/, '')}${u.search}`; } catch { return null; }
}

function hostName(address) {
  const host = new URL(address).hostname.replace(/^(mcp|api|www)\./, '');
  return host.charAt(0).toUpperCase() + host.slice(1);
}

export function createConnections({
  vaultFile, cipher, catalog, openExternal, signInMs = SIGN_IN_MS, checkMs = CHECK_MS, callMs = CALL_MS, now = Date.now,
  personId = () => null, onChange = () => {}, onRecovered = () => {}, onNeedsYou = () => {}, onWhoChanged = () => {}, onSignedIn = () => {}, testOnlyFor = null,
  retrySteps = RETRY_STEPS_MS, retryFor = RETRY_FOR_MS, recoveryRowAfter = RECOVERY_ROW_AFTER_MS,
  ownClientPort = OWN_CLIENT_PORT, allowLoopback = false, keepAliveEvery = KEEP_ALIVE_EVERY_MS,
}) {
  const vault = connectionVault({ file: vaultFile, cipher });
  const everyEntry = (saved) => [...catalog, ...Object.values(saved?.custom ?? {})];
  const entryIn = (id, saved) => everyEntry(saved).find((e) => e.id === id) ?? null;
  // Only a tool that may need the file reads it, so a Mac with none asks no keychain.
  const entryOf = (id) => {
    const listed = catalog.find((e) => e.id === id);
    if (listed?.reads) return listed;
    const saved = vault.readNow();
    const e = entryIn(id, saved);
    return e ? asChosen(e, saved.connections?.[id]) : null;
  };
  const refreshing = new Map();
  const checking = new Map();
  const signingIn = new Map();
  const retry = { on: false, timer: null, keepAlive: null };
  const nextTry = (s) => nextTryAt(s, { steps: retrySteps, retryFor });

  const tileOf = (listed, saved) => {
    const c = saved?.connections?.[listed.id];
    const entry = asChosen(listed, c);
    const s = c?.status ?? {};
    const state = c ? (s.state ?? STATES.WORKS) : STATES.NOT_CONNECTED;
    const { word, todo } = stateWords(state);
    const choosing = !listed.reads;
    const stuck = state === STATES.CHOOSE_READS && (c?.chosen?.length ?? 0) > 0;
    return {
      id: entry.id, name: entry.name, state, word,
      todo: stuck ? 'Tick at least one that runs with nothing else asked of it, so a real read can prove it works.' : todo,
      connected: !!c, group: entry.group ?? 'added', access: entry.access, needs: entry.needs ?? null, custom: !!entry.custom,
      address: entry.address, ...signInFacts(c, entry),
      at: s.at ?? null, workedAt: s.workedAt ?? null, toolCount: s.toolCount ?? null, read: s.read ?? null,
      since: c ? (s.since ?? s.at ?? null) : null, nextTryAt: c ? nextTry(s) : null,
      stoppedTryingAt: c && state === STATES.DOWN && !nextTry(s) ? (s.since ?? s.at ?? null) + retryFor : null,
      seen: s.seen ?? null, seenAtLeast: s.seen != null && s.seen >= (entry.check?.args?.limit ?? Infinity), things: entry.check?.things ?? null,
      changed: s.changed ?? [], reads: entry.reads, writes: entry.writes,
      lastUsedAt: c?.activity?.lastUsedAt ?? null, failures: c?.activity?.failures ?? [],
      copyable: !!entry.copy, copyAsks: entry.copy?.asks ?? null,
      ...(choosing && c ? { chooses: true, chosen: c.chosen ?? [], offered: (s.tools ?? []).slice(0, OFFERED_MOST).map((t) => ({ name: t.name, description: clip(t.description, 140), runsAlone: needsNoArgument(t) })) } : {}),
    };
  };

  // One refresh per connection at a time, whoever noticed first. `spent` is the
  // token that got refused: if the vault already holds another, somebody refreshed.
  function refreshOnce(entry, spent) {
    const running = refreshing.get(entry.id);
    if (running) return running;
    const run = (async () => {
      const c = (await vault.read()).connections?.[entry.id];
      if (!c) throw Object.assign(new Error('not connected'), { status: 401 });
      if (c.tokens.access_token !== spent) return c.tokens.access_token;
      if (!c.tokens.refresh_token) throw Object.assign(new Error('no way to refresh'), { status: 401 });
      let tokens;
      try { tokens = await refreshTokens({ entry, signedIn: c }); } catch (err) {
        // A refused refresh is a lost sign-in. One that did not get through is not.
        const refused = /invalid_grant|invalid_client|unauthorized_client/i.test(`${err?.name} ${err?.code} ${err?.message}`) || err?.constructor?.errorCode === 'invalid_grant';
        throw refused ? Object.assign(new Error('the sign-in is no longer accepted'), { status: 401 }) : err;
      }
      await vault.update((d) => {
        const held = d.connections?.[entry.id];
        if (held) { held.tokens = tokens; held.expiresAt = expiryOf(tokens, now()); held.warnedFor = null; }
      });
      return tokens.access_token;
    })().finally(() => refreshing.delete(entry.id));
    refreshing.set(entry.id, run);
    return run;
  }

  /**
   * A conversation on the current token. A refused token is refreshed and the
   * conversation tried once more. A 401 means the tool did nothing, so that holds
   * for a write too; a write whose answer was lost is never sent twice, and that
   * is not this path.
   */
  async function withTool(entry, use, { ms } = {}) {
    const c = (await vault.read()).connections?.[entry.id];
    if (!c) throw Object.assign(new Error('not connected'), { status: 401 });
    const token = c.tokens.access_token;
    try {
      return await talk({ address: entry.address, token, ms, use });
    } catch (err) {
      if (err?.status !== 401) throw err;
      const fresh = await refreshOnce(entry, token);
      return talk({ address: entry.address, token: fresh, ms, use });
    }
  }

  // `since` is when the state last changed and `tries` how many checks in a row
  // found it down, so a tile can say "down since" and the retries stay bounded.
  async function saveStatus(id, patch) {
    let recovered = null;
    let lost = null;
    let whoChanged = false;
    await vault.update((d) => {
      const c = d.connections?.[id];
      if (!c) return;
      const before = c.status ?? {};
      const next = { ...before, ...patch };
      if (patch.state) {
        const turned = patch.state !== before.state;
        const at = patch.at ?? now();
        next.at = at;
        next.since = turned ? at : (before.since ?? before.at ?? at);
        next.tries = patch.state === STATES.DOWN ? (turned ? 1 : (before.tries ?? 0) + 1) : 0;
        const wasOut = before.state === STATES.DOWN || before.state === STATES.UNREACHABLE;
        const outFor = at - (before.since ?? before.at ?? at);
        if (wasOut && patch.state === STATES.WORKS && outFor >= recoveryRowAfter) {
          recovered = { id, since: before.since ?? before.at, at, before: !!before.workedAt };
        }
        if (turned && patch.state === STATES.NOT_SIGNED_IN) lost = { at };
        if (turned && SIGNED_OUT.has(patch.state) !== SIGNED_OUT.has(before.state)) whoChanged = true;
      }
      c.status = next;
    });
    onChange();
    if (whoChanged) { try { onWhoChanged(); } catch { /* the next publish says it */ } }
    const name = catalog.find((e) => e.id === id)?.name ?? (await vault.read()).custom?.[id]?.name ?? id;
    if (recovered) {
      try { onRecovered({ ...recovered, name }); } catch (err) { console.warn('zero: could not say a connection works again:', err?.message ?? err); }
    }
    if (lost) {
      fileRow({
        title: `Sign in to ${name} again`,
        problem: `Its sign-in stopped working at ${clockAt(lost.at, now())}, and it could not be renewed.`,
        body: `Agents cannot reach ${name} until you do. [Sign in to ${name} again](agentbox://connections/${id})`,
      });
    }
    void armRetry();
  }

  function fileRow(row) {
    try { onNeedsYou(row); } catch (err) { console.warn('zero: could not put a connection in Needs you:', err?.message ?? err); }
  }

  async function armRetry() {
    if (!retry.on) return;
    clearTimeout(retry.timer);
    retry.timer = null;
    const saved = await vault.read();
    const times = everyEntry(saved).map((e) => nextTry(saved.connections?.[e.id]?.status)).filter(Boolean);
    if (!retry.on || !times.length) return;
    retry.timer = setTimeout(async () => {
      retry.timer = null;
      const fresh = await vault.read();
      const due = everyEntry(fresh).filter((e) => { const t = nextTry(fresh.connections?.[e.id]?.status); return t && t <= now() + 1000; });
      // Each check saves its status, which arms the next try.
      if (due.length) await Promise.all(due.map((e) => service.check(e.id).catch(() => null)));
      else void armRetry();
    }, Math.min(Math.max(0, Math.min(...times) - now()), 2 ** 31 - 1));
    retry.timer.unref?.();
  }

  /** What a sign-in leaves in the vault, keeping the person's own choices and history. */
  async function keepSignIn(id, got, { custom = null } = {}) {
    await vault.update((d) => {
      d.connections ??= {};
      const was = d.connections[id];
      d.connections[id] = {
        ...got, expiresAt: expiryOf(got.tokens, now()), person: personId(),
        ...(was?.chosen ? { chosen: was.chosen } : {}), ...(was?.activity ? { activity: was.activity } : {}),
        status: { accepted: was?.status?.accepted ?? null },
      };
      if (custom) { d.custom ??= {}; d.custom[id] = custom; }
    });
  }

  async function runSignIn(id, entry, client) {
    signingIn.get(id)?.();
    try {
      return await signIn({ entry, client, ownPort: ownClientPort, openExternal, ms: signInMs, onCancelable: (cancel) => signingIn.set(id, cancel) });
    } finally { signingIn.delete(id); }
  }

  const service = {
    catalog,
    async list() {
      const saved = await vault.read();
      return { tiles: everyEntry(saved).map((e) => tileOf(e, saved)), canEncrypt: vault.mayEncrypt() };
    },

    /** `clientId` and `clientSecret` for a tool that takes a client made in its console, `key` for one that takes a token. */
    async connect(id, { clientId = null, clientSecret = null, key = null } = {}) {
      const saved = await vault.read();
      const listed = entryIn(id, saved);
      if (!listed) return { ok: false, error: 'There is no such tool.' };
      if (listed.access === ACCESS.VENDOR_APPROVAL) return { ok: false, error: listed.needs };
      const onTest = typeof testOnlyFor === 'function' ? testOnlyFor(listed) : !testOnlyFor || testOnlyFor.includes(id);
      if (!vault.canEncrypt() || !onTest) return { ok: false, error: CANNOT_ENCRYPT };
      const entry = asChosen(listed, saved.connections?.[id]);
      const usesKey = entry.access === ACCESS.KEY || entry.signsInWithKey;
      try {
        if (usesKey) {
          const pasted = String(key ?? '').trim();
          if (!pasted) return { ok: false, needsKey: true, error: `${entry.name} takes a key. Paste it here.` };
          await keepSignIn(id, { tokens: { access_token: pasted, token_type: 'Bearer' } });
        } else {
          const had = saved.connections?.[id]?.client;
          const client = entry.access === ACCESS.OWN_CLIENT
            ? (clientId ? { client_id: String(clientId).trim(), client_secret: String(clientSecret ?? '').trim() } : (had?.client_secret ? had : null))
            : null;
          if (entry.access === ACCESS.OWN_CLIENT && !client) return { ok: false, needsClient: true, error: `Paste the client ID and secret from ${entry.name}.` };
          await keepSignIn(id, await runSignIn(id, entry, client));
        }
      } catch (err) {
        return { ok: false, error: String(err?.message ?? err) };
      }
      const tile = await service.check(id);
      if (!tile || (tile.state !== STATES.NOT_SIGNED_IN && tile.state !== STATES.NOT_ALLOWED)) {
        try { onSignedIn(entry); } catch (err) { console.warn('zero: could not act on a new sign-in:', err?.message ?? err); }
      }
      return { ok: true, tile };
    },

    /**
     * Any tool by its address. Nothing is kept until a sign-in or key got through,
     * and it reads nothing until its person has ticked what agents may read.
     */
    async addByAddress({ address, key = null } = {}) {
      const asked = String(address ?? '').trim();
      let u;
      try { u = new URL(asked); } catch { return { ok: false, error: 'That is not an address. It starts with https://' }; }
      if (u.protocol !== 'https:' && !(allowLoopback && onLoopback(asked))) return { ok: false, error: 'The address has to start with https://' };
      const norm = normalAddress(asked);
      const saved = await vault.read();
      const already = everyEntry(saved).find((e) => normalAddress(e.address) === norm);
      if (already) return { ok: false, existing: already.id, error: `${already.name} is already on this page.` };
      if (!vault.canEncrypt()) return { ok: false, error: CANNOT_ENCRYPT };
      if (testOnlyFor && !onLoopback(asked)) return { ok: false, error: CANNOT_ENCRYPT };
      const id = `custom-${crypto.createHash('sha256').update(norm).digest('hex').slice(0, 12)}`;
      const entry = {
        id, name: hostName(asked), address: asked, custom: true, group: 'added', access: ACCESS.SIGN_IN, auth: 'oauth', redirect: 'loopback', registration: 'dynamic', scope: null, needs: null, copy: null,
        reads: null, writes: [], check: null, ...(key ? { signsInWithKey: true } : {}),
      };
      try {
        const got = key ? { tokens: { access_token: String(key).trim(), token_type: 'Bearer' } } : await runSignIn(id, entry, null);
        await keepSignIn(id, got, { custom: entry });
      } catch (err) {
        if (err?.noRegistration) return { ok: false, needsKey: true, error: 'This tool does not let apps sign in by themselves. Paste an API key or token from it.' };
        return { ok: false, error: String(err?.message ?? err) };
      }
      const tile = await service.check(id);
      return { ok: true, tile };
    },

    /** What agents may read on a tool with no written list. Names it does not offer are dropped. */
    async chooseReads(id, names) {
      const saved = await vault.read();
      const offered = new Set((saved.connections?.[id]?.status?.tools ?? []).map((t) => t.name));
      if (!saved.connections?.[id] || entryIn(id, saved)?.reads) return null;
      const chosen = [...new Set((names ?? []).map(String))].filter((n) => offered.has(n));
      await vault.update((d) => { if (d.connections?.[id]) d.connections[id].chosen = chosen; });
      return service.check(id);
    },

    cancelConnect(id) { signingIn.get(id)?.(); signingIn.delete(id); },

    async disconnect(id) {
      service.cancelConnect(id);
      await vault.update((d) => {
        if (d.connections) delete d.connections[id];
        if (d.custom) delete d.custom[id];
      });
      onChange();
      onWhoChanged();
      return { ok: true };
    },

    /**
     * The real proof: the tool list and one read, no model turn. "Works" is only
     * ever said after a read that came back with something in it. A failed check
     * touches the status and nothing else.
     */
    check(id) {
      const running = checking.get(id);
      if (running) return running;
      const run = (async () => {
        const saved = await vault.read();
        const listed = entryIn(id, saved);
        if (!listed) return null;
        const before = saved.connections?.[id];
        if (!before) return tileOf(listed, {});
        const at = now();
        let patch;
        try {
          const found = await withTool(listed, async (client) => {
            const { tools } = await client.listTools(undefined, { timeout: checkMs });
            const entry = asChosen(listed, { ...before, status: { ...before.status, tools } });
            if (!entry.check) return { tools, choosing: true, server: client.getServerVersion?.()?.name };
            if (!tools.some((t) => t.name === entry.check.tool)) throw Object.assign(new Error(`it no longer offers ${entry.check.tool}`), { unreachable: true });
            const result = await client.callTool({ name: entry.check.tool, arguments: entry.check.args }, undefined, { timeout: checkMs });
            if (result.isError) throw new Error(oneLineRead(result) ?? 'the read failed');
            return { tools, line: oneLineRead(result), seen: countRead(result), server: client.getServerVersion?.()?.name };
          }, { ms: checkMs });
          const accepted = before.status?.accepted ?? prints(found.tools);
          patch = found.choosing
            ? { state: STATES.CHOOSE_READS, at, toolCount: found.tools.length, accepted, changed: toolsChanged(accepted, found.tools), tools: found.tools, workedAt: null }
            : {
              state: found.line ? STATES.WORKS : STATES.NOTHING_TO_READ, at, read: found.line, seen: found.seen, toolCount: found.tools.length,
              accepted, changed: toolsChanged(accepted, found.tools), tools: found.tools,
              ...(found.line ? { workedAt: at } : {}),
            };
          // A name is what a server calls itself: shown, and never used to decide anything.
          const named = clip(found.server, 40);
          if (listed.custom && named && named !== listed.name) await vault.update((d) => { if (d.custom?.[id]) d.custom[id].name = named; });
        } catch (err) { patch = { state: stateOfError(err), at }; }
        await saveStatus(id, patch);
        const after = await vault.read();
        return tileOf(entryIn(id, after) ?? listed, after);
      })().finally(() => checking.delete(id));
      checking.set(id, run);
      return run;
    },

    /** Called when the page opens: time is read, not waited for. */
    async checkStale({ now: at = now() } = {}) {
      const saved = await vault.read();
      await Promise.all(everyEntry(saved)
        .filter((e) => saved.connections?.[e.id] && at - (saved.connections[e.id].status?.at ?? 0) > DAY_MS)
        .map((e) => service.check(e.id).catch(() => null)));
    },

    /**
     * Renews a sign-in before it ends, where the tool gave a way to, and says so a
     * while ahead where it did not. A job should never be how anybody finds out.
     */
    async keepAlive() {
      const saved = await vault.read();
      const at = now();
      for (const listed of everyEntry(saved)) {
        const c = saved.connections?.[listed.id];
        if (!c?.expiresAt || c.status?.state === STATES.NOT_SIGNED_IN || at > c.expiresAt + RENEW_GIVES_UP_AFTER_MS) continue;
        if (c.tokens?.refresh_token) {
          if (c.expiresAt - at > RENEW_BEFORE_MS) continue;
          try { await refreshOnce(listed, c.tokens.access_token); } catch (err) {
            if (err?.status === 401) await saveStatus(listed.id, { state: STATES.NOT_SIGNED_IN, at });
            // Anything else did not get through: the next pass tries, up to the limit above.
          }
        } else if (c.expiresAt - at <= WARN_BEFORE_MS && c.warnedFor !== c.expiresAt) {
          await vault.update((d) => { if (d.connections?.[listed.id]) d.connections[listed.id].warnedFor = c.expiresAt; });
          fileRow({
            title: `${listed.name} signs out soon`,
            problem: `Its sign-in ends at ${clockAt(c.expiresAt, at)}, and ${listed.name} gives no way to renew it.`,
            body: `A job that needs it after that will stop. [Sign in to ${listed.name} again](agentbox://connections/${listed.id})`,
          });
        }
      }
    },

    async acceptTools(id) {
      await vault.update((d) => {
        const s = d.connections?.[id]?.status;
        if (s?.tools) { s.accepted = prints(s.tools); s.changed = []; }
      });
      onChange();
    },

    /** Who the team may be told has this tool. An outage does not take it away; a lost sign-in does. */
    async connectedIds() {
      const saved = await vault.read();
      return everyEntry(saved).filter((e) => saved.connections?.[e.id] && !SIGNED_OUT.has(saved.connections[e.id].status?.state)).map((e) => e.id);
    },

    /**
     * What a run may be handed: this person's, read successfully at least once.
     * A tool that is down stays on, because a failed check removes nothing. A
     * lost sign-in or lost access is off until it is put right, unless
     * `includeLapsed` asks only whether it is still theirs.
     */
    workingNow({ includeLapsed = false } = {}) {
      const saved = vault.readNow();
      const me = personId() ?? null;
      return everyEntry(saved).filter((e) => {
        const c = saved.connections?.[e.id];
        // Connected before signing in to a team, it belongs to whoever this copy is.
        if (!c || (c.person && c.person !== me)) return false;
        if (includeLapsed) return true;
        const { state, workedAt } = c.status ?? {};
        return !!workedAt && state !== STATES.NOT_SIGNED_IN && state !== STATES.NOT_ALLOWED && state !== STATES.UNREACHABLE && state !== STATES.CHOOSE_READS;
      }).map((e) => asChosen(e, saved.connections[e.id]));
    },

    /** Every tool in the catalog as this person's copy has it, for what a worker is told. */
    statusNow() {
      const saved = vault.readNow();
      const me = personId() ?? null;
      const given = new Set(service.workingNow().map((e) => e.id));
      return everyEntry(saved).map((e) => {
        const c = saved.connections?.[e.id];
        if (!c || (c.person && c.person !== me)) return { id: e.id, name: e.name, state: STATES.NOT_CONNECTED, given: false };
        const s = c.status ?? {};
        return {
          id: e.id, name: e.name, state: s.state ?? STATES.WORKS, since: s.since ?? s.at ?? null, at: s.at ?? null, workedAt: s.workedAt ?? null, given: given.has(e.id),
          endsAt: c.tokens?.refresh_token ? null : (c.expiresAt ?? null),
        };
      });
    },

    /** Tries a down connection again on the bounded schedule, and keeps sign-ins alive, from now until stop. */
    startRetrying() {
      retry.on = true;
      void armRetry();
      void service.keepAlive().catch(() => {});
      clearInterval(retry.keepAlive);
      retry.keepAlive = setInterval(() => { void service.keepAlive().catch(() => {}); }, keepAliveEvery);
      retry.keepAlive.unref?.();
    },

    async stop() {
      retry.on = false;
      clearTimeout(retry.timer);
      clearInterval(retry.keepAlive);
      retry.timer = null;
      retry.keepAlive = null;
      for (const cancel of signingIn.values()) cancel();
      signingIn.clear();
    },

    // The broker's way in; it lives in the app with this object.
    _entryOf: entryOf,
    _withTool: withTool,
    _saveStatus: saveStatus,
    // An agent's real read counts: a tile should not say down over one that just worked.
    async _noteRead(id) {
      const state = (await vault.read()).connections?.[id]?.status?.state;
      if (state === STATES.DOWN || state === STATES.UNREACHABLE) await saveStatus(id, { state: STATES.WORKS, at: now(), workedAt: now() });
    },
    /** One use by an agent: when, and if it failed which tool and why. Never what it asked for. */
    async _noteUse(id, { tool, wrote = false, ok, why = null }) {
      const at = now();
      await vault.update((d) => {
        const c = d.connections?.[id];
        if (!c) return;
        c.activity ??= { lastUsedAt: null, failures: [] };
        c.activity.lastUsedAt = at;
        if (!ok) c.activity.failures = [{ at, tool: String(tool), wrote: !!wrote, why: clip(why, FAILED_WHY_MOST) }, ...(c.activity.failures ?? [])].slice(0, FAILURES_KEPT);
      });
      onChange();
    },
    async _noteTools(id, tools) {
      const c = (await vault.read()).connections?.[id];
      const accepted = c?.status?.accepted;
      if (!accepted) return;
      const changed = toolsChanged(accepted, tools);
      if (JSON.stringify(changed) !== JSON.stringify(c.status.changed ?? [])) await saveStatus(id, { tools, changed, toolCount: tools.length });
    },
    _read: () => vault.read(),
    callMs,
  };
  return service;
}

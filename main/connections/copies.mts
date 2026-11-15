// KEEP A COPY IN FILES: what matters in a connected tool, as markdown in a folder
// named for it, on a schedule that stops by itself and says so.
//
// A copy is a file in a project, on a closed thread of that project, so who may
// read it is decided where it is decided for every other file: the project and the
// thread (main/files-place.mts, main/team/thread-share.mts). Nothing here decides it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { clockAt, STATES, type CatalogTool, type CopyTold } from '../../shared/connections-catalog.mts';
import type { Store, StoreProduct } from '../store.mts';
import { looksSecret } from '../team/carry-files.mts';
import type { Connections, NeedsYouRow } from './index.mts';
import type { ToolClient, ToolError, ToolRow } from './talk.mts';

/** One file a copy writes. */
interface CopyFile {
  name: string;
  text: string;
}

interface RenderCtx {
  tool: string;
  at: number;
}

/** What one row or channel could not be copied, and why. `what` is null for the whole run. */
export interface CopyFailure {
  what: string | null;
  why: string;
  at: number;
}

/** A tool kept in Files, as its state file holds it. */
export interface CopyJob {
  project: string;
  projectName?: string | null;
  channels?: string[];
  threadId?: string;
  names?: string[];
  count?: number;
  ranAt?: number | null;
  okAt?: number | null;
  tries?: number;
  failed?: CopyFailure[];
  nextAt?: number | null;
  stoppedAt?: number | null;
  toldStopped?: boolean;
}

/** One kept tool as the Connections page shows it. */
export interface CopyShown {
  project: string;
  projectName: string | null;
  channels: string[];
  count: number;
  ranAt: number | null;
  okAt: number | null;
  failed: CopyFailure[];
  nextAt: number | null;
  stoppedAt: number | null;
}

/** Where copied files are said to have landed (main/files-place.mts). */
export type CopyPlace = () => { fileIn?(what: { project: string; names: string[]; folder: string }): unknown } | null | undefined;

interface SlackChannel {
  id?: string;
  name?: string;
}

interface SlackMessage {
  ts?: string;
  text?: string;
  user?: string;
  user_name?: string;
  username?: string;
  permalink?: string;
  reply_count?: number;
}

export const COPY_EVERY_MS = 6 * 3600_000;
// After a run fails: each of these, then it stops until a press or a new sign-in.
export const COPY_RETRY_STEPS_MS = [30 * 60_000, 2 * 3600_000, 8 * 3600_000];
export const RUN_MS = 5 * 60_000;
export const CALL_MS = 30_000;
const ITEMS_MOST = 100;
const FILE_BYTES_MOST = 300_000;
const FAILED_SHOWN = 10;
const LINKS_IN_A_NOTE = 20;
const NAME_MOST = 60;
const TICK_MS = 60_000;

const textOf = (result: CallToolResult | null | undefined): string => (result?.content ?? []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n').trim();
const parsed = (result: CallToolResult): unknown => { try { return JSON.parse(textOf(result)); } catch { return null; } };
const firstList = <T extends object = ToolRow>(value: unknown): T[] | null => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') for (const v of Object.values(value)) { if (Array.isArray(v)) return v; }
  return null;
};

const slug = (s: unknown, most: number = NAME_MOST): string => String(s ?? '').normalize('NFKD').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, most).replace(/-+$/, '');
const safeId = (s: unknown): string => String(s ?? '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || crypto.randomBytes(3).toString('hex');
const oneLine = (s: unknown): string => String(s ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
// Anything that is not an address throws in `new URL`, and reads as none.
const safeUrl = (u: unknown): string | null => { try { const x = new URL(u as string); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };

const WHEN = (ms: number): string => {
  const d = new Date(ms);
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()} ${clockAt(ms, ms)}`;
};

// A file's family is its name less any version tail, so an id stays in every name
// to keep two rows apart. A name that reads as secret would never cross to a
// teammate (main/team/carry-files.mts), so that one is the id alone.
function fileName({ id, title, idFirst = false }: { id: unknown; title: unknown; idFirst?: boolean }): string {
  const short = safeId(id);
  const words = slug(title);
  const name = !words ? `${short}.md` : idFirst ? `${short}-${words}.md` : `${words}-${slug(short, 12) || short}.md`;
  return looksSecret(name) ? `${short}.md` : name;
}

const head = ({ title, tool, url, at, facts = [] }: { title: string; tool: string; url?: string; at: number; facts?: [string, unknown][] }): string[] => [
  `# ${oneLine(title) || 'Untitled'}`,
  '',
  `> From ${safeUrl(url) ? `[${tool}](${safeUrl(url)})` : tool}. Copied ${WHEN(at)}.`,
  '',
  ...(facts.length ? [facts.filter(([, v]) => v != null && v !== '').map(([k, v]) => `**${k}** ${oneLine(v)}`).join('  \n'), ''] : []),
];

function capped(text: string): string {
  if (Buffer.byteLength(text) <= FILE_BYTES_MOST) return `${text.trimEnd()}\n`;
  return `${Buffer.from(text).subarray(0, FILE_BYTES_MOST).toString('utf8').replace(/�*$/, '')}\n\n*This copy was cut here because the original is too long. The rest is in the tool.*\n`;
}

const MONEY = (v: string | number): string | number => {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toLocaleString('en-US')}` : v;
};
const DAY = (v: string): string => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

// The tool's own markup around a page is not part of the page.
function pageBody(row: ToolRow): string {
  const raw = String(row.text ?? row.content ?? row.body ?? row.markdown ?? '');
  const inner = /<content>\n?([\s\S]*?)<\/content>/.exec(raw);
  return inner ? inner[1] : raw;
}
const withoutOwnTitle = (body: string, title: string): string => {
  const m = /^\s*#\s+(.+)\n?/.exec(body);
  return m && oneLine(m[1]) === oneLine(title) ? body.slice(m[0].length).replace(/^\n+/, '') : body;
};

const RENDER = {
  issue(row: ToolRow, { tool, at }: RenderCtx): CopyFile {
    const id = row.identifier ?? row.id;
    const title = oneLine(row.title ?? row.name);
    const comments = Array.isArray(row.comments) ? row.comments : [];
    return {
      name: fileName({ id, title, idFirst: true }),
      text: capped([
        ...head({
          title: `${id} ${title}`.trim(), tool, url: row.url, at,
          facts: [['Status', row.status?.name ?? row.status ?? row.state], ['Priority', row.priority?.name ?? (typeof row.priority === 'string' ? row.priority : null)], ['Assignee', row.assignee?.name ?? row.assignee], ['Project', row.project?.name ?? row.project], ['Updated', row.updatedAt && DAY(row.updatedAt)]],
        }),
        String(row.description ?? row.body ?? ''),
        ...(comments.length ? ['', '## Comments', '', ...comments.flatMap((c) => [`**${oneLine(c.author?.name ?? c.author ?? c.user)}**${c.createdAt ? `, ${DAY(c.createdAt)}` : ''}`, '', String(c.body ?? c.text ?? ''), ''])] : []),
      ].join('\n')),
    };
  },
  page(row: ToolRow, { tool, at }: RenderCtx): CopyFile {
    const title = oneLine(row.title ?? row.name) || 'Untitled';
    return {
      name: fileName({ id: String(row.id ?? row.url ?? title).slice(0, 8), title }),
      text: capped([...head({ title, tool, url: row.url, at }), withoutOwnTitle(pageBody(row), title)].join('\n')),
    };
  },
  deal(row: ToolRow, { tool, at }: RenderCtx): CopyFile {
    const p = row.properties ?? row;
    const title = oneLine(p.dealname ?? p.name ?? row.title) || `Deal ${row.id}`;
    return {
      name: fileName({ id: row.id, title }),
      text: capped([
        ...head({
          title, tool, url: row.url, at,
          facts: [['Amount', p.amount && MONEY(p.amount)], ['Stage', p.dealstage], ['Owner', p.hubspot_owner_name ?? p.hubspot_owner_id], ['Closes', p.closedate && DAY(p.closedate)], ['Updated', p.hs_lastmodifieddate && DAY(p.hs_lastmodifieddate)]],
        }),
        String(p.description ?? ''),
      ].join('\n')),
    };
  },
  thread({ channel, message, replies }: { channel: string; message: SlackMessage; replies: SlackMessage[] }, { tool, at }: RenderCtx): CopyFile {
    const said = (m: SlackMessage) => [`**${oneLine(m.user_name ?? m.user ?? m.username)}**`, '', String(m.text ?? ''), ''];
    const title = `#${channel}: ${oneLine(message.text).slice(0, 80)}`;
    return {
      // A message's second, since the digits after it repeat across a channel.
      name: fileName({ id: String(message.ts ?? '').split('.')[0], title: `${channel} ${oneLine(message.text).slice(0, 50)}` }),
      text: capped([...head({ title, tool, url: message.permalink, at }), ...said(message), ...replies.flatMap(said)].join('\n')),
    };
  },
  loose({ channel, messages }: { channel: string; messages: SlackMessage[] }, { tool, at }: RenderCtx): CopyFile {
    return {
      name: `${slug(channel)}-latest-messages.md`,
      text: capped([...head({ title: `#${channel}, latest messages`, tool, at }), ...messages.flatMap((m) => [`**${oneLine(m.user_name ?? m.user)}**`, '', String(m.text ?? ''), ''])].join('\n')),
    };
  },
  words({ what, text }: { what: string; text: string }, { tool, at }: RenderCtx): CopyFile {
    return { name: `${slug(what)}-latest.md`, text: capped([...head({ title: `${tool}, ${what}`, tool, at }), text].join('\n')) };
  },
};

export const renderForTest = (kind: 'issue' | 'page' | 'deal', row: ToolRow, ctx: RenderCtx): CopyFile => RENDER[kind](row, ctx);

/** The rows a read listed, or null when it answered in words we cannot split. */
const listIn = <T extends object = ToolRow>(result: CallToolResult): T[] | null => { const v = parsed(result); return v == null ? null : (firstList<T>(v) ?? null); };

// `entry` comes from `_entryOf`, whose `reads` are always a list.
async function gather({ client, entry, job, at, callMs }: { client: ToolClient; entry: CatalogTool; job: CopyJob; at: number; callMs: number }): Promise<{ files: CopyFile[]; failed: CopyFailure[] }> {
  const tool = entry.name;
  const ask = async (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
    // The written list is the law here as it is for an agent.
    if (!entry.reads!.includes(name)) throw new Error(`${name} is not on ${tool}'s read list`);
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: callMs }) as CallToolResult;
    if (result.isError) throw new Error(textOf(result) || 'the read failed');
    return result;
  };
  const files: CopyFile[] = [];
  const failed: CopyFailure[] = [];
  const recipe = entry.copy!;
  const whole = (result: CallToolResult, what: string) => { files.push(RENDER.words({ what, text: textOf(result) }, { tool, at })); };

  if (recipe.kind === 'thread') {
    for (const named of job.channels ?? []) {
      const channel = String(named).replace(/^#/, '');
      try {
        const found = firstList<SlackChannel>(parsed(await ask('slack_search_channels', { query: channel })) ?? []) ?? [];
        const hit = found.find((c) => c.name === channel) ?? null;
        if (!hit) { failed.push({ what: `#${channel}`, why: 'No channel by that name.', at }); continue; }
        const read = await ask('slack_read_channel', { channel_id: hit.id, limit: 50 });
        const messages = listIn<SlackMessage>(read);
        if (!messages) { whole(read, `${channel} messages`); continue; }
        const loose: SlackMessage[] = [];
        for (const message of messages.slice(0, ITEMS_MOST)) {
          if (!message.reply_count) { loose.push(message); continue; }
          const replies = listIn<SlackMessage>(await ask('slack_read_thread', { channel_id: hit.id, message_ts: message.ts })) ?? [];
          files.push(RENDER.thread({ channel, message, replies }, { tool, at }));
        }
        if (loose.length) files.push(RENDER.loose({ channel, messages: loose }, { tool, at }));
      } catch (err) { failed.push({ what: `#${channel}`, why: oneLine((err as Error | null)?.message ?? err), at }); }
    }
    return { files, failed };
  }

  const listed = await ask(recipe.list.tool, recipe.list.args);
  const rows = listIn(listed);
  if (!rows) {
    if (textOf(listed)) whole(listed, recipe.things);
    return { files, failed };
  }
  for (const row of rows.slice(0, ITEMS_MOST)) {
    const id = row.identifier ?? row.id;
    try {
      let full = row;
      if (recipe.get && id != null) {
        const got = parsed(await ask(recipe.get.tool, { [recipe.get.arg]: id }));
        if (got) full = { ...row, ...got };
      }
      files.push(RENDER[recipe.kind](full, { tool, at }));
    } catch (err) { failed.push({ what: String(id ?? row.title ?? 'one row'), why: oneLine((err as Error | null)?.message ?? err), at }); }
  }
  return { files, failed };
}

const COPIED = /Copied [^\n]*\d{4} [^\n]*\.\n/;
const sameWords = (a: string, b: string): boolean => a.replace(COPIED, '') === b.replace(COPIED, '');

export interface CopiesOptions {
  connections: Connections;
  store: Store;
  stateFile: string;
  now?: () => number;
  onNeedsYou?: (row: NeedsYouRow) => void;
  onChange?: () => void;
  everyMs?: number;
  steps?: number[];
  runMs?: number;
  callMs?: number;
}

export function createCopies({
  connections, store, stateFile, now = Date.now, onNeedsYou = () => {}, onChange = () => {},
  everyMs = COPY_EVERY_MS, steps = COPY_RETRY_STEPS_MS, runMs = RUN_MS, callMs = CALL_MS,
}: CopiesOptions) {
  let place: CopyPlace | null = null;
  let timer: NodeJS.Timeout | null = null;
  const running = new Map<string, Promise<CopyJob | null>>();

  const load = (): Record<string, CopyJob> => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };
  const save = (all: Record<string, CopyJob>): void => {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const tmp = `${stateFile}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 });
    fs.renameSync(tmp, stateFile);
  };
  const patch = (id: string, change: Partial<CopyJob>): CopyJob | null => {
    const all = load();
    if (!all[id]) return null;
    all[id] = { ...all[id], ...change };
    save(all);
    onChange();
    return all[id];
  };
  const productOf = (slugName: string | undefined): StoreProduct | null => store.listProducts().find((p) => p.slug === slugName && !p.team?.direct) ?? null;

  /** The closed thread a tool's files hang on. It is why they are files, and it starts nothing. */
  function threadFor(job: CopyJob, entry: CatalogTool, product: StoreProduct): string {
    const disk = store.modules.workItemsDisk;
    const dir = store.productDir(product.slug);
    if (job.threadId) {
      try { if (disk.readWorkItem(dir, job.threadId)) return job.threadId; } catch { /* made again below */ }
    }
    const made = disk.createWorkItem(dir, {
      title: `Copies from ${entry.name}`,
      problem: `What ${entry.name} holds, kept as files in the ${entry.name} folder.`,
      kind: 'review',
      // No visibility of its own: a thread's own word would outrank its project's.
    }, { source: 'system' });
    disk.updateWorkItem(dir, made.id, { status: 'done' }, { source: 'system' });
    return made.id;
  }

  // A shared thread carries only the files its newest messages name, so the whole
  // list is said again whenever a new file joins it, in notes short enough to pass.
  function nameOnThread(product: StoreProduct, threadId: string, names: string[], toolId: string): void {
    const links = names.map((n) => `[${n}](sources/${toolId}/${n})`);
    for (let i = 0; i < links.length; i += LINKS_IN_A_NOTE) {
      store.noteItem(product.slug, threadId, links.slice(i, i + LINKS_IN_A_NOTE).join('\n'));
    }
  }

  function write(product: StoreProduct, toolId: string, files: CopyFile[]): void {
    const dir = path.join(store.productDir(product.slug), 'sources', toolId);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const to = path.join(dir, f.name);
      if (path.dirname(to) !== dir) continue;
      let was: string | null = null;
      try { was = fs.readFileSync(to, 'utf8'); } catch { /* new */ }
      if (was != null && sameWords(was, f.text)) continue;
      const tmp = `${to}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmp, f.text);
      fs.renameSync(tmp, to);
    }
  }

  function failedRun(id: string, entry: CatalogTool | null, why: string, at: number, { retry = true }: { retry?: boolean } = {}): CopyJob | null {
    const job = load()[id];
    const tries = (job.tries ?? 0) + 1;
    const step = retry ? steps[tries - 1] : null;
    const stoppedAt = retry && step == null ? at : null;
    const out = patch(id, {
      ranAt: at, tries, failed: [{ what: null, why, at }],
      nextAt: step != null ? at + step : null, stoppedAt,
    });
    if (stoppedAt && !job.toldStopped) {
      patch(id, { toldStopped: true });
      try {
        onNeedsYou({
          title: `Copies from ${entry?.name ?? id} stopped`,
          problem: `It failed ${tries} times in a row and last tried at ${clockAt(at, at)}: ${why}`,
          body: `What was copied before is still in Files. [Open ${entry?.name ?? id} on Connections](agentbox://connections/${id}) to run it again.`,
        });
      } catch (err) { console.warn('zero: could not say a copy stopped:', (err as Error | null)?.message ?? err); }
    }
    return out;
  }

  async function runOnce(id: string): Promise<CopyJob | null> {
    const job = load()[id];
    if (!job) return null;
    const entry = connections._entryOf(id);
    const at = now();
    const usable = entry && connections.workingNow().some((e) => e.id === id);
    if (!usable) return failedRun(id, entry, `${entry?.name ?? 'This tool'} is not signed in, so nothing could be read.`, at, { retry: false });
    const product = productOf(job.project);
    if (!product) return failedRun(id, entry, 'Its project is gone.', at, { retry: false });
    let got;
    try {
      got = await connections._withTool(entry, (client) => gather({ client, entry, job, at, callMs }), { ms: runMs });
    } catch (err) {
      const signedOut = (err as ToolError | null)?.status === 401;
      // Lets the tile say the same thing the copy line says.
      if (signedOut) await connections._saveStatus(id, { state: STATES.NOT_SIGNED_IN, at }).catch(() => {});
      return failedRun(id, entry, signedOut ? `${entry.name} no longer accepts this sign-in.` : `${entry.name} did not answer.`, at, { retry: !signedOut });
    }
    write(product, id, got.files);
    const names = got.files.map((f) => f.name).sort();
    const known = new Set(job.names ?? []);
    const threadId = threadFor(job, entry, product);
    const grew = names.some((n) => !known.has(n));
    const allNames = [...new Set([...known, ...names])].sort();
    if (grew) {
      nameOnThread(product, threadId, allNames, id);
      await place?.()?.fileIn?.({ project: product.name, names: allNames, folder: entry.name });
    }
    return patch(id, {
      threadId, names: allNames, count: allNames.length, ranAt: at, okAt: at, tries: 0, toldStopped: false,
      failed: got.failed.slice(0, FAILED_SHOWN), nextAt: at + everyMs, stoppedAt: null,
    });
  }

  function run(id: string): Promise<CopyJob | null> {
    const held = running.get(id);
    if (held) return held;
    const going = runOnce(id).finally(() => running.delete(id));
    running.set(id, going);
    return going;
  }

  const service = {
    bindPlace(fn: CopyPlace): void { place = fn; },

    /** What the page shows, one row per kept tool. */
    all(): Record<string, CopyShown> {
      const out: Record<string, CopyShown> = {};
      for (const [id, j] of Object.entries(load())) {
        out[id] = { project: j.project, projectName: productOf(j.project)?.name ?? j.projectName ?? null, channels: j.channels ?? [], count: j.count ?? 0, ranAt: j.ranAt ?? null, okAt: j.okAt ?? null, failed: j.failed ?? [], nextAt: j.nextAt ?? null, stoppedAt: j.stoppedAt ?? null };
      }
      return out;
    },

    /** What a worker is told lives in Files. */
    now(): (CopyTold & { id: string; project: string })[] {
      return Object.entries(load()).filter(([, j]) => j.count).map(([id, j]) => {
        const name = connections.catalog.find((e) => e.id === id)?.name ?? id;
        return { id, name, folder: name, project: j.project, projectName: productOf(j.project)?.name ?? j.projectName ?? j.project, count: j.count!, okAt: j.okAt ?? null };
      });
    },

    async start(id: string, { project, channels = [] }: { project?: string; channels?: string[] } = {}): Promise<{ ok: true; copy: CopyShown } | { ok: false; error: string }> {
      const entry = connections._entryOf(id);
      if (!entry?.copy) return { ok: false, error: `${entry?.name ?? 'This tool'} has no way to keep a copy yet.` };
      if (!connections.workingNow().some((e) => e.id === id)) return { ok: false, error: `Connect ${entry.name} first, so a real read has passed.` };
      const product = productOf(project);
      if (!product) return { ok: false, error: 'Pick a project for the copies to sit in.' };
      const named = [...new Set((channels ?? []).map((c) => String(c).replace(/^#/, '').trim()).filter(Boolean))];
      if (entry.copy.asks === 'channels' && !named.length) return { ok: false, error: 'Name at least one channel.' };
      const all = load();
      all[id] = { ...(all[id] ?? {}), project: product.slug, projectName: product.name, channels: named, tries: 0, stoppedAt: null, toldStopped: false };
      save(all);
      await run(id);
      service.schedule();
      return { ok: true, copy: service.all()[id] };
    },

    run,

    /** After a new sign-in: anything waiting on it goes now, whatever the schedule said. */
    async kick(id: string): Promise<CopyJob | null> {
      const job = load()[id];
      return job?.failed?.length || job?.stoppedAt ? run(id) : null;
    },

    /** The files stay: they are the team's now. Only the schedule ends. */
    async stopKeeping(id: string): Promise<void> {
      const all = load();
      delete all[id];
      save(all);
      onChange();
    },

    /** Whatever is due. Each tool's own failures do not hold the others up. */
    async tick(): Promise<void> {
      const at = now();
      const due = Object.entries(load()).filter(([, j]) => j.nextAt && j.nextAt <= at);
      await Promise.all(due.map(([id]) => run(id).catch((err) => console.warn('zero: a copy run failed:', (err as Error | null)?.message ?? err))));
    },

    schedule(): void {
      if (timer) return;
      timer = setInterval(() => { void service.tick(); }, TICK_MS);
      timer.unref?.();
    },

    async stop(): Promise<void> {
      clearInterval(timer!);
      timer = null;
      await Promise.all([...running.values()].map((r) => r.catch(() => {})));
    },
  };
  return service;
}

export type Copies = ReturnType<typeof createCopies>;

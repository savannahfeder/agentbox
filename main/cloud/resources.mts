import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readPortableFile, snapshotSkills, filesInFolder, SKILL_LIMITS } from './skills.mts';
import { run } from './exec.mts';
import { HAND_BACK } from '../../shared/cloud-hand-back.mts';

export interface ResourceAnswer {
  status: string;
  why?: string;
  message?: string;
  path?: string;
  bytes?: number;
  files?: { path: string; bytes: number }[];
}

export interface ResourceRecord {
  status: string;
  bytes: number;
  answer?: ResourceAnswer;
}

export interface ResourceState {
  requests?: Record<string, ResourceRecord>;
}

export interface ResourceFile {
  path: string;
  url: string;
  untar?: string;
  mode?: number;
}

export interface ResourceContext {
  engine: string;
  homeDir: string;
  configDir: string;
  codexHome: string | null;
  skillsAvailable?: boolean;
}

export interface ResourceAsk {
  kind?: unknown;
  path?: unknown;
  scope?: unknown;
}

export interface ResourceRequestOptions {
  cwd: string;
  docs?: string | null;
  account?: string | null;
  engine: string;
  homeDir: string;
  configDir: string;
  codexHome: string | null;
  skillsAvailable?: boolean;
  runId: string;
  state: ResourceState;
  save: () => void;
  upload: (name: string, body: string | Buffer) => Promise<string>;
  deliver: (files: ResourceFile[], signal: AbortSignal) => Promise<boolean>;
  stopped?: () => boolean;
  capable?: () => boolean;
  log?: (line: string) => void;
  timeoutMs?: number;
  limits?: Partial<{ file: number; total: number; requests: number; inFlight: number }>;
}

interface Named {
  kind?: 'skill' | 'file';
  name?: string;
  root?: string;
  full?: string;
  refused?: string;
}

interface FailedWith extends Error {
  status?: string;
  code?: string;
}

const digest = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const inside = (p: string, root: string) => p === root || p.startsWith(root + path.sep);
const unavailable = (why: string): ResourceAnswer => ({ status: 'unavailable', why,
  message: `The resource could not be delivered: ${why}. If the request names or needs this file, folder or skill, do not build around a guess: end your turn with the one line ${HAND_BACK} followed by what is missing. Otherwise go on without it and say what is missing.` });
const OLD_IMAGE = 'this cloud machine\'s image is older than file delivery and has to be rebuilt (npm run deploy)';

// The account's documents folder, `<store>/accounts/<id>`, which holds every
// product's documents.
export function accountFolderFor({ accountId, roots = [], docs = null }: { accountId?: string; roots?: string[]; docs?: string | null }) {
  const candidates = /^[A-Za-z0-9_-]+$/.test(accountId || '') ? roots.map((r) => path.join(r, 'accounts', accountId!)) : [];
  if (docs && path.basename(path.dirname(path.dirname(docs))) === 'accounts') candidates.push(path.dirname(docs));
  return candidates.find((dir) => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } }) || null;
}

export function resourceContextFor(marker: { resourceContext?: ResourceContext; engine?: string; bringDirs?: { name: string; dir: string }[]; configDir?: string }, defaults: ResourceContext): ResourceContext {
  if (marker.resourceContext) return { ...marker.resourceContext, skillsAvailable: true };
  const engine = marker.engine || defaults.engine;
  const sessions = marker.bringDirs?.find((b) => b.name === 'sessions.tgz' && path.basename(b.dir) === 'sessions');
  const codexHome = engine === 'codex' && sessions ? path.dirname(sessions.dir) : null;
  return { ...defaults, engine, configDir: marker.configDir || defaults.configDir, codexHome,
    skillsAvailable: engine === 'codex' ? !!codexHome : !!marker.configDir };
}

const OUTSIDE = 'Request a path under this task folder or the account\'s documents (relative with a scope, or written out in full), or an installed skill name.';
const ONLY_THERE = `This file is only on the computer. If the request is for it or needs it, end your turn with the one line ${HAND_BACK} followed by what is missing.`;
const tooBig = (message: string): ResourceAnswer => ({ status: 'too_large', message: `${message}. ${ONLY_THERE}` });

// A file is named by where it is on the computer, whichever way it was asked
// for, and is served only from inside the folder that holds it.
function normalized(args: ResourceAsk | null | undefined, { cwd, docs, account, homeDir }: { cwd: string; docs?: string | null; account?: string | null; homeDir: string }): Named | null {
  if (!args || !['file', 'skill'].includes(args.kind as string) || typeof args.path !== 'string' || !args.path || args.path.length > 1024) return null;
  if (/[\\\r\n\0]/.test(args.path)) return null;
  if (args.kind === 'skill') {
    if (path.posix.isAbsolute(args.path) || args.path.split('/').includes('..')) return null;
    const name = path.posix.normalize(args.path);
    return /^(?:\.system\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? { kind: 'skill', name } : null;
  }
  let full: string | null | undefined;
  if (args.path === '~' || args.path.startsWith('~/')) full = homeDir ? path.join(homeDir, args.path.slice(1)) : null;
  else if (path.posix.isAbsolute(args.path)) full = path.posix.normalize(args.path);
  else if (['task', 'documents', 'account'].includes(args.scope as string)) {
    const base = { task: cwd, documents: docs, account }[args.scope as 'task' | 'documents' | 'account'];
    if (!base) return { refused: 'This run has no such resource folder.' };
    full = path.join(base, args.path);
  } else return null;
  if (!full) return null;
  const root = [cwd, docs, account].filter(Boolean).map((r) => path.resolve(r!)).find((r) => inside(full!, r));
  if (!root) return { refused: `${OUTSIDE} ${ONLY_THERE}` };
  if (path.relative(root, full).split(path.sep).some((p) => p.startsWith('.'))) return null;
  return { kind: 'file', root, full };
}

/** A run-bound resolver. Its durable state belongs to that run's marker, never the caller. */
export function createResourceRequests({ cwd, docs, account = null, engine, homeDir, configDir, codexHome, skillsAvailable = true, runId, state, save, upload, deliver, stopped = () => false, capable = () => true, log = () => {}, timeoutMs = 45_000, limits: overrides = {} }: ResourceRequestOptions) {
  const limits = { file: SKILL_LIMITS.file, total: SKILL_LIMITS.total, requests: 40, inFlight: 5, ...overrides };
  state.requests ??= {};
  // An interrupted in-flight attempt is retriable; completed deliveries remain pinned.
  for (const [id, r] of Object.entries(state.requests!)) if (r.status === 'pending') delete state.requests![id];
  const inFlight = new Map<string, Promise<ResourceAnswer>>();
  const controllers = new Set<AbortController>();
  let active = 0; let closed = false;
  const used = () => Object.values(state.requests!).reduce((sum, r) => sum + (r.bytes || 0), 0);

  const said = (args: ResourceAsk | null | undefined, answer: ResourceAnswer) => {
    if (answer.status !== 'delivered') log(`request_cloud_resource ${args?.kind} ${String(args?.path).slice(0, 200)}: ${answer.status}${answer.why || answer.message ? ` (${answer.why || answer.message})` : ''}`);
    return answer;
  };
  const request = async (args?: ResourceAsk | null) => said(args, await ask(args));
  const ask = async (args?: ResourceAsk | null): Promise<ResourceAnswer> => {
    if (closed || stopped()) return unavailable('this cloud run is ending');
    if (!capable()) return unavailable(OLD_IMAGE);
    const named = normalized(args, { cwd, docs, account, homeDir });
    if (!named) return { status: 'denied', message: OUTSIDE };
    if (named.refused) return { status: 'denied', message: named.refused };
    if (named.kind === 'skill' && !skillsAvailable) return unavailable('this run does not know which skills folder on the computer is its own');
    const id = digest(JSON.stringify(named));
    if (inFlight.has(id)) return inFlight.get(id)!;
    if (state.requests![id]?.status && state.requests![id].status !== 'pending') return state.requests![id].answer!;
    if (active >= limits.inFlight) return unavailable('too many requests are already on their way; ask again when one has answered');
    if (Object.keys(state.requests!).length >= limits.requests) return { status: 'denied', message: 'This run has reached its resource-request count limit.' };
    state.requests![id] = { status: 'pending', bytes: 0 }; save();
    const controller = new AbortController();
    controllers.add(controller);
    const live = () => !controller.signal.aborted && !closed && !stopped();
    const reserve = (bytes: number) => {
      if (used() + bytes > limits.total) return false;
      state.requests![id].bytes = bytes; save(); return true;
    };
    let timer: ReturnType<typeof setTimeout>;
    active += 1;
    const work = Promise.resolve().then(async () => {
      let snapshot: Awaited<ReturnType<typeof snapshotSkills>> | undefined; let transferring = false;
      try {
        let content: Buffer; let hash: string; let bytes: number; let basename: string | undefined; let skill = false; let mode = 0o644;
        if (named.kind === 'skill') {
          snapshot = await snapshotSkills({ engine, homeDir, configDir, codexHome, only: named.name, limits: { file: limits.file, total: limits.total, skill: Math.min(SKILL_LIMITS.skill, limits.total) } });
          if (!live()) return unavailable('this cloud run is ending');
          const primary = path.join(engine === 'codex' ? codexHome! : configDir, 'skills');
          const bundle = snapshot.bundles.find((b) => b.path === primary);
          if (!bundle) {
            const why = snapshot.skipped.map((s) => s.reason).join('; ');
            if (snapshot.skipped.some((s) => !s.status)) return unavailable(`the skill could not be read (${why})`);
            return { status: why ? (snapshot.skipped.some((s) => s.status === 'too_large') ? 'too_large' : 'denied') : 'not_found', message: why || 'That installed skill was not found or is disabled.' };
          }
          bytes = bundle.bytes; hash = bundle.hash; skill = true;
          if (!reserve(bytes)) return { status: 'too_large', message: 'This run has reached its resource byte limit.' };
          content = await run('tar', ['-czf', '-', '-C', bundle.dir, '.'], { encoding: null, env: { ...process.env, COPYFILE_DISABLE: '1' } }) as Buffer;
        } else {
          const real = await fs.promises.realpath(named.full!);
          if (!inside(real, await fs.promises.realpath(named.root!))) return { status: 'denied', message: 'symlink escape from the resource folder' };
          if ((await fs.promises.stat(real)).isDirectory()) {
            const { files, over } = filesInFolder(named.full!, { files: 300, bytes: Infinity, file: Infinity });
            return { status: 'folder', path: named.full, files: files.map((f) => ({ path: f.path, bytes: f.bytes })),
              message: `This is a folder. Ask for the files you need by these paths${over ? '; it holds more than the 300 listed' : ''}.` };
          }
          const file = await readPortableFile(named.full!, named.root!, limits.file, { allowHidden: false });
          if (!live()) return unavailable('this cloud run is ending');
          content = file.body; mode = file.mode; bytes = content.length; hash = digest(content); basename = path.basename(named.full!);
          if (!reserve(bytes)) return tooBig('This run has reached its resource byte limit');
        }
        if (!live()) return unavailable('this cloud run is ending');
        const at = path.posix.join('/tmp/agentbox-resources', digest(runId), digest(`${id}:${hash}`));
        const key = `${skill ? 'skills' : 'resource'}-${hash}.${skill ? 'tgz' : 'bin'}`;
        transferring = true;
        let url: string;
        try { url = await upload(key, content); } catch (err) { return unavailable(`the upload failed: ${(err as Error).message}`); }
        if (!live()) return unavailable('this cloud run is ending');
        const target = skill ? path.posix.join(at, 'skills', named.name!, 'SKILL.md') : path.posix.join(at, basename!);
        const file = skill
          ? { path: path.posix.join(at, `.skills-${hash}.tgz`), url, untar: path.posix.join(at, 'skills') }
          : { path: target, url, mode };
        const ok = await deliver([file], controller.signal);
        if (!live()) return unavailable('this cloud run is ending');
        if (!ok) return unavailable('the cloud machine did not take the delivery');
        return { status: 'delivered', path: target, bytes };
      } catch (caught) {
        const err = caught as FailedWith;
        if (!live()) return unavailable('this cloud run is ending');
        if (transferring) return unavailable(`the delivery failed: ${err.message}`);
        const status = ['ENOENT', 'ENOTDIR'].includes(err.code!) ? 'not_found' : err.status || (['EACCES', 'EPERM', 'ELOOP'].includes(err.code!) ? 'denied' : null);
        if (status === 'not_found') return { status, message: named.kind === 'file' ? `Nothing at ${named.full} on the computer.` : 'That resource was not found.' };
        if (status === 'too_large' && named.kind === 'file') return tooBig(err.message);
        return status ? { status, message: err.message } : unavailable(`the computer could not read it (${err.message})`);
      } finally { snapshot?.close(); active -= 1; }
    });
    const deadline = new Promise<ResourceAnswer>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(unavailable(closed || stopped() ? 'this cloud run is ending' : `no answer within ${Math.round(timeoutMs / 1000)} seconds`)), { once: true });
      timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref?.();
    });
    const promise = Promise.race([work, deadline]).then((answer) => {
      clearTimeout(timer);
      if (answer.status === 'unavailable') { controller.abort(); delete state.requests![id]; }
      else state.requests![id] = { status: answer.status, bytes: answer.status === 'delivered' ? answer.bytes! : 0, answer };
      save(); return answer;
    }).finally(() => { inFlight.delete(id); controllers.delete(controller); controller.abort(); });
    inFlight.set(id, promise);
    return promise;
  };
  request.close = () => { closed = true; for (const controller of controllers) controller.abort(); };
  return request;
}

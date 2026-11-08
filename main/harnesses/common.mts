import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { instructionsFor } from './instructions-file.mts';
import type { InstructionsContext, InstructionsAnswer } from './instructions-file.mts';
import type { OpenCodeProperties } from '../opencode.mts';
import type { ToolingResult } from '../account-tooling.mts';
import type { CodexFrame } from '../codex.mts';

export type Env = NodeJS.ProcessEnv;

export type BinKey = 'claudeBin' | 'codexBin' | 'opencodeBin';

export interface HarnessConfig extends Partial<Record<BinKey, string | null>> {
  home?: string;
  accountId?: string;
  storeRoot?: string;
  cloudPermission?: string | null;
}

export interface HarnessRun {
  print?: string;
  outputFormat?: { flag: string; value: string };
  stream?: readonly string[];
  effort?: string;
  system?: string;
  resume?: string;
  fork?: string;
  input?: readonly string[];
}

export interface HarnessCapabilities {
  nativeCommands: boolean;
  fork: boolean;
  nativeReview: boolean;
  remoteControl: boolean;
  inlineImages: boolean;
  claudeEffort: boolean;
  planLimits?: boolean;
}

export interface HarnessDefinition {
  id: string;
  label: string;
  word: string;
  binKey: string;
  homeEnv: string;
  accountPrefix: string;
  package: string;
  commandMenu: string;
  commandRoute: string;
  casks: readonly string[];
  installer: { shell: string; url: string; pipe: string };
  loginArgs: readonly string[];
  statusArgs: readonly string[];
  credentialFiles: readonly string[];
  scrubPatterns: readonly string[];
  minVersion?: string;
  run?: HarnessRun;
  instructions?: { file?: string; in?: string };
  capabilities: HarnessCapabilities;
  imageInstruction: string;
  admitted?: boolean;
}

export interface WorkerArgsOptions {
  prompt?: string;
  grants?: readonly string[];
  effort?: string | null;
  system?: string | null;
  resumeId?: string | null;
  fork?: boolean;
}

export interface UpdatePlanOptions {
  bin: string;
  real: string;
  home: string;
  channel?: string;
}

export interface UpdatePlanResult {
  name: string;
  file: string;
  args: string[];
  feed: string;
  format: string;
  env?: Env;
}

export type NativeUpdatePlan = (options: { bin: string; real: string; home: string; channel: string; name: string }) => Omit<UpdatePlanResult, 'env'> & { env?: Env } | null;

export interface SignInFilesWhere {
  folder?: string | null;
  home: string;
}

export interface HarnessCommand {
  file: string;
  args: string[];
}

export interface HarnessItem {
  id: string;
  product: string;
  [key: string]: unknown;
}

export interface HarnessPlan {
  args: string[];
  answerMode?: string | null;
  resumeId?: string | null;
}

export interface HarnessSpawnContext {
  cwd: string;
  item: HarnessItem;
  profile: string;
  env: Env;
  cloud?: boolean;
  host?: string | null;
}

export interface HarnessRecord {
  sessionId?: string | null;
  profile?: string | null;
  cwd?: string | null;
  cloud?: boolean;
  model?: string | null;
}

export interface HarnessSession {
  codexChange?: CodexFrame[];
  opencodeChange?: string[];
  [key: string]: unknown;
}

export interface HarnessSupervisor {
  config: HarnessConfig & { storeRoot: string };
  _profiles(): string[];
  _claudeConfigDir(profile: string | null | undefined): string;
  _cloudDocsEnv(item: HarnessItem): Env;
  _spawnCloudRelay(args: string[], options: { cwd: string; env: Env }): ChildProcess;
  memoryGateEnv(item: HarnessItem): Env;
  _runSpool(): string;
  _codexWorkspaceModel(): string | null;
  _codexProfileHome(profile?: string | null): string;
  _codexProfiles(): string[];
  _codexSignedIn(profile: string): boolean;
  _spawnCodexWorker(plan: HarnessPlan, context: HarnessSpawnContext): unknown;
  codexUsage(): unknown;
  _codexServer(home: string): { client: CodexClient; handshake: Promise<unknown> };
  _codexIsolation(client: CodexClient, handshake: Promise<unknown>): Promise<unknown[]>;
  settleCodexApproval(...args: unknown[]): unknown;
  codexCardChanged(...args: unknown[]): unknown;
  codexMemoryGateEnv(): Env;
  _releaseIdleCodex(profile: string): unknown;
  _openCodePassword?(): string | null;
  _openCodeApprovals?(item: HarnessItem): ((type: string, properties: OpenCodeProperties) => unknown) | null;
}

export interface CodexClient {
  request(method: string, params: unknown): Promise<unknown>;
}

export interface HarnessReaders {
  capture(...args: never[]): unknown;
  stream(...args: never[]): unknown;
  summarize(...args: never[]): unknown;
  trace(...args: never[]): unknown;
  activity(...args: never[]): unknown;
}

/** One operation of a harness as the registry hands it out: every name is a function, declined or absent ones refuse before doing anything. */
export interface Harness extends Omit<HarnessDefinition, 'instructions'> {
  discover(configured?: unknown, where?: unknown): HarnessBinaryFound;
  binary(config: HarnessConfig | null | undefined): string | null;
  workerArgs(options?: WorkerArgsOptions): string[];
  install(): HarnessCommand;
  signIn(bin: string): HarnessCommand;
  signInStatus(bin: string): HarnessCommand;
  signInFiles(where: SignInFilesWhere): string[];
  workerEnv(input?: Env): Env;
  launchEnv(bin: string | null | undefined, env: Env): Env;
  profileEnv(env: Env, profile: string, sup?: HarnessSupervisor): Env;
  profiles(sup: HarnessSupervisor): string[];
  signedIn(sup: HarnessSupervisor, profile: string): boolean;
  accountKey(profile: string | null | undefined): string;
  models(options?: unknown): unknown;
  defaultModel(options?: unknown): unknown;
  workspaceModel(sup: HarnessSupervisor): string | null;
  profileHome(sup: HarnessSupervisor, profile: string): string | null;
  effortLevels(model?: unknown, options?: unknown): unknown;
  usage(sup: HarnessSupervisor): unknown;
  spawn(sup: HarnessSupervisor, plan: HarnessPlan, context: HarnessSpawnContext): unknown;
  readers(): HarnessReaders;
  subscribe(child: unknown, session: HarnessSession, absorb: (...args: never[]) => unknown): void;
  attachInput(child: unknown): unknown;
  tooling(profile?: string): ToolingResult | null;
  transcript(sup: HarnessSupervisor, rec: HarnessRecord | null | undefined): unknown;
  change(session: HarnessSession, options?: unknown): unknown;
  release(sup: HarnessSupervisor, profile?: string): unknown;
  compact(sup: HarnessSupervisor, rec: HarnessRecord, cwd: string): Promise<unknown>;
  settleApproval(sup: HarnessSupervisor, ...args: unknown[]): unknown;
  approvalChanged(sup: HarnessSupervisor, ...args: unknown[]): unknown;
  memoryGate(sup: HarnessSupervisor, item?: HarnessItem): unknown;
  updatePlan(options: UpdatePlanOptions): UpdatePlanResult | null;
  smallModelArgs(prompt: string, model?: string | null): string[];
  updateSettings(options: { home: string }): UpdateSettings;
  runCommand(sup: HarnessSupervisor, options: Record<string, unknown>): Promise<unknown>;
  instructions(context: InstructionsContext): InstructionsAnswer;
  cloudLaunch(sup: HarnessSupervisor, plan: HarnessPlan, context: { item: HarnessItem; profile: string | null | undefined; env: Env }): { args: string[]; env: Env };
}

export interface HarnessBinaryFound {
  path: string | null;
  found?: boolean;
  certain?: boolean;
  from?: string;
  [key: string]: unknown;
}

export interface UpdateSettings {
  autoUpdatesChannel?: string;
  env?: Record<string, string | undefined>;
  [key: string]: unknown;
}

/**
 * THE COMMAND LINE THAT STARTS A WORKER, BUILT FROM THE DEFINITION'S `run`.
 *
 * Every flag name here used to be a literal in main/supervisor.mts, so the
 * supervisor knew one engine's CLI by heart and a second one of the same family
 * could not be added without editing it. The order is the order that shipped,
 * and `tests/a-second-stream-json-engine-is-only-a-definition` holds it there,
 * because flag order is the kind of thing a refactor silently rewrites.
 *
 * ABSENT MEANS CANNOT, not "default". An engine whose `run` has no `effort` is
 * handed no effort word even when the task names one, which is how a harness
 * says it lacks a capability without the call site asking who it is. `fork` is
 * the one pair: a fork is a fork OF something, so it needs a resume as well.
 */
export function workerArgsFrom(run: HarnessRun | null | undefined, { prompt, grants = [], effort = null, system = null, resumeId = null, fork = false }: WorkerArgsOptions = {}): string[] {
  if (!run) return [];
  const args: (string | undefined)[] = [];
  if (run.print) args.push(run.print, prompt);
  if (run.outputFormat) args.push(run.outputFormat.flag, run.outputFormat.value);
  if (run.stream) args.push(...run.stream);
  args.push(...grants);
  if (run.effort && effort) args.push(run.effort, effort);
  if (run.system && system) args.push(run.system, system);
  if (run.resume && resumeId) args.push(run.resume, resumeId);
  if (run.fork && fork && resumeId) args.push(run.fork);
  return args as string[];
}

export function definitionMethods(definition: HarnessDefinition) {
  const scrub = definition.scrubPatterns.map(pattern => new RegExp(pattern));
  return {
    ...definition,
    binary: (config: HarnessConfig | null | undefined) => config?.[definition.binKey as BinKey] ?? null,
    workerArgs: (options?: WorkerArgsOptions) => workerArgsFrom(definition.run, options),
    // WHERE THE PERSON'S STANDING INSTRUCTIONS GO on this engine. A flag for
    // the one that has one, a file named in the definition for the ones that
    // do not, and a refusal for an engine with neither — because that engine
    // would answer against rules it was never given, and nothing on screen
    // would say so.
    instructions: (context?: InstructionsContext) => instructionsFor(definition, context),
    launchEnv: (_bin: string | null | undefined, env: Env): Env => ({ ...env }),
    install: () => ({ file: definition.installer.shell, args: ['-c', `curl -fsSL ${definition.installer.url} | ${definition.installer.pipe}`] }),
    signIn: (bin: string): HarnessCommand => ({ file: bin, args: [...definition.loginArgs] }),
    signInStatus: (bin: string): HarnessCommand => ({ file: bin, args: [...definition.statusArgs] }),
    accountKey: (profile: string | null | undefined) => `${definition.accountPrefix}${profile}`,
    workerEnv(input: Env = process.env): Env {
      const env = { ...input };
      for (const key of Object.keys(env)) if (scrub.some(pattern => pattern.test(key))) delete env[key];
      return env;
    },
    signInFiles: ({ folder }: SignInFilesWhere) => folder ? definition.credentialFiles.map(file => path.join(folder, file)) : [],
  };
}

// Installation-specific work remains in each adapter. The common installers
// use the same prefix and cask checks for every registered tool.
export function commonUpdatePlan(definition: HarnessDefinition, { bin, real, home, channel = 'latest' }: UpdatePlanOptions, native?: NativeUpdatePlan): UpdatePlanResult | null {

  if (!path.isAbsolute(bin || '') || !real) return null;
  const name = definition.label;
  const brew = real.match(/^(\/opt\/homebrew|\/usr\/local)\/Caskroom\/([^/]+)\//);
  if (brew && definition.casks.includes(brew[2])) return {
    name, file: `${brew[1]}/bin/brew`, args: ['upgrade', '--cask', brew[2]],
    feed: `https://formulae.brew.sh/api/cask/${brew[2]}.json`, format: 'brew',
  };
  const tail = `/lib/node_modules/${definition.package}/`;
  const at = real.indexOf(tail);
  if (at > 0) {
    const prefix = real.slice(0, at);
    return { name, file: path.join(prefix, 'bin/npm'),
      args: ['install', '--global', '--prefix', prefix, `${definition.package}@${channel}`],
      env: { PATH: `${prefix}/bin:${process.env.PATH || ''}` },
      feed: `https://registry.npmjs.org/${definition.package}/${channel}`, format: 'npm' };
  }
  return native?.({ bin, real, home, channel, name }) ?? null;
}

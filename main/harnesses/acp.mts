// THE ADAPTER FOR ANY HARNESS DRIVEN OVER ACP.
//
// One of these per tool, made from its definition. What differs between tools
// is data (the binary, the arguments that switch ACP on, the sign-in command)
// plus one hook, `prepare`, for the two things no protocol carries: how this
// tool is made to ask before it acts, and where it reads standing instructions.
// docs/harnesses.md has what was settled and why.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createAcpWorker } from '../acp-worker.mts';
import type { AcpApproval, AcpMcpServer, AcpWorker } from '../acp-worker.mts';
import { captureAcpEvent, acpStreamingText, summarizeAcpEvent, traceAcpEvent, acpTookTheWords } from '../acp-readers.mts';
import type { AcpSession } from '../acp-readers.mts';
import { acpActivity } from '../agent-activity.mts';
import { definitionMethods, commonUpdatePlan } from './common.mts';
import type {
  BinKey, Env, HarnessApprovalCards, HarnessConfig, HarnessDefinition, HarnessPlan, HarnessRecord, HarnessSpawnContext,
  HarnessSupervisor, HarnessToolServer, SignInFilesWhere, UpdatePlanOptions,
} from './common.mts';

/** What a tool needs laid out before it starts: variables for its process, written into `dir`, which is this thread's and the app's. */
export type AcpPrepare = (context: { dir: string; cwd: string; instructions: string; mode: string | null }) => Env;

const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');
const toAcp = (name: string, server: HarnessToolServer): AcpMcpServer => ({
  name, command: server.command, args: server.args ?? [],
  env: Object.entries(server.env ?? {}).flatMap(([key, value]) => (value == null ? [] : [{ name: key, value: String(value) }])),
});

/**
 * A change as the one hunk a card draws: the lines that differ, with a few
 * either side. Enough to read what a yes allows; not a minimal diff.
 */
export function oneHunk(oldText: string, newText: string, context = 3): string {
  const lines = (s: string) => { const all = s.split('\n'); if (all.at(-1) === '') all.pop(); return all; };
  const a = lines(oldText);
  const b = lines(newText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const from = Math.max(0, start - context);
  const toA = Math.min(a.length, endA + context);
  const kept = (start - from) + (toA - endA);
  return [
    `@@ -${from + 1},${kept + (endA - start)} +${from + 1},${kept + (endB - start)} @@`,
    ...a.slice(from, start).map((l) => ` ${l}`),
    ...a.slice(start, endA).map((l) => `-${l}`),
    ...b.slice(start, endB).map((l) => `+${l}`),
    ...a.slice(endA, toA).map((l) => ` ${l}`),
  ].join('\n');
}

export function acpHarness(definition: HarnessDefinition, { prepare = null }: { prepare?: AcpPrepare | null } = {}) {
  const { acp } = definition;
  if (!acp) throw Error(`${definition.label} has no ACP command in its definition`);
  const home = (sup: HarnessSupervisor) => path.join(sup.userDir ?? sup.config.storeRoot, 'harnesses', definition.id);
  const recordFile = (sup: HarnessSupervisor, sessionId: string) => path.join(home(sup), 'conversations', `${safe(sessionId)}.jsonl`);

  return {
    ...definitionMethods(definition),
    discover: (config: HarnessConfig | null = {}) => config?.[definition.binKey as BinKey] ?? null,
    // The tool's own sign-in is asked when a run starts, and one that needs none runs without.
    signedIn: () => true,
    profiles: () => ['default'],
    profileHome: () => null,
    profileEnv: (env: Env) => env,
    accountKey: () => `${definition.accountPrefix}default`,
    signInFiles: ({ folder }: SignInFilesWhere) => (folder ? definition.credentialFiles.map((file: string) => path.join(folder, file)) : []),
    defaultModel: () => null,
    workspaceModel: () => null,
    tooling: () => null,
    release: () => {},
    memoryGate: () => ({}),
    updateSettings: () => ({}),
    updatePlan: (options: UpdatePlanOptions) => commonUpdatePlan(definition, options),
    // The person's standing instructions ride in the file `prepare` writes for the thread.
    instructions: () => ({ by: 'file' as const, file: null, written: false }),

    spawn(sup: HarnessSupervisor, plan: HarnessPlan, { cwd, item, env }: HarnessSpawnContext): AcpWorker {
      const dir = path.join(home(sup), 'threads', safe(item.id));
      fs.mkdirSync(dir, { recursive: true });
      const instructions = String(plan.system ?? '');
      const toolEnv = prepare ? prepare({ dir, cwd, instructions, mode: plan.answerMode ?? null }) : {};
      const store = sup._codexStoreServer(item);
      let cards: HarnessApprovalCards | null = null;
      const ask = (approval: AcpApproval) => {
        cards ??= sup.approvalCardsFor(item, (line) => worker.stderr.emit('data', line));
        if (approval.kind === 'command') return cards.command(approval.command, approval.cwd);
        if (approval.kind === 'tool') return cards.command(approval.title, null);
        return cards.edit(approval.changes.map((change) => (change.oldText === null
          ? { path: change.path, kind: 'add' as const, diff: change.newText }
          : { path: change.path, kind: 'update' as const, diff: oneHunk(change.oldText, change.newText) })));
      };
      const worker = createAcpWorker({
        start: () => spawn(sup.config[definition.binKey as BinKey]!, [...acp.args], {
          cwd, env: { ...env, ...toolEnv, ZERO_PRODUCT: item.product, ZERO_ITEM: item.id }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
        }),
        label: definition.label,
        cwd,
        // With no file for them, the instructions open a new conversation instead.
        prompt: !prepare && instructions && !plan.resumeId ? `${instructions}\n\n${plan.prompt ?? ''}` : String(plan.prompt ?? ''),
        resumeSessionId: plan.resumeId ?? null,
        mcpServers: [
          ...(store ? [toAcp(store.name ?? 'store', store)] : []),
          ...Object.entries(plan.connectionServers ?? {}).map(([name, server]) => toAcp(name, server)),
        ],
        model: plan.model || null,
        ask,
        recordFile: (sessionId) => recordFile(sup, sessionId),
        signIn: [acp.bin, ...definition.loginArgs].join(' '),
      });
      // A dead worker's card would stay first in the list and take the next answer.
      worker.once('exit', () => { cards?.close(); });
      return worker;
    },

    readers: () => ({ capture: captureAcpEvent, stream: acpStreamingText, summarize: summarizeAcpEvent, trace: traceAcpEvent, activity: acpActivity, took: acpTookTheWords }),
    subscribe(child: AcpWorker, _session: unknown, absorb: (method: string, params: unknown) => void): void {
      child.on('event', (method: string, params: unknown) => absorb(method, params));
    },
    // The app carries a conversation on only while its record is on disk, and ACP keeps none.
    transcript(sup: HarnessSupervisor, rec: HarnessRecord | null | undefined) {
      if (!rec?.sessionId) return null;
      const file = recordFile(sup, rec.sessionId);
      return fs.existsSync(file) ? file : null;
    },
    change: (session: AcpSession | null | undefined) => (session?.acpChange?.length ? { files: [...session.acpChange] } : null),
  };
}

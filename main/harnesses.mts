// One registry, no user-installed plugin execution or automatic enrollment.
// Optional reads report absence; unsupported actions fail before side effects.
import { claudeHarness } from './harnesses/claude.mts';
import { codexHarness } from './harnesses/codex.mts';
import { openCodeHarness } from './harnesses/opencode.mts';
import type { Harness, HarnessCapabilities } from './harnesses/common.mts';

type HarnessFunction = (...args: unknown[]) => unknown;

export interface HarnessAdapter {
  id: string;
  label: string;
  capabilities?: Partial<HarnessCapabilities>;
  available?: (name: string) => boolean;
  [operation: string]: unknown;
}

export const HARNESS_OPERATIONS = Object.freeze([
  'discover', 'binary', 'workerArgs', 'install', 'signIn', 'signInStatus', 'signInFiles',
  'workerEnv', 'launchEnv', 'profileEnv', 'profiles', 'signedIn', 'accountKey',
  'models', 'defaultModel', 'workspaceModel', 'profileHome', 'effortLevels', 'usage', 'spawn', 'readers',
  'subscribe', 'attachInput', 'tooling', 'transcript', 'change', 'release',
  'compact', 'settleApproval', 'approvalChanged', 'memoryGate', 'updatePlan',
  'smallModelArgs', 'updateSettings', 'runCommand', 'instructions',
]);
const OPTIONAL_READS = new Set(['usage', 'models', 'effortLevels']);
export function createHarnessRegistry(adapters: HarnessAdapter[]) {
  const entries = new Map<string, { adapter: HarnessAdapter; complete: Harness }>();
  for (const adapter of adapters) {
    if (!adapter || typeof adapter.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(adapter.id) || !adapter.label) throw Error('A harness needs an id and label.');
    if (entries.has(adapter.id)) throw Error(`Duplicate harness: ${adapter.id}`);
    for (const [name, value] of Object.entries(adapter.capabilities ?? {})) {
      if (typeof value !== 'boolean') throw Error(`${adapter.id}.${name} must be a boolean.`);
    }
    if (adapter.capabilities?.remoteControl && typeof adapter.attachInput !== 'function') throw Error(`${adapter.id}.remoteControl requires attachInput.`);
    if (adapter.available != null && typeof adapter.available !== 'function') throw Error(`${adapter.id}.available must be a function or absent.`);
    // WHAT IT CAN DO IS WHAT IT SAYS, NOT WHAT IT HAS A METHOD FOR. Having the
    // method was the whole truth while every adapter was written by hand for
    // one tool. One adapter serving several tools over a shared protocol
    // breaks it: it implements every operation for all of them, and what THIS
    // tool can do is what it negotiated when the session opened. So an adapter
    // may declare an operation unavailable, and a declined one is refused
    // exactly as a missing one is — before it does anything.
    const declines = (name: string) => adapter.available ? adapter.available(name) !== true : false;
    const complete: Record<string, HarnessFunction> = { ...adapter } as Record<string, HarnessFunction>;
    for (const name of HARNESS_OPERATIONS) {
      if (adapter[name] != null && typeof adapter[name] !== 'function') throw Error(`${adapter.id}.${name} must be a function or absent.`);
      const absent = (..._args: unknown[]) => {
        if (OPTIONAL_READS.has(name)) return { supported: false, engine: adapter.id, capability: name };
        throw Error(`${adapter.label} does not support ${name}.`);
      };
      const own = complete[name];
      complete[name] = own ? ((...args: unknown[]) => declines(name) ? absent(...args) : own(...args)) : absent;
    }
    entries.set(adapter.id, { adapter, complete: Object.freeze(complete) as unknown as Harness });
  }
  return Object.freeze({
    get(id = 'claude'): Harness {
      const entry = entries.get(id);
      if (!entry) throw Error(`Unknown coding agent: ${String(id)}`);
      return entry.complete;
    },
    supports(id: string, capability: string): boolean {
      const adapter = entries.get(id)?.adapter;
      if (typeof adapter?.[capability] !== 'function') return false;
      return adapter.available ? adapter.available(capability) === true : true;
    },
  });
}
// REGISTERED IS NOT OFFERED. OpenCode is here so anything that asks for it by
// name gets the real adapter, and it is deliberately absent from `ENGINES`
// (shared/engines.mjs) so no row can choose it and no picker draws it until
// that is turned on deliberately. The two decisions are separate on purpose.
const registry = createHarnessRegistry([claudeHarness, codexHarness, openCodeHarness]);
export const harnessFor = (id?: string): Harness => registry.get(id);
export const supportsHarnessOperation = (id: string, name: string) => registry.supports(id, name);


// One registry, no user-installed plugin execution or automatic enrollment.
// Optional reads report absence; unsupported actions fail before side effects.
import { claudeHarness } from './harnesses/claude.mjs';
import { codexHarness } from './harnesses/codex.mjs';

export const HARNESS_OPERATIONS = Object.freeze([
  'discover', 'binary', 'install', 'signIn', 'signInStatus', 'signInFiles',
  'workerEnv', 'profileEnv', 'profiles', 'signedIn', 'accountKey',
  'models', 'defaultModel', 'workspaceModel', 'profileHome', 'effortLevels', 'usage', 'spawn', 'readers',
  'subscribe', 'attachInput', 'tooling', 'transcript', 'change', 'release',
  'compact', 'settleApproval', 'approvalChanged', 'memoryGate', 'updatePlan',
  'smallModelArgs', 'updateSettings', 'runCommand',
]);
const OPTIONAL_READS = new Set(['usage', 'models', 'effortLevels']);
export function createHarnessRegistry(adapters) {
  const entries = new Map();
  for (const adapter of adapters) {
    if (!adapter || typeof adapter.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(adapter.id) || !adapter.label) throw Error('A harness needs an id and label.');
    if (entries.has(adapter.id)) throw Error(`Duplicate harness: ${adapter.id}`);
    for (const [name, value] of Object.entries(adapter.capabilities ?? {})) {
      if (typeof value !== 'boolean') throw Error(`${adapter.id}.${name} must be a boolean.`);
    }
    if (adapter.capabilities?.remoteControl && typeof adapter.attachInput !== 'function') throw Error(`${adapter.id}.remoteControl requires attachInput.`);
    const complete = { ...adapter };
    for (const name of HARNESS_OPERATIONS) {
      if (adapter[name] != null && typeof adapter[name] !== 'function') throw Error(`${adapter.id}.${name} must be a function or absent.`);
      complete[name] ??= (..._args) => {
        if (OPTIONAL_READS.has(name)) return { supported: false, engine: adapter.id, capability: name };
        throw Error(`${adapter.label} does not support ${name}.`);
      };
    }
    entries.set(adapter.id, { adapter, complete: Object.freeze(complete) });
  }
  return Object.freeze({
    get(id = 'claude') {
      const entry = entries.get(id);
      if (!entry) throw Error(`Unknown coding agent: ${String(id)}`);
      return entry.complete;
    },
    supports(id, capability) { return typeof entries.get(id)?.adapter[capability] === 'function'; },
  });
}
const registry = createHarnessRegistry([claudeHarness, codexHarness]);
export const harnessFor = id => registry.get(id);
export const supportsHarnessOperation = (id, name) => registry.supports(id, name);

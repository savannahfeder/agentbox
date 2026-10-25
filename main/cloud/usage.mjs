// WHAT THE CLOUD RUNS USED, KEPT ON THE MAC (tests/a-cloud-run-records-what-it-really-used).
//
// One line per run in ~/.agentbox/cloud-usage.jsonl, beside cloud.json: when,
// which row, which engine, and what the sandbox measured (cloud/sandbox/usage.mjs).
// The plan limits are set from these lines, so nothing here is estimated
// except the cost, and that says so in its name.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// AgentCore Runtime's published rates (us-east-1, 2026-10), per vCPU-hour of
// CPU actually used and per GB-hour of memory. Runtime v1, which this account
// runs; v2 is $0.1276 and $0.0169.
export const AGENTCORE_RATES = { vcpuHour: 0.0895, gbHour: 0.00945 };

export function cloudUsagePath({ home = os.homedir() } = {}) {
  return path.join(home || os.homedir(), '.agentbox', 'cloud-usage.jsonl');
}

export function appendCloudUsage({ runId, item, engine, exitCode, usage }, { home, now = Date.now } = {}) {
  const file = cloudUsagePath({ home });
  const line = {
    at: new Date(now()).toISOString(),
    runId: runId ?? null,
    item: item ?? null,
    engine: engine ?? null,
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
    wallSeconds: usage?.wallSeconds ?? null,
    cpuSeconds: usage?.cpuSeconds ?? null,
    peakMemoryBytes: usage?.peakMemoryBytes ?? null,
    source: usage?.source ?? null,
  };
  // Once per run: a homecoming retried after a failed import reads the same
  // done.json again.
  if (line.runId && readCloudUsage({ home }).some((l) => l.runId === line.runId)) return null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(line) + '\n');
  } catch { /* a record that cannot be written never fails the run */ }
  return line;
}

export function readCloudUsage({ home, file = cloudUsagePath({ home }) } = {}) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* one broken line loses only itself */ }
  }
  return out;
}

// Agent-hours since `since`, and the cost of the runs that measured
// themselves. Memory is billed on its high-water mark for the whole run, the
// way Runtime v1 bills it.
export function summarizeCloudUsage(lines, { since = 0 } = {}) {
  let runs = 0; let seconds = 0; let measured = 0; let cost = 0;
  for (const l of lines) {
    if (Date.parse(l.at) < since) continue;
    runs += 1;
    seconds += l.wallSeconds || 0;
    if (l.wallSeconds && l.cpuSeconds != null && l.peakMemoryBytes != null) {
      measured += l.wallSeconds;
      cost += (l.cpuSeconds / 3600) * AGENTCORE_RATES.vcpuHour
        + (l.peakMemoryBytes / 1024 ** 3) * (l.wallSeconds / 3600) * AGENTCORE_RATES.gbHour;
    }
  }
  return {
    runs,
    agentHours: Math.round((seconds / 3600) * 100) / 100,
    measuredHours: Math.round((measured / 3600) * 100) / 100,
    estimatedCost: cost,
    costPerAgentHour: measured ? cost / (measured / 3600) : null,
  };
}

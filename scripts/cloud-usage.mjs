#!/usr/bin/env node
// What the cloud runs on this Mac have used, from ~/.agentbox/cloud-usage.jsonl
// (main/cloud/usage.mjs): agent-hours, the estimated AWS cost, and the cost per
// agent-hour the plan limits are set from.
//   node scripts/cloud-usage.mjs            this month
//   node scripts/cloud-usage.mjs --days 7   the last seven days
import { readCloudUsage, summarizeCloudUsage } from '../main/cloud/usage.mjs';

const i = process.argv.indexOf('--days');
const days = i > 0 ? Number(process.argv[i + 1]) : null;
const now = new Date();
const since = days ? now.getTime() - days * 86_400_000 : new Date(now.getFullYear(), now.getMonth(), 1).getTime();
const lines = readCloudUsage();
const s = summarizeCloudUsage(lines, { since });
const gb = (b) => (b == null ? '—' : `${(b / 1024 ** 3).toFixed(1)} GB`);

console.log(days ? `Last ${days} days` : 'This month');
console.log(`  runs:               ${s.runs}`);
console.log(`  agent-hours:        ${s.agentHours}`);
console.log(`  measured hours:     ${s.measuredHours}`);
console.log(`  estimated cost:     $${s.estimatedCost.toFixed(2)}`);
console.log(`  per agent-hour:     ${s.costPerAgentHour == null ? '—' : `$${s.costPerAgentHour.toFixed(3)}`}`);
const recent = lines.filter((l) => Date.parse(l.at) >= since).slice(-10);
if (recent.length) {
  console.log('\nLatest runs:');
  for (const l of recent) console.log(`  ${l.at.slice(0, 16)}  ${String(l.item ?? '').padEnd(14)} ${String(l.engine ?? '').padEnd(6)} ${String(Math.round((l.wallSeconds ?? 0) / 60)).padStart(4)} min  cpu ${l.cpuSeconds ?? '—'} s  peak ${gb(l.peakMemoryBytes)}`);
}

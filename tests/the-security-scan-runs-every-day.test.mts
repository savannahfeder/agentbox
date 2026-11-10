// The security scan ran on its own only on Mondays. A new advisory against a
// package the app already ships could sit unseen for six days whenever nobody
// shipped. Measured by reading the schedule in .github/workflows/security.yml:
// one cron, '17 6 * * 1'.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync(path.join(import.meta.dirname, '..', '.github', 'workflows', 'security.yml'), 'utf8');
const crons = [...workflow.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);

describe('the security scan runs every day', () => {
  it('has a schedule', () => {
    expect(crons.length).toBeGreaterThan(0);
  });

  it('runs on every day of the week, not one weekday', () => {
    const everyDay = crons.some((c) => {
      const [, , dom, month, dow] = c.trim().split(/\s+/);
      return dom === '*' && month === '*' && (dow === '*' || dow === '0-6');
    });
    expect(everyDay, `schedule is ${crons.join(', ')}`).toBe(true);
  });

  it('still runs on every push to main and every pull request', () => {
    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
    expect(workflow).toMatch(/\n\s*pull_request:\s*\n/);
  });
});

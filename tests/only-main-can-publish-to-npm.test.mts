// Daily security review, 2026-11-24. npm's trusted publishing trusts a
// workflow by its file name, and the publish job's "only main" checks live in
// that same file, so a branch carrying an edited copy would pass npm's check
// once trusted publishing is on. A GitHub environment limited to main is held
// outside the file: the job names one, as the phone app's publish job does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/publish-npm.yml'), 'utf8');
const job = workflow.slice(workflow.indexOf('\n  publish:'));

describe('publishing to npm', () => {
  it('runs in the environment only main may use', () => {
    expect(job).toMatch(/\n {4}environment: agentbox-npm-publisher\n/);
  });

  it('is the only job that can ask for npm\'s token', () => {
    expect(workflow.match(/id-token: write/g)).toHaveLength(1);
    expect(workflow.match(/\n {2}[a-z-]+:\n {4}(if|runs-on|environment)/g)).toHaveLength(1);
  });
});

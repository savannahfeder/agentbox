// A STAND-IN HANDS BACK A FILE THE TASK NAMES.
//
// Testing notes beside a page (w-d18e699928) needed threads that hand over
// a page, and the stand-in agent only did that when the task carried the
// secret [[stub:file:...]], which no tester would type. A real agent asked to
// "tighten pricing-page.html" answers with that page. Now the stand-in does
// too, when the file is in the project's documents.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = path.join(root, 'scripts', 'lib', 'stub-claude-worker.mjs');

function answer(task) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hands-back-'));
  const docs = path.join(dir, 'docs');
  fs.mkdirSync(path.join(docs, 'designs', 'w-1'), { recursive: true });
  fs.writeFileSync(path.join(docs, 'designs', 'w-1', 'pricing-page.html'), '<p>Pricing</p>');
  fs.writeFileSync(path.join(docs, 'plan.md'), '# Plan');
  const plan = path.join(dir, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ say: 'answered' }));
  const env = { ...process.env, STUB_CLAUDE_PLAN: plan };
  delete env.CLAUDE_CONFIG_DIR;
  const prompt = `# Your work item\n\nProduct: Sandbox (slug: sandbox)\nProduct docs live in: ${docs}\n\nWork item id: w-1\nTitle: ${task}\n`;
  const child = spawn(process.execPath, [STUB, '-p', prompt], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGTERM'), 8000);
    child.on('exit', () => {
      clearTimeout(timer);
      const result = out.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((f) => f?.type === 'result');
      resolve(result?.result ?? '');
    });
  });
}

describe('a stand-in hands back a file the task names', () => {
  it('a page in the documents, by its name alone, as its path there', async () => {
    expect(await answer('Tighten the copy on pricing-page.html')).toMatch(/\n\ndesigns\/w-1\/pricing-page\.html\n?$/);
  });
  it('by its path too, and more than one', async () => {
    const said = await answer('Check designs/w-1/pricing-page.html against plan.md');
    expect(said).toContain('\ndesigns/w-1/pricing-page.html');
    expect(said).toContain('\nplan.md');
  });
  it('not a file the documents do not hold', async () => {
    expect(await answer('Write onboarding.html from scratch')).not.toContain('onboarding.html');
  });
});

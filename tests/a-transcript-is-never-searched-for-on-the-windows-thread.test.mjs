// A TRANSCRIPT IS NEVER SEARCHED FOR ON THE WINDOW'S THREAD.
//
// What broke (2026-10-19): with the cloud on she still got the spinning wheel.
// A ten-minute CPU profile of the running app had one 1,419 ms stretch with
// no idle in it, all of it in `transcriptPath` (main/agents.mjs): a session
// whose transcript was not where Claude Code's slug rule puts it was looked
// for through every folder in ~/.claude/projects (10,429 of them), one
// `existsSync` each. A cloud run's transcript is in the cloud, so every cloud
// session missed, and a miss was only remembered for a minute.
//
// Now the search runs in the background, a later call finds what it found,
// and a session found nowhere is not searched for again for ten minutes.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const homes = [];
afterEach(() => { vi.restoreAllMocks(); while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true }); });

function aHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-search-'));
  homes.push(home);
  for (let i = 0; i < 50; i += 1) fs.mkdirSync(path.join(home, '.claude', 'projects', `-p${i}`), { recursive: true });
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  return home;
}
const projects = (home) => path.join(home, '.claude', 'projects');
const line = JSON.stringify({ type: 'ai-title', aiTitle: 'Found where it was not expected', sessionId: 'x' });

describe('a session whose transcript is not where the slug rule puts it', () => {
  it('is not searched for on the thread that asked', async () => {
    const home = aHome();
    const agents = await import('../main/agents.mjs');
    const listed = vi.spyOn(fs, 'readdirSync');
    const checked = vi.spyOn(fs, 'existsSync');
    agents.__readHistory('s-elsewhere-1', '/somewhere/else');
    const looks = listed.mock.calls.filter(([d]) => String(d) === projects(home)).length;
    const perFolder = checked.mock.calls.filter(([p]) => String(p).startsWith(projects(home) + path.sep + '-p')).length;
    expect(looks).toBe(0);
    expect(perFolder).toBe(0);
    await agents.__transcriptSearch();
  });

  it('is found by a later call once the search has run', async () => {
    const home = aHome();
    fs.writeFileSync(path.join(projects(home), '-p37', 's-elsewhere-2.jsonl'), `${line}\n`);
    const agents = await import('../main/agents.mjs');
    expect(agents.__readHistory('s-elsewhere-2', '/somewhere/else').about).toBe('');
    await agents.__transcriptSearch();
    expect(agents.__readHistory('s-elsewhere-2', '/somewhere/else').about).toBe('Found where it was not expected');
  });

  it('found nowhere, is not searched for again for ten minutes', async () => {
    const home = aHome();
    const agents = await import('../main/agents.mjs');
    const listed = vi.spyOn(fs.promises, 'readdir');
    agents.__readHistory('s-nowhere', '/somewhere/else');
    await agents.__transcriptSearch();
    for (let i = 0; i < 5; i += 1) agents.__readHistory('s-nowhere', '/somewhere/else');
    await agents.__transcriptSearch();
    expect(listed.mock.calls.filter(([d]) => String(d) === projects(home)).length).toBe(1);
  });

  it('where the slug rule puts it, is read straight away', async () => {
    const home = aHome();
    const cwd = '/work/here';
    const dir = path.join(projects(home), cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 's-direct.jsonl'), `${line}\n`);
    const agents = await import('../main/agents.mjs');
    expect(agents.__readHistory('s-direct', cwd).about).toBe('Found where it was not expected');
  });
});

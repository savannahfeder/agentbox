// AN AGENT ATTACHES FILES TO A MESSAGE AS A PERSON DOES.
//
// Agents said: "I have no upload or attach tool", "The message tool cannot attach a
// file", "I can't attach it from here, so please share that path". One agent
// copied a film into a hidden designs folder by hand so the app would draw it.
// Measured: team_tell and team_task took words only, and the app sent every
// agent message with an empty file list.
//
// Now both take `files`, paths in the thread's own folders, and those files are
// saved and carried exactly as a person's attachment is. What must not go: a
// path outside those folders, a hidden or secret-looking one, a folder, a file
// over the 1 GB a message can send, and a message whose file has gone.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamTell, teamTask } from '../mcp/core/reach.mjs';
import { REACH_LABEL, UNDO_HOLD_MS } from '../shared/teammate-reach.mjs';
import { isTaskRow } from '../shared/team-rules.mjs';
import { resolveArtifact } from '../main/artifact-path.mjs';

let t; let run;

const askRows = () => t.rows(t.maya).filter((i) => (i.labels ?? []).includes(REACH_LABEL));
const tap = (row, words) => t.maya.on(() => t.maya.store.answerItem(row.product, row.id, { answer: words }));
const convo = (copy) => t.conversationsOf(copy).filter((i) => !isTaskRow(i));
const tasks = (copy) => t.conversationsOf(copy).filter((i) => isTaskRow(i));
const put = (dir, rel, bytes = 'x') => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
};
const opened = async (copy, row, src) => {
  const r = await resolveArtifact({ src, product: row.product, products: copy.store.listProducts() });
  return r.ok ? fs.readFileSync(r.path, 'utf8') : null;
};
const links = (text) => [...String(text).matchAll(/\]\((attachments\/[^)]+)\)/g)].map((m) => m[1]);

beforeEach(async () => {
  t = await aTeamWithAgents();
  run = t.maya.store.composeItem(t.product.id, { title: 'Cut 3', body: 'Make cut 3 and send it to Dev.' });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
  // Maya has said yes to her agents writing to Dev.
  teamTell({ text: 'Dev, hello.', to: ['Dev'] });
  await t.tick();
  await tap(askRows()[0], '1. Send it, and let it write to Dev Patel from now on');
  await t.tick();
});
afterEach(() => t.stop());

describe('what goes', () => {
  it('a file in the thread\'s project reaches the person and opens for them', async () => {
    put(t.product.dir, 'designs/launch-cut-v3.mp4', 'film-v3');
    const out = teamTell({ text: 'Dev, cut 3 is attached.', to: ['Dev'], files: ['designs/launch-cut-v3.mp4'] });
    expect(out.files).toEqual(['launch-cut-v3.mp4']);
    await t.tickPastUndo();
    await t.dev.service.syncNow();
    const row = convo(t.dev)[0];
    const [link] = links(row.answer);
    expect(link).toMatch(/launch-cut-v3\.mp4$/);
    expect(await opened(t.dev, row, link)).toBe('film-v3');
    expect(await opened(t.maya, convo(t.maya)[0], link)).toBe('film-v3');
  });

  it('a file named by its whole path, and a message that is only files', async () => {
    const file = put(t.product.dir, 'reports/notes.md', '# Notes\n');
    teamTell({ to: ['Dev'], files: [file] });
    await t.tickPastUndo();
    await t.dev.service.syncNow();
    const row = convo(t.dev)[0];
    expect(await opened(t.dev, row, links(row.answer)[0])).toBe('# Notes\n');
  });

  it('a file in the run\'s own checkout', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    const meta = path.join(t.product.dir, 'project.json');
    fs.writeFileSync(meta, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, 'utf8')), repoPath: repo }));
    put(path.join(repo, '.claude', 'worktrees', run.id), 'shots/cancel-dialog-v2.png', 'png');
    teamTell({ text: 'Dev, the new dialog.', to: ['Dev'], files: ['shots/cancel-dialog-v2.png'] });
    await t.tickPastUndo();
    await t.dev.service.syncNow();
    const row = convo(t.dev)[0];
    expect(await opened(t.dev, row, links(row.answer)[0])).toBe('png');
  });

  it('a task carries its files too', async () => {
    put(t.product.dir, 'designs/deck.pdf', 'deck');
    const out = teamTask({ to: 'Dev', title: 'Check the deck', details: 'Slide 3 needs the real number.', files: ['designs/deck.pdf'] });
    expect(out.held).toBe(false);
    await t.tickPastUndo();
    await t.dev.service.syncNow();
    const row = tasks(t.dev)[0];
    expect(await opened(t.dev, row, links(row.body)[0])).toBe('deck');
  });

  it('shows the files to the owner when it has to ask first', async () => {
    put(t.product.dir, 'designs/still.png', 'p');
    const out = teamTell({ text: 'Sofia, a still.', to: ['Sofia'], files: ['designs/still.png'] });
    expect(out.held).toBe(true);
    await t.tick();
    const ask = askRows().find((r) => r.status !== 'done');
    expect(ask.result).toContain(`](${path.join(fs.realpathSync(t.product.dir), 'designs', 'still.png')})`);
  });
});

describe('what does not go', () => {
  const refused = (files, more = {}) => {
    try { teamTell({ text: 'Dev, see this.', to: ['Dev'], files, ...more }); } catch (err) { return err.message; }
    return null;
  };

  it('a file outside the thread\'s folders, saying where to put it', () => {
    const outside = put(fs.mkdtempSync(path.join(os.tmpdir(), 'cut3-')), 'launch-cut-v3.mp4');
    expect(refused([outside])).toMatch(/outside the folders this thread can send from.*copy it into/i);
  });

  it('a path that climbs out of them', () => {
    put(path.dirname(t.product.dir), 'other/secret-plan.md');
    expect(refused(['../other/secret-plan.md'])).toMatch(/outside/);
  });

  it('a hidden or secret-looking file', () => {
    put(t.product.dir, '.private/plan.md');
    put(t.product.dir, 'keys/api-key.md');
    expect(refused(['.private/plan.md'])).toMatch(/hidden/);
    expect(refused(['keys/api-key.md'])).toMatch(/secret/);
  });

  it('a file that is not there, or a folder', () => {
    fs.mkdirSync(path.join(t.product.dir, 'designs'), { recursive: true });
    expect(refused(['designs/nothing.mp4'])).toMatch(/not there/);
    expect(refused(['designs'])).toMatch(/folder/);
  });

  it('a file over 1 GB', () => {
    const big = put(t.product.dir, 'designs/raw.mov');
    fs.truncateSync(big, 1024 * 1024 * 1024 + 1);
    expect(refused(['designs/raw.mov'])).toMatch(/1 GB.*over the 1 GB/);
  });

  it('leaves nothing in the outbox when it refuses', async () => {
    refused(['designs/nothing.mp4']);
    await t.tick();
    await t.dev.service.syncNow();
    expect(convo(t.dev)[0].answer ?? '').not.toContain('see this');
  });

  it('a message whose file has gone before it went, and the agent is told', async () => {
    const file = put(t.product.dir, 'designs/gone.png');
    teamTell({ text: 'Dev, the gone one.', to: ['Dev'], files: ['designs/gone.png'] });
    fs.rmSync(file);
    const now = Date.now();
    await t.tick(now);
    for (let i = 0; i < 3; i += 1) await t.tick(now + UNDO_HOLD_MS + i);
    await t.dev.service.syncNow();
    expect(JSON.stringify(convo(t.dev))).not.toContain('the gone one');
    expect(t.told.at(-1).id).toBe(run.id);
    expect(t.told.at(-1).text).toMatch(/gone\.png.*not sent/i);
  });
});

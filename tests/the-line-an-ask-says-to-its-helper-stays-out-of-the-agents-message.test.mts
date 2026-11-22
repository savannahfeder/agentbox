// The line an ask says only to the person asked ("Say whether it looks good or what to change.") is in the task's
// body, and Hand to an agent copied it into the agent's first message, so the last thing the agent read was to give a verdict.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createTeamService } from '../main/team/index.mts';
import { memorySession } from '../main/team/session.mts';
import { askBody, withoutAskLead } from '../shared/thread-asks.mts';
import { sentWords } from '../shared/thread-link.mts';
import { taskHandOff } from '../renderer/src/threads/composer-rules';

const LINK = 'https://app.agentbox.ac/t/priya/w-0123456789';
const CHANGE = '[Payment-copy-change-by-Priya.change](attachments/ab-Payment-copy-change-by-Priya.change)';
const stored = (kind: 'help' | 'review', note = 'Is the declined copy friendly enough?') =>
  `${sentWords('Payment copy', LINK, askBody({ kind, owner: 'Priya', helper: 'Theo', note }))}\n\n${CHANGE}`;

describe('the ask\'s words without the helper\'s line', () => {
  it('drop the review line and keep the note, the link and the files', () => {
    expect(withoutAskLead(stored('review'))).toBe(`[Payment copy](${LINK})\n\nIs the declined copy friendly enough?\n\n${CHANGE}`);
  });
  it('drop the help line, with or without the helper\'s name', () => {
    expect(withoutAskLead(stored('help'))).toBe(`[Payment copy](${LINK})\n\nIs the declined copy friendly enough?\n\n${CHANGE}`);
    expect(withoutAskLead(askBody({ kind: 'help', owner: 'Priya', note: 'Which one?' }))).toBe('Which one?');
  });
  it('keep a note that only says the same words inside a sentence', () => {
    const note = 'Please say whether it looks good or what to change. Thanks.';
    expect(withoutAskLead(stored('review', note))).toContain(note);
  });
  it('leave a body with no such line as it was', () => {
    expect(withoutAskLead('Rotate the staging keys.')).toBe('Rotate the staging keys.');
  });
  it('leave what the person asked seeing it as it is stored', () => {
    expect(stored('review')).toContain('Say whether it looks good or what to change.');
  });
});

describe('Hand to an agent on an ask', () => {
  it('opens the card without the helper\'s line, as the task\'s own words', () => {
    const body = withoutAskLead(stored('review').replace(`\n\n${CHANGE}`, ''));
    const s = taskHandOff({ from: 'Priya', brief: { title: 'Payment copy', body, files: [] }, message: { text: body, by: 'priya' }, nameOf: () => 'Priya' });
    expect(s.body).not.toContain('Say whether it looks good');
    expect(s.named).toBe('Payment copy');
  });
  it('is wired to take the line out of the message pressed, as the brief has it', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('if (message?.text && askOf(item)) message = { ...message, text: withoutAskLead(message.text) };');
  });
});

async function aMac(cloud: ReturnType<typeof createMemoryCloud>, personId: string) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-lead-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(path.join(accountRoot, 'web'), { recursive: true });
  fs.writeFileSync(path.join(accountRoot, 'web', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'web', name: 'Web app', seenBy: 'team' }));
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({ session: memorySession(() => memoryBackend(cloud, personId)), store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
  return { personId, store, service };
}

describe('the brief of an ask the helper hands to an agent', () => {
  let cloud: ReturnType<typeof createMemoryCloud>, priya: Awaited<ReturnType<typeof aMac>>, theo: Awaited<ReturnType<typeof aMac>>;
  beforeEach(async () => {
    disk._internals.forgetFolds();
    cloud = createMemoryCloud();
    priya = await aMac(cloud, signUpMemory(cloud, { email: 'priya@nw.test', name: 'Priya Shah' }));
    theo = await aMac(cloud, signUpMemory(cloud, { email: 'theo@nw.test', name: 'Theo Okafor' }));
    await priya.service.signIn();
    await priya.service.createTeam('Northwind');
    await priya.service.invite('theo@nw.test');
    await theo.service.signIn();
    await theo.service.acceptInvite(priya.service.state().team.id);
    disk.setLineAuthor(priya.personId);
  });
  afterEach(async () => { disk.setLineAuthor(null); await priya.service.signOut(); await theo.service.signOut(); });

  for (const kind of ['review', 'help'] as const) {
    it(`leaves the helper's line out on an ask for ${kind}, and the task still says it`, async () => {
      const t = priya.store.composeItem('web', { title: 'Friendlier payment failed copy', body: 'Rewrite the declined copy.' });
      await priya.service.askTeammate({ product: 'web', id: t.id, to: theo.personId, kind, note: 'Can a declined card leave a hold?' });
      for (let k = 0; k < 2; k += 1) { await priya.service.syncNow(); await theo.service.syncNow(); }
      const task = theo.store.listItems().find((i) => i.ask)!;
      const lead = kind === 'review' ? 'Say whether it looks good or what to change.' : "Theo, write to Priya's agent on Priya's thread. A reply here goes to Priya.";
      expect(task.body).toContain(lead);
      const brief = theo.service.taskBrief(task.product, task.id);
      expect(brief.body).not.toContain(lead);
      expect(brief.body).toContain('Can a declined card leave a hold?');
    });
  }
});

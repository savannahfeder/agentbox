// A SHARED ROW RUNS ON ONE MAC: ITS RUNNER'S. NEVER ON EVERYONE'S.
//
// The day a project is shared, every teammate's supervisor can see its rows.
// Every one of them is open, founder-labelled work, which is exactly what a
// supervisor spawns a worker on. Without this rule a row Maya wrote would run
// on Maya's Mac and Theo's Mac and every Mac on the team at once, in each of
// their own copies of the code, each writing its own answer back.
//
// The runner is the person whose Mac may run agents on a row: the one who
// started it, unless it was handed on (`runner`). A row a person has to do
// (`assignee` is a person) runs on nobody's Mac until they hand it back to the
// agents. A private project is untouched by all of this.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runnerOf, mayRunHere } from '../shared/team-rules.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const MAYA = 'p-maya';
const THEO = 'p-theo';
const shared = { slug: 'website', team: { projectId: 'x', sharedBy: MAYA } };
const mine = { slug: 'home', team: null };

describe('who runs a shared row', () => {
  it('is whoever started it', () => {
    expect(runnerOf({ createdBy: THEO }, shared)).toBe(THEO);
  });
  it('is whoever it was handed to, over who started it', () => {
    expect(runnerOf({ createdBy: MAYA, runner: THEO }, shared)).toBe(THEO);
  });
  it('is the person who shared the project, for a row from before anyone signed in', () => {
    expect(runnerOf({ createdBy: null }, shared)).toBe(MAYA);
  });
});

describe('may it run on this Mac', () => {
  it('runs a private project\'s rows exactly as before, signed in or not', () => {
    expect(mayRunHere({ createdBy: null }, mine, null)).toBe(true);
    expect(mayRunHere({ createdBy: MAYA }, mine, THEO)).toBe(true);
  });
  it('runs a shared row on its runner\'s Mac only', () => {
    expect(mayRunHere({ createdBy: MAYA }, shared, MAYA)).toBe(true);
    expect(mayRunHere({ createdBy: MAYA }, shared, THEO)).toBe(false);
  });
  it('runs nothing shared on a Mac nobody is signed in on', () => {
    expect(mayRunHere({ createdBy: MAYA }, shared, null)).toBe(false);
  });
  it('runs nothing a person has been given, until they give it to the agents', () => {
    expect(mayRunHere({ createdBy: THEO, assignee: THEO }, shared, THEO)).toBe(false);
    expect(mayRunHere({ createdBy: MAYA, assignee: 'agent', runner: THEO }, shared, THEO)).toBe(true);
  });
});

describe('the store server a worker talks through', () => {
  // An MCP server starts with only the variables it is handed, so a worker's
  // rows in a shared project would otherwise be written as nobody's.
  const serverEnv = () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'team-mcp-env-'));
    const sup = new Supervisor({ storeRoot: tmp, storeMcpCommand: '/bin/echo' }, { listItems: () => [], listProducts: () => [] }, tmp);
    return Object.values(sup.mcpServers() ?? {}).find((s) => s.env?.STORE_ACCOUNT_ID !== undefined || 'STORE_ACCOUNT_ID' in (s.env ?? {}))?.env ?? {};
  };

  it('is told who is signed in', () => {
    const before = process.env.AGENTBOX_PERSON_ID;
    process.env.AGENTBOX_PERSON_ID = THEO;
    try { expect(serverEnv().AGENTBOX_PERSON_ID).toBe(THEO); } finally {
      if (before === undefined) delete process.env.AGENTBOX_PERSON_ID; else process.env.AGENTBOX_PERSON_ID = before;
    }
  });

  it('is told nothing when nobody is', () => {
    const before = process.env.AGENTBOX_PERSON_ID;
    delete process.env.AGENTBOX_PERSON_ID;
    try { expect('AGENTBOX_PERSON_ID' in serverEnv()).toBe(false); } finally {
      if (before !== undefined) process.env.AGENTBOX_PERSON_ID = before;
    }
  });
});

describe('the supervisor on Theo\'s Mac', () => {
  function supervisorWith(items, products) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'team-runner-'));
    const sup = new Supervisor({ storeRoot: tmp, maxConcurrentSessions: 5 }, {
      listItems: () => items,
      listProducts: () => products.map((p) => ({ ...p, name: p.slug, dir: tmp })),
      isDue: () => true,
    }, tmp);
    sup.spawned = [];
    sup.spawnWorker = (item) => sup.spawned.push(item.id);
    sup.serveRepeats = async () => {};
    return sup;
  }
  const row = (id, product, extra) => ({ id, product, status: 'open', kind: 'directive', labels: ['founder'], title: id, createdAt: 1, updatedAt: 1, ...extra });

  it('starts his own shared rows and his private rows, and leaves Maya\'s alone', async () => {
    const before = process.env.AGENTBOX_PERSON_ID;
    process.env.AGENTBOX_PERSON_ID = THEO;
    try {
      const sup = supervisorWith([
        row('w-000001', 'website', { createdBy: MAYA }),
        row('w-000002', 'website', { createdBy: THEO }),
        row('w-000003', 'website', { createdBy: THEO, assignee: THEO }),
        row('w-000004', 'home', { createdBy: null }),
        row('w-000005', 'website', { createdBy: MAYA, answer: 'Change the ending', answeredThrough: 0 }),
      ], [shared, mine]);
      await sup.tick();
      expect(sup.spawned.sort()).toEqual(['w-000002', 'w-000004']);
    } finally {
      if (before === undefined) delete process.env.AGENTBOX_PERSON_ID; else process.env.AGENTBOX_PERSON_ID = before;
    }
  });
  // Found 2026-09-30: a task one teammate handed to another read "Queued" on the
  // receiver's inbox row, a promise that an agent was about to start it.
  // Nothing runs a row a person holds, so nothing may say it is waiting its turn.
  it('says nothing is queued that will not run here', () => {
    const before = process.env.AGENTBOX_PERSON_ID;
    process.env.AGENTBOX_PERSON_ID = THEO;
    try {
      const sup = supervisorWith([
        row('w-000001', 'website', { createdBy: MAYA }),
        row('w-000002', 'website', { createdBy: THEO }),
        row('w-000003', 'website', { createdBy: MAYA, assignee: THEO }),
        row('w-000004', 'home', { createdBy: null }),
      ], [shared, mine]);
      expect(sup.status().queued.sort()).toEqual(['w-000002', 'w-000004']);
    } finally {
      if (before === undefined) delete process.env.AGENTBOX_PERSON_ID; else process.env.AGENTBOX_PERSON_ID = before;
    }
  });
});

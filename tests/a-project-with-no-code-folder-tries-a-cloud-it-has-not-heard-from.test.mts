// A PROJECT WITH NO CODE FOLDER TRIES A CLOUD IT HAS NOT HEARD FROM.
//
// A tester paid for the cloud, turned it on with Everything, and every thread
// still ran on their Mac: the cloud panel said 0 agent hours. The project was
// research with no code repository. Such a project goes to the cloud only once
// the cloud image has said it takes one ('plain' in its caps), and the image
// says that only in its answer to a cloud run's start. A Mac whose projects all
// lack a repository never starts one, so it never heard, so it never sent one.
// Measured with the supervisor's own placement on a fresh cloud record: 'local'.
//
// Now a cloud this Mac has never heard from is tried. An image that cannot take
// one refuses the start ('bad-start'), that answer is written down, and the
// reply runs again on the Mac (tests/a-project-with-no-code-folder-runs-in-the-cloud).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { imageCaps, imageCapsToTry, noteImageCaps } from '../main/cloud/config.mts';

const savedConfigEnv = process.env.AGENTBOX_CLOUD_CONFIG;
let tmp; let docs; let notes; let cloudConfig; let env;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudunheard-')));
  docs = path.join(tmp, 'store', 'accounts', 'acct', 'research');
  fs.mkdirSync(docs, { recursive: true });
  notes = { slug: 'research', repoPath: null, dir: docs };
  const cfg = path.join(tmp, 'cloud.json');
  cloudConfig = { gateway: 'https://cloud.example' };
  fs.writeFileSync(cfg, JSON.stringify(cloudConfig));
  process.env.AGENTBOX_CLOUD_CONFIG = cfg;
  env = { ...process.env };
});
afterEach(() => {
  if (savedConfigEnv === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = savedConfigEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const build = () => {
  const sup = new Supervisor(
    { home: '/nonexistent-home-with-no-second-account', storeRoot: path.join(tmp, 'state'), maxConcurrentSessions: 2, authProfiles: ['default'], cloudRuns: 'all', maxCloudSessions: 10 },
    { listItems: () => [], listProducts: () => [notes], isDue: () => true, settleAnswer() {}, readItem: () => null },
    path.join(tmp, 'app'), path.join(tmp, 'app'), path.join(tmp, 'user'),
  );
  sup._bringCloudHome = () => {};
  sup._hasCloudSignIn = () => true;
  sup._cloudSignedInAtAll = () => true;
  return sup;
};
const row = { id: 'w-1', product: 'research', status: 'open', labels: ['founder'] };
const where = (sup) => sup._whereToRun({ item: row, product: notes, cwd: docs, engine: 'claude' });

describe('a thread of a project with no code folder, with Everything on', () => {
  it('goes to a cloud this Mac has never started a run on', () => {
    const sup = build();
    expect(sup._cloudEligible(row)).toBe(true);
    expect(where(sup)).toBe('cloud');
  });

  it('goes to a cloud whose image said it takes one', () => {
    noteImageCaps(cloudConfig, ['offline', 'plain'], env);
    expect(where(build())).toBe('cloud');
  });

  it('stays on this Mac once the image has said it does not, even with nothing else to say', () => {
    noteImageCaps(cloudConfig, [], env);
    const sup = build();
    expect(sup._cloudEligible(row)).toBe(false);
    expect(where(sup)).toBe('local');
  });

  it('what another cloud said is not what this one said', () => {
    noteImageCaps({ gateway: 'https://another.example' }, [], env);
    expect(where(build())).toBe('cloud');
  });
});

describe('a cloud image that turns one down', () => {
  const refused = { cloud: true, tail: ['stderr: agentbox cloud: this cloud image cannot take a project with no repository yet; rebuild it (node scripts/cloud-setup.mjs)'] };

  it('is not the cloud failing, however many are turned down at once', () => {
    const sup = build();
    for (let i = 0; i < 4; i++) sup._noteCloudOutcome({ ...refused }, 75);
    expect(sup._cloudHealth?.faults ?? 0).toBe(0);
    expect(sup._cloudHealth?.restUntil ?? 0).toBe(0);
  });

  it('while a start that failed some other way still counts', () => {
    const sup = build();
    sup._noteCloudOutcome({ cloud: true, tail: ['stderr: agentbox cloud: the cloud run could not start: server'] }, 1);
    expect(sup._cloudHealth.faults).toBe(1);
  });

  it('is believed by the next placement, not a minute later', () => {
    const sup = build();
    expect(sup._cloudTakesPlain()).toBe(true);
    noteImageCaps(cloudConfig, [], env);
    expect(sup._cloudTakesPlain()).toBe(true);
    sup._noteCloudOutcome({ ...refused }, 75);
    expect(sup._cloudTakesPlain()).toBe(false);
  });

  it('and a run that ended any other way leaves the reading alone', () => {
    const sup = build();
    expect(sup._cloudTakesPlain()).toBe(true);
    noteImageCaps(cloudConfig, [], env);
    sup._noteCloudOutcome({ cloud: true, sessionId: 's', tail: [] }, 0);
    expect(sup._cloudTakesPlain()).toBe(true);
  });
});

describe('what a cloud run is sent with', () => {
  it('a cloud never heard from is tried with no repository, and nothing else is assumed', () => {
    expect(imageCaps(cloudConfig, env)).toEqual([]);
    expect(imageCapsToTry(cloudConfig, env)).toEqual(['plain']);
  });

  it('a cloud that has answered is taken at its word', () => {
    noteImageCaps(cloudConfig, ['base', 'offline'], env);
    expect(imageCapsToTry(cloudConfig, env)).toEqual(['base', 'offline']);
    noteImageCaps(cloudConfig, [], env);
    expect(imageCapsToTry(cloudConfig, env)).toEqual([]);
  });

  it('the run is started with what to try, not only what was heard', () => {
    const cli = fs.readFileSync(new URL('../main/cloud/run-cli.mts', import.meta.url), 'utf8');
    expect(cli).toMatch(/imageCaps: imageCapsToTry\(config\)/);
  });
});

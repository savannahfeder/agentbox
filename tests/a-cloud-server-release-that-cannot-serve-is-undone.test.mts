// A CLOUD SERVER RELEASE THAT CANNOT SERVE IS UNDONE, AND ONE THAT ERRORS EMAILS.
//
// On 2026-11-04 a deploy put up a cloud server Lambda could not start (its
// bundle was named index.mts), and it answered 502 to everyone for more than
// two days. The deploy uploaded the code and stopped there, and no alarm
// watched the server's own errors. Now the deploy asks the new server one
// question anyone may ask (GET /v1/terms), and puts the one before it back when
// it cannot answer; and two alarms email when the server keeps erroring.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { whyNotServing, updateOrRollBack, settingsOf, serverDownAlarms, CHECK_EVENT, GATEWAY_FUNCTION } from '../scripts/cloud-gateway-setup.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

describe("the new server's answer", () => {
  it('serves when it answers 200', () => {
    expect(whyNotServing({ payload: JSON.stringify({ statusCode: 200, body: '{"terms":"2026-10"}' }) })).toBeNull();
  });

  it('does not when it failed to run, as a bundle Lambda cannot load does', () => {
    const payload = JSON.stringify({ errorType: 'Runtime.ImportModuleError', errorMessage: "Cannot find module 'index'" });
    expect(whyNotServing({ functionError: 'Unhandled', payload })).toMatch(/failed to run \(Unhandled\).*ImportModuleError/);
  });

  it('does not when it answers a 5xx, a 4xx, or something that is not JSON', () => {
    expect(whyNotServing({ payload: JSON.stringify({ statusCode: 502, body: 'x' }) })).toMatch(/answered 502/);
    expect(whyNotServing({ payload: JSON.stringify({ statusCode: 401, body: 'x' }) })).toMatch(/answered 401/);
    expect(whyNotServing({ payload: 'Internal Server Error' })).toMatch(/not JSON/);
  });

  it('is asked a question the server answers before anyone signs in', () => {
    const gateway = read('../cloud/gateway/gateway.mjs');
    expect(CHECK_EVENT.requestContext.http.method).toBe('GET');
    expect(gateway.indexOf(`path === '${CHECK_EVENT.rawPath}'`)).toBeGreaterThan(-1);
    expect(gateway.indexOf(`path === '${CHECK_EVENT.rawPath}'`)).toBeLessThan(gateway.indexOf('await personOf(headers)'));
  });
});

describe('putting a new server live', () => {
  function run({ updateFails = false, answers = [null], rollBackFails = false } = {}) {
    const did = [];
    const asked = [...answers];
    const p = updateOrRollBack({
      update: async () => { did.push('update'); if (updateFails) throw new Error('settings refused'); },
      check: async () => { did.push('check'); return asked.length ? asked.shift() : null; },
      rollBack: async () => { did.push('rollBack'); if (rollBackFails) throw new Error('no access'); },
    });
    return { did, p };
  }

  it('leaves a new server that answers live', async () => {
    const { did, p } = run();
    await expect(p).resolves.toBeUndefined();
    expect(did).toEqual(['update', 'check']);
  });

  it('puts the old one back when the new one cannot serve, and says the old one answers', async () => {
    const { did, p } = run({ answers: ['it answered 502: x', null] });
    await expect(p).rejects.toThrow(/cannot serve \(it answered 502: x\), so the one before it was put back and answers/);
    expect(did).toEqual(['update', 'check', 'rollBack', 'check']);
  });

  it('puts the old one back when the update itself fails partway', async () => {
    const { did, p } = run({ updateFails: true });
    await expect(p).rejects.toThrow(/settings refused.*put back/);
    expect(did).toEqual(['update', 'rollBack', 'check']);
  });

  it('says so when the old one does not answer either', async () => {
    const { p } = run({ answers: ['it answered 502: x', 'it answered 502: y'] });
    await expect(p).rejects.toThrow(/does not answer either \(it answered 502: y\)/);
  });

  it('says both when putting the old one back fails', async () => {
    const { p } = run({ answers: ['it answered 502: x'], rollBackFails: true });
    await expect(p).rejects.toThrow(/cannot serve \(it answered 502: x\), and putting the old one back failed too: no access/);
  });

  it("puts back the old server's own settings", () => {
    const conf = { Role: 'arn:role', Runtime: 'nodejs22.x', Handler: 'index.handler', Timeout: 90, MemorySize: 512, Environment: { Variables: { REGION: 'us-east-1' } } };
    expect(settingsOf(conf)).toEqual(['--role', 'arn:role', '--runtime', 'nodejs22.x', '--handler', 'index.handler', '--timeout', '90', '--memory-size', '512', '--environment', '{"Variables":{"REGION":"us-east-1"}}']);
  });

  it('is how the deploy updates a server that exists, keeping a copy of the running code first', () => {
    const setup = read('../scripts/cloud-gateway-setup.mjs');
    expect(setup).toMatch(/await updateOrRollBack\(\{/);
    expect(setup.indexOf("'get-function', '--function-name'")).toBeLessThan(setup.indexOf('await updateOrRollBack({'));
    expect(setup).toMatch(/rollBack: \(\) => put\(before, settingsOf\(existing\)\)/);
  });
});

describe('the alarms on the server erroring', () => {
  const alarms = serverDownAlarms({ topicArn: 'arn:topic' });

  it("watch Lambda's own counts of failed calls and 5xx answers, on this function", () => {
    expect(alarms.map((a) => a.metric).sort()).toEqual(['Errors', 'Url5xxCount']);
    for (const a of alarms) {
      expect(a.namespace).toBe('AWS/Lambda');
      expect(a.dimensions).toEqual([`Name=FunctionName,Value=${GATEWAY_FUNCTION}`]);
      expect(a.actions).toEqual(['arn:topic']);
    }
  });

  it('need two bad periods running, so one bad minute sends nothing', () => {
    for (const a of alarms) expect(a.evaluationPeriods).toBe(2);
  });

  it('are set by the deploy, emailing when they start and when they clear', () => {
    const setup = read('../scripts/cloud-gateway-setup.mjs');
    expect(setup).toMatch(/for \(const a of serverDownAlarms\(\{ topicArn: alarmTopic \}\)\)/);
    expect(setup).toMatch(/'--ok-actions', \.\.\.a\.actions/);
  });
});

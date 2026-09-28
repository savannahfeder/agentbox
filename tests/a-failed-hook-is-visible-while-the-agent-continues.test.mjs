// Native Claude 2.1.270 emitted one SessionStart hook_response error with
// HOOK-WARNING-824, while PowerUp recorded zero copies. Hook failures must reach
// both the live tail and saved conversation without changing the task result.
import { expect, it } from 'vitest';
import { readersFor } from '../main/supervisor.mjs';
import { traceLines } from '../renderer/src/terminal.ts';
const readers = readersFor('claude');
const failure = { type: 'system', subtype: 'hook_response', hook_name: 'SessionStart:resume', hook_event: 'SessionStart', exit_code: 1, outcome: 'error', stderr: 'HOOK-WARNING-824: startup failed.', output: 'HOOK-WARNING-824: startup failed.' };
it('keeps a nonblocking hook failure in both existing output surfaces', () => {
  const line = JSON.stringify(failure);
  expect(readers.summarize(line)).toContain('SessionStart:resume');
  expect(readers.trace(line)).toContain('HOOK-WARNING-824');
  const session = {};
  readers.capture(session, line);
  expect(session.resultIsError).toBeUndefined();
  expect(session.result).toBeUndefined();
});
it('keeps the diagnostic in the conversation parser', () => {
  const text = readers.trace(JSON.stringify(failure));
  expect(traceLines({ startedAt: Date.now(), text, lines: text?.split('\n') ?? [] }).map(x=>x.text).join('\n')).toContain('HOOK-WARNING-824');
});
it.each([
  { ...failure, outcome:'success', exit_code:0 },
  { ...failure, subtype:'hook_started' },
  { ...failure, type:'assistant', subtype:'hook_response' },
])('does not turn successful or unrelated events into failures', event => {
  expect(readers.trace(JSON.stringify(event))).toBeNull();
  expect(readers.summarize(JSON.stringify(event))).toBeNull();
});
it('names an empty-output failure and marks truncated diagnostics', () => {
  expect(readers.trace(JSON.stringify({...failure, stderr:'',output:''}))).toContain('failed (exit 1)');
  expect(readers.trace(JSON.stringify({...failure,output:'x'.repeat(6000)}))).toContain('characters omitted');
});

it('also shows failures from native Claude transcript attachments in personal chats', async () => {
  const fs = await import('node:fs');
  const os = (await import('node:os')).default;
  const path = await import('node:path');
  const { conversation } = await import('../main/agents.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-conversation-'));
  const id = '82400000-0000-4000-8000-000000000001';
  const cwd = '/tmp/hook-fixture';
  const dir = path.join(home, '.claude/projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive:true });
  fs.writeFileSync(path.join(dir, id+'.jsonl'), [
    {type:'attachment', timestamp:new Date().toISOString(), attachment:{type:'hook_non_blocking_error',hookName:'SessionStart:resume',stderr:'HOOK-WARNING-824',exitCode:1}},
    {type:'attachment', timestamp:new Date().toISOString(), attachment:{type:'instructions',content:'not a hook failure'}},
    {type:'assistant', timestamp:new Date().toISOString(),message:{role:'assistant',content:[{type:'text',text:'Normal successful answer'}]}}
  ].map(x=>JSON.stringify(x)).join('\n'));
  const original = os.homedir;
  os.homedir = () => home;
  try {
    const result = await conversation({sessionId:id,cwd});
    expect(result.turns.map(x=>x.text).join('\n')).toContain('HOOK-WARNING-824');
    expect(result.turns.map(x=>x.text).join('\n')).toContain('Normal successful answer');
    expect(result.turns.map(x=>x.text).join('\n')).not.toContain('not a hook failure');
  } finally { os.homedir=original; fs.rmSync(home,{recursive:true,force:true}); }
});

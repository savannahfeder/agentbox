import { spawn } from 'node:child_process';
import { attachClaudeInput } from './claude-input.mjs';

// No user message is submitted. The CLI owns authentication and the provider request.
export function runClaudeUsage(bin, args, opts, done) {
  let child, timer, killTimer, finished = false, bytes = 0;
  const finish = (error, report = '') => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (child?.exitCode == null && child?.pid) {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
      killTimer.unref();
    }
    done(error, report);
  };
  try {
    child = attachClaudeInput(spawn(bin, args, { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'ignore'] }));
    child.holdInput(true);
    child.once('error', error => finish(error));
    child.once('exit', () => {
      clearTimeout(killTimer);
      finish(Error('Claude Code closed before reporting usage.'));
    });
    child.stdout.on('data', data => {
      bytes += data.length;
      if (bytes > opts.maxBuffer) finish(Error('Claude Code sent too much usage output.'));
    });
    timer = setTimeout(() => finish(Error('Claude Code did not report usage in time.')), opts.timeout);
    void (async () => {
      try {
        await child.control({ subtype: 'initialize' }, opts.timeout);
        const report = await child.control({ subtype: 'get_usage', skip_behaviors: true }, opts.timeout);
        finish(null, JSON.stringify(report));
      } catch (error) { finish(error); }
    })();
  } catch (error) { finish(error); }
  return child;
}

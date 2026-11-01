// Claude emits hook failures separately from the result. A nonblocking hook
// can fail while the model succeeds, so keep its diagnostic without changing
// delivery/retry state. Successful hooks stay quiet.
export function hookFailure(obj) {
  if (obj?.type === 'attachment' && obj.attachment?.type === 'hook_non_blocking_error') {
    const a = obj.attachment;
    obj = { type: 'system', subtype: 'hook_response', outcome: 'error',
      hook_name: a.hookName, hook_event: a.hookEvent, exit_code: a.exitCode,
      stderr: a.stderr, stdout: a.stdout };
  }
  if (obj?.type !== 'system' || obj.subtype !== 'hook_response') return null;
  const exitCode = Number.isInteger(obj.exit_code) ? obj.exit_code : null;
  if (obj.outcome !== 'error' && !(exitCode !== null && exitCode !== 0)) return null;
  const name = [obj.hook_name, obj.hook_event].find(v => typeof v === 'string' && v.trim()) ?? 'unnamed';
  const detail = [obj.output, obj.stderr, obj.stdout].find(v => typeof v === 'string' && v.trim()) ?? '';
  const cap = 4000;
  const body = detail.length > cap
    ? `${detail.slice(0, cap)}\n[${detail.length - cap} characters omitted]`
    : detail.trim();
  return `Hook ${name} failed${exitCode !== null ? ` (exit ${exitCode})` : ''}.${body ? `\n${body}` : ''}`;
}


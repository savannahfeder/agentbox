import readline from 'node:readline';

const seen = [];
readline.createInterface({ input: process.stdin }).on('line', line => {
  const event = JSON.parse(line);
  seen.push(event);
  if (process.env.USAGE_PROBE_MODE === 'timeout') return;
  if (process.env.USAGE_PROBE_MODE === 'exit') process.exit(1);
  const request = event.request;
  const denied = process.env.USAGE_PROBE_MODE === 'unsupported' && request.subtype === 'get_usage';
  const response = request.subtype === 'initialize' ? {} : {
    rate_limits_available: true,
    rate_limits: { five_hour: { utilization: 12, resets_at: null } },
    requests: seen,
  };
  process.stdout.write(JSON.stringify({ type: 'control_response', response: {
    subtype: denied ? 'error' : 'success', request_id: event.request_id,
    ...(denied ? { error: 'get_usage is not supported' } : { response }),
  } }) + '\n');
});

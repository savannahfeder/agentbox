// THE LINE A CLOUD RUN PRINTS ONCE THE CLOUD HAS ACCEPTED ITS START
// (main/cloud/run.mjs), with how long this Mac took to pack and send it and
// the cloud took to take it. From then on the run holds nothing on this Mac,
// so it stops counting against the starts allowed at once
// (Supervisor#_cloudStarting). Not `agentbox cloud:`, which is what a run
// says about why it failed (Supervisor#_noteCloudOutcome).
export const CLOUD_SENT = 'agentbox cloud-sent:';

export function sentLine({ packMs, startMs }) {
  return `${CLOUD_SENT} packed ${Math.round(packMs)} started ${Math.round(startMs)}\n`;
}

/** `{ packMs, startMs }` from any text holding the line, else null. */
export function readSent(text) {
  const m = new RegExp(`${CLOUD_SENT} packed (\\d+) started (\\d+)`).exec(String(text ?? ''));
  return m ? { packMs: Number(m[1]), startMs: Number(m[2]) } : null;
}

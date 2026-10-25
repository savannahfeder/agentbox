// THE LINE A CLOUD RUN ENDS ON WHEN ITS REQUEST NEEDS THIS COMPUTER. The cloud
// run is told to write it (main/cloud/run.mjs CLOUD_NOTE); the supervisor reads
// it and moves the thread here (Supervisor#_noteCloudHandBack). No leading
// bracket: a trace line that starts with one is read as a tool call.
export const HAND_BACK = 'AGENTBOX-NEEDS-THE-COMPUTER:';

/** Whether a reply hands its thread back: the marked line, at a line's start. */
export function handsBack(result) {
  return String(result ?? '').split('\n').some((line) => line.trimStart().startsWith(HAND_BACK));
}

/** What the run said it was missing, cut to fit a card; null when it said nothing. */
export function handBackWhat(result, max = 90) {
  const line = String(result ?? '').split('\n').map((l) => l.trimStart()).find((l) => l.startsWith(HAND_BACK));
  const what = line?.slice(HAND_BACK.length).trim().replace(/[.\s]+$/, '') ?? '';
  if (!what) return null;
  if (what.length <= max) return what;
  const cut = what.lastIndexOf(' ', max);
  return `${what.slice(0, cut > 0 ? cut : max)}…`;
}

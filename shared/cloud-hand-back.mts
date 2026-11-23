// THE LINE A CLOUD RUN ENDS ON WHEN ITS REQUEST NEEDS THIS COMPUTER. The cloud
// run is told to write it (main/cloud/run.mts CLOUD_NOTE); the supervisor reads
// it and moves the thread here (Supervisor#_noteCloudHandBack). No leading
// bracket: a trace line that starts with one is read as a tool call.
export const HAND_BACK = 'AGENTBOX-NEEDS-THE-COMPUTER:';

// A run's last message opens in bold and names code in backticks, and a run
// told to end on this one line writes it that way.
const DRESSING = /^\s*(?:>\s*)?[*_`]*/;

/** What follows `marker` on a line that opens with it, or null on any other line. */
function saidAfter(line: string, marker: string): string | null {
  const opened = DRESSING.exec(line)![0];
  if (!line.startsWith(marker, opened.length)) return null;
  const said = line.slice(opened.length + marker.length);
  return /[*_`]/.test(opened) ? said.replace(/[*_`\s]+$/, '') : said;
}

const linesOf = (result: string | null | undefined) => String(result ?? '').split('\n');

/** Whether a reply hands its thread back: the marked line, at a line's start. */
export function handsBack(result: string | null | undefined): boolean {
  return linesOf(result).some((line) => saidAfter(line, HAND_BACK) !== null);
}

/** A reply without its marked line, for drawing: that line is the app's to read. */
export function withoutHandBack(result: string): string {
  if (!handsBack(result)) return result;
  return result.split('\n').filter((line) => saidAfter(line, HAND_BACK) === null).join('\n').trim();
}

// THE OTHER WAY:a run on this computer whose request needs the cloud
// (Supervisor#_noteSentToCloud). Told only where the cloud could take it.
export const SEND_TO_CLOUD = 'AGENTBOX-NEEDS-THE-CLOUD:';

export function asksForCloud(result: string | null | undefined): boolean {
  return linesOf(result).some((line) => saidAfter(line, SEND_TO_CLOUD) !== null);
}

/** What the run said it was missing, cut to fit a card; null when it said nothing. */
export function handBackWhat(result: string | null | undefined, max = 90): string | null {
  const said = linesOf(result).map((l) => saidAfter(l, HAND_BACK)).find((s) => s !== null);
  const what = said?.trim().replace(/[.\s]+$/, '') ?? '';
  if (!what) return null;
  if (what.length <= max) return what;
  const cut = what.lastIndexOf(' ', max);
  return `${what.slice(0, cut > 0 ? cut : max)}…`;
}

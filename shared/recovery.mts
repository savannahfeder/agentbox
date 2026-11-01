// What the app says after it has swept up a night's stranded work.
//
// The two numbers mean different things and must never blur:
//   resumed — sessions handed back their own context. Nothing for her to do.
//   waiting — rows whose session is gone. Her rule was that these wait for her
//             rather than being restarted, so the line has to say where they
//             are, which is the palette command that already exists.
//
// Slots are not mentioned. A row that only ran out of capacity resumes itself
// on the next tick, and a toast that lasts 2.5 seconds has no room for a
// number that will be wrong before she has finished reading it.

export function recoveryToast(r) {
  if (!r) return null;
  const resumed = Number(r.resumed) || 0;
  const waiting = Number(r.waiting) || 0;
  if (!resumed && !waiting) return null;
  const agents = (n) => (n === 1 ? '1 agent' : `${n} agents`);
  if (!waiting) {
    return `${agents(resumed)} picked up where ${resumed === 1 ? 'it' : 'they'} left off`;
  }
  if (!resumed) {
    return `${agents(waiting)} could not be resumed · waiting for you in ⌘K`;
  }
  return `${agents(resumed)} resumed · ${waiting} waiting for you in ⌘K`;
}

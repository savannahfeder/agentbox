// The gauge and the reset time a model chip carries while its agent is out of
// usage, in Home's box and in a thread's reply box.

import { outOfUsageWhen } from '../compose-says';

const Gauge = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.6-4.2"/></svg>;

export function OutUntil({ out, drop }: { out: { tool: string; until: number } | null | undefined; drop?: number }) {
  const when = outOfUsageWhen(out);
  if (!when) return null;
  return (
    <span className="tc-out">
      <Gauge />
      <span className="tc-out-when" data-drop={drop}>{when}</span>
    </span>
  );
}

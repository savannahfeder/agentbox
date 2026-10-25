// Going invisible (round 23): it says what happens before it happens, and for
// how long.
import { I } from './icons';
import { minutesToMidnight } from './room-rules';

export type Invisible = { on: boolean; onGo: (minutes: number | null) => void; onComeBack: () => void };

export function GoInvisible({ now, onGo }: { now: number; onGo: (minutes: number | null) => void }) {
  return <div className="rm-ipop rm-pop" role="menu" aria-label="Go invisible">
    <div className="t">{I.ghost()}Go invisible</div>
    <ul>
      <li>{I.eyeOff()}Your card leaves every room</li>
      <li>{I.lock()}Nobody sees your threads, status or level</li>
      <li>{I.chat()}You can still read every room</li>
    </ul>
    <div className="rule" />
    <button type="button" role="menuitem" className="when" onClick={() => onGo(60)}>For an hour</button>
    <button type="button" role="menuitem" className="when" onClick={() => onGo(minutesToMidnight(now))}>Until tomorrow</button>
    <button type="button" role="menuitem" className="when" onClick={() => onGo(null)}>Until I turn it off</button>
  </div>;
}

export const GhostIcon = () => I.ghost();
export const EyeOffSmall = () => I.eyeOff(12);

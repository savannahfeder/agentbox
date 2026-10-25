// The line over a group anyone can join: what strangers there see of you, with
// the way out beside it. Answered once per group on this Mac.
import type { RoomProfile } from '../../types';
import { I } from './icons';
import { openGroupWords } from './room-rules';

export function OpenGroupNotice({ me, onLeave, onHide, onOk }: {
  me: Pick<RoomProfile, 'show_working' | 'show_level' | 'show_agents'>;
  onLeave: () => void; onHide: () => void; onOk: () => void;
}) {
  return <div className="rm-notice gr-notice" role="status">{I.eye()}<span className="t">{openGroupWords(me)}</span>
    {me.show_working === 'everyone' && <button type="button" className="rm-btn" onClick={onHide}>Hide my threads</button>}
    <button type="button" className="rm-btn" onClick={onLeave}>Leave group</button>
    <button type="button" className="rm-btn" onClick={onOk}>OK</button>
  </div>;
}

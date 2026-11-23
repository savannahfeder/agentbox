// THE TEAM PAGE BEFORE THERE IS A TEAM (w-d19fcb9309, approved team-1): your
// face, two open seats and one button. A team is Pro's (w-61142123a4), so the
// button starts Pro, which makes the team and opens Stripe, as the setup's plan page does.
import { Face } from './people';
import { AskForMultiplayer, NOT_LET_IN } from './ask-for-multiplayer';
import { StartPro } from './StartPro';
import type { Person } from '../types';
import '../threads/thread-composer.css';
import './start-team.css';

const plus = <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>;

export function StartTeam({ me, multiplayer, onStarted, left = false, title = 'Bring your team in' }: { me: Person | null; multiplayer?: boolean | null; onStarted?: () => void;
  /** In Settings › Team's column, lined up with the page's other rows. */
  left?: boolean;
  title?: string }) {
  const letIn = multiplayer !== false;
  return (
    <div className={`st-empty${left ? ' st-left' : ''}`}>
      <div className="st-seats">
        <Face person={me} me size={40} />
        <span className="st-seat" aria-hidden="true">{plus}</span>
        <span className="st-seat" aria-hidden="true">{plus}</span>
      </div>
      <h2 className="td-title st-title">{letIn ? title : NOT_LET_IN}</h2>
      {letIn
        ? <StartPro hasTeam={false} name={me?.name} className="th-new st-start" onStarted={onStarted} />
        : <AskForMultiplayer email={me?.email} className="th-new st-start" />}
    </div>
  );
}

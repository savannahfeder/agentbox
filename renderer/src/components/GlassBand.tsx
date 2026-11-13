import { chord } from '../this-keyboard';

/** The top band of the glass window (workspace-navigation.css): Home and Inbox, then Search and New thread. */
export function GlassBand({ homeHere, inboxHere, inboxCount, onHome, onInbox, onSearch, onCompose }: {
  homeHere: boolean;
  inboxHere: boolean;
  inboxCount: number;
  onHome?: () => void;
  onInbox: () => void;
  onSearch: () => void;
  onCompose: () => void;
}) {
  return (
    <nav className="glass-band" aria-label="Places" data-here={homeHere ? 'home' : inboxHere ? 'inbox' : undefined}>
      {onHome && <button type="button" className={homeHere ? 'on' : undefined} onClick={onHome}>Home</button>}
      <button type="button" className={inboxHere ? 'on' : undefined} onClick={onInbox}>
        Inbox{inboxCount > 0 && <span className="gb-count">{inboxCount}</span>}
      </button>
      <span className="gb-tools">
        <button type="button" className="gb-search" onClick={onSearch}>Search<small>{chord('⌘K')}</small></button>
        <button type="button" className="gb-new" onClick={onCompose} title={`New thread (N)`}>New thread</button>
      </span>
    </nav>
  );
}

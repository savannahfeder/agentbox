// YOUR ACCOUNT MENU, opening upward from your own row at the foot of the
// sidebar (w-a09476712f, 2026-10-04).
//
// Asked as "How do i log out of my account? I tried clicking my profile area
// ... expecting a sign out or somthing and nothing." Three menus were drawn
// and the full account menu was picked: "I think the account menu is really
// good". It also takes the status line out of the corner: "I wasn't a fan of
// the 'Say what you're up to' line being visible in the bottom-left corner at
// all times ... better to just show the email as we had before." So the row
// is your name and email again, and the status is one row in here, a little
// less discoverable on purpose, because it was the lower-priority feature.
import { useEffect, useRef, useState } from 'react';
import type { Person } from '../types';
import { Face } from './people';
import { STATUS_PROMPT, StatusComposer, saying } from './status';
import { holdsUntil } from '../../../shared/team-status.mjs';
import { SettingsIcon } from '../components/SettingsIcon';

const InviteIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20c.7-3.4 3.3-5.3 6.5-5.3 1.4 0 2.6.3 3.7.9"/><path d="M18 14v6M15 17h6"/></svg>;
const SignOutIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h4.5v16H14M10 8l-4 4 4 4M6 12h10"/></svg>;
/** A small smiley, picked over a dot, a clock and a pencil (2026-10-04). */
const StatusIcon = () => <svg className="th-acct-smile" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M8.8 14c.8 1.1 1.9 1.7 3.2 1.7s2.4-.6 3.2-1.7"/><path d="M9.5 10h.01M14.5 10h.01" strokeWidth="2"/></svg>;

export function AccountMenu({ me, now, collapsed, onAccount, onInvite, onSettings, onSignOut }: {
  me: Person; now: number; collapsed: boolean;
  /** The header: your name and email, opening Settings -> Team. */
  onAccount?: () => void;
  onInvite?: () => void; onSettings?: () => void; onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The menu, or the box you write a status in, which takes the menu's place.
  const [writing, setWriting] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); setWriting(false); };

  // A press anywhere else, or Escape, puts it away. Escape is heard on the way
  // UP, so a menu inside this one (when a status ends) can take its own
  // Escape first and close only itself.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key); };
  }, [open]);

  const go = (fn?: () => void) => fn && (() => { close(); fn(); });

  return <div className="th-me-wrap" ref={wrap}>
    <button type="button" className="th-me-btn" aria-label="Your account" aria-haspopup="menu" aria-expanded={open}
      title={collapsed ? 'Your account' : undefined} onClick={() => (open ? close() : setOpen(true))}>
      <Face person={me} me /><span>{me.name || me.email}<small>{me.email}</small></span>
    </button>
    {open && (writing
      ? <div className="th-me-pop">
          <StatusComposer person={me} now={now} onDone={close} />
        </div>
      : <AccountMenuList me={me} now={now} onStatus={() => setWriting(true)}
          onAccount={go(onAccount)} onInvite={go(onInvite)} onSettings={go(onSettings)} onSignOut={go(onSignOut)} />)}
  </div>;
}

/** What the menu holds, top to bottom: who you are, what you are up to,
 *  Invite people, Settings, and Sign out last behind a hairline. A row whose
 *  door was not handed in is not drawn. */
export function AccountMenuList({ me, now, onStatus, onAccount, onInvite, onSettings, onSignOut }: {
  me: Person; now: number; onStatus: () => void;
  onAccount?: () => void; onInvite?: () => void; onSettings?: () => void; onSignOut?: () => void;
}) {
  const said = saying(me, now);
  const held = holdsUntil(said?.until, now);
  return <div className="th-acct-menu" role="menu" aria-label="Your account">
    <button type="button" role="menuitem" className="th-acct-who" onClick={onAccount} disabled={!onAccount}>
      <Face person={me} me /><span><b>{me.name || me.email}</b><small>{me.email}</small></span>
    </button>
    <span className="th-acct-rule" />
    <button type="button" role="menuitem" className={`th-acct-row th-acct-status${said ? ' said' : ''}`} onClick={onStatus}>
      <StatusIcon /><span>{said ? `${said.text}${held ? ` · ${held}` : ''}` : STATUS_PROMPT}</span>
    </button>
    {onInvite && <button type="button" role="menuitem" className="th-acct-row" onClick={onInvite}><InviteIcon /><span>Invite people</span></button>}
    {onSettings && <button type="button" role="menuitem" className="th-acct-row" onClick={onSettings}><SettingsIcon /><span>Settings</span></button>}
    {onSignOut && <>
      <span className="th-acct-rule" />
      <button type="button" role="menuitem" className="th-acct-row th-acct-signout" onClick={onSignOut}><SignOutIcon /><span>Sign out</span></button>
    </>}
  </div>;
}

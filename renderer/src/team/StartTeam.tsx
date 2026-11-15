// THE TEAM PAGE BEFORE THERE IS A TEAM (w-d19fcb9309, approved team-1): your
// face, two open seats and one button, which opens a card built like New
// thread's to name the team and invite people.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Face } from './people';
import type { Person } from '../types';
import '../threads/thread-composer.css';
import '../threads/share.css';
import './start-team.css';

const plus = <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails typed into Invite, split at commas and spaces, each once. */
export function emailsIn(text: string, had: readonly string[] = []): { emails: string[]; rest: string } {
  const parts = text.split(/[\s,;]+/);
  const rest = /[\s,;]$/.test(text) ? '' : parts.pop() ?? '';
  const emails = [...had];
  for (const p of parts) if (EMAIL.test(p) && !emails.includes(p.toLowerCase())) emails.push(p.toLowerCase());
  return { emails, rest };
}

export function StartTeam({ me, onStarted }: { me: Person | null; onStarted?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="st-empty">
      <div className="st-seats">
        <Face person={me} me size={40} />
        <span className="st-seat" aria-hidden="true">{plus}</span>
        <span className="st-seat" aria-hidden="true">{plus}</span>
      </div>
      <h2 className="td-title st-title">Bring your team in</h2>
      <button type="button" className="th-new st-start" onClick={() => setOpen(true)}>Start a team</button>
      {open && <StartTeamCard onClose={() => setOpen(false)} onStarted={() => { setOpen(false); onStarted?.(); }} />}
    </div>
  );
}

export function StartTeamCard({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const [name, setName] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  const all = EMAIL.test(typed.trim()) ? emailsIn(`${typed} `, emails).emails : emails;
  const start = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setProblem(null);
    const made = await api.teamCreate(name.trim());
    if (!made.ok) { setBusy(false); setProblem(made.error ?? 'The team could not be started.'); return; }
    const missed: string[] = [];
    for (const e of all) if (!(await api.teamInvite(e)).ok) missed.push(e);
    setBusy(false);
    if (missed.length) { setProblem(`Started. ${missed.join(', ')} could not be invited.`); setEmails(missed); setTyped(''); return; }
    onStarted();
  };
  return (
    <div className="modal-backdrop tc-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="tc-card st-card" role="dialog" aria-label="Start a team" onSubmit={(e) => { e.preventDefault(); void start(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void start(); } }}>
        <div className="tc-head">
          <label className="tc-field"><span className="tc-label">Team</span>
            <input className="tc-subject" autoFocus placeholder="Name it" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="tc-field st-invite"><span className="tc-label">Invite</span>
            {emails.map((e) => <button key={e} type="button" className="sh-chip st-chip" title="Take off" onClick={() => setEmails((was) => was.filter((x) => x !== e))}>{e}</button>)}
            <input className="tc-subject" placeholder={emails.length ? '' : 'Their emails'} value={typed}
              onChange={(e) => { const out = emailsIn(e.target.value, emails); setEmails(out.emails); setTyped(out.rest); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey) && typed) { e.preventDefault(); const out = emailsIn(`${typed} `, emails); setEmails(out.emails); setTyped(out.rest); }
                else if (e.key === 'Backspace' && !typed && emails.length) setEmails((was) => was.slice(0, -1));
              }} />
          </label>
        </div>
        <div className="tc-bar st-bar">
          {problem && <span className="st-problem" role="status">{problem}</span>}
          <span className="tc-send solo">
            <button type="submit" className="tc-send-main" disabled={!name.trim() || busy}>{busy ? 'Starting' : all.length ? `Start and invite ${all.length}` : 'Start team'}</button>
          </span>
        </div>
      </form>
    </div>
  );
}

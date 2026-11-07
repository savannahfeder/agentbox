// AUTO'S MARK in To (shared/auto-route.mjs): the agent's dashed square with a
// fork in it, because Auto sends the thread one way or the other.
import './agent-face.css';

export function AutoFace() {
  return (
    <span className="agent-face" aria-hidden="true">
      <svg className="auto-fork" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h6" /><path d="M11 12c3 0 4-5 8-5" /><path d="M11 12c3 0 4 5 8 5" /><path d="M16 4.5 19 7l-3 2.5" /><path d="M16 14.5 19 17l-3 2.5" />
      </svg>
    </span>
  );
}

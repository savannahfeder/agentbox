// AN AGENT'S FACE (w-3e4eb60cc2): two eyes in the dashed square that says
// "agent" across the app, and the engine's own mark as a badge on its corner,
// so the square beside "Agent" is never empty and says which agent will do it.
// Picked out of fifteen drawn faces; a person keeps their initials (team/people).
import type { ReactElement } from 'react';
import './agent-face.css';

const MARKS: Record<string, ReactElement> = {
  // Claude's spark: four strokes through one point.
  claude: (
    <svg viewBox="-6 -6 12 12">
      {[0, 45, 90, 135].map((a) => <line key={a} x1="0" y1="-4.6" x2="0" y2="4.6" transform={`rotate(${a})`} />)}
    </svg>
  ),
  // Codex: a prompt, > and _.
  codex: (
    <svg viewBox="0 0 12 12"><path d="M2 3 L5.2 6 L2 9" /><path d="M6.6 9.2 H10.2" /></svg>
  ),
};

export function AgentFace({ engine }: { engine?: string | null }) {
  const mark = engine ? MARKS[engine] : undefined;
  return (
    <span className="agent-face" aria-hidden="true">
      <svg className="agent-eyes" viewBox="0 0 16 16"><rect x="4.5" y="4.2" width="2" height="5" rx="1" /><rect x="9.5" y="4.2" width="2" height="5" rx="1" /></svg>
      {mark && <span className="agent-badge" data-engine={engine}>{mark}</span>}
    </span>
  );
}

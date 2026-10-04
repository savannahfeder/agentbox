// AN AGENT'S FACE (w-3e4eb60cc2): two eyes in the dashed square that says
// "agent" across the app, so the square beside "Agent" is never empty. Picked
// out of fifteen drawn faces, then photographed with an orange badge, a grey
// badge and none: "just the little eyes, no badge or anything". Which agent is
// written beside it already. A person keeps their initials (team/people).
import './agent-face.css';

export function AgentFace() {
  return (
    <span className="agent-face" aria-hidden="true">
      <svg className="agent-eyes" viewBox="0 0 16 16"><rect x="4.5" y="5.5" width="2" height="5" rx="1" /><rect x="9.5" y="5.5" width="2" height="5" rx="1" /></svg>
    </span>
  );
}

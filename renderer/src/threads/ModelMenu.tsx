// THE MODEL MENU, ONCE, FOR BOTH BOXES: the few models you use with the agent
// that runs each one, All models behind them in a column per agent, and the
// effort strip at the foot. The reply box had a flatter drawer of its own that
// listed one agent's models, which is why a reply could not move a thread to
// the other agent.
//
// IT DRAWS ROWS AND NOTHING ELSE. The popover around it, where it opens and
// what a pick does belong to the box: the card drops its menu from the top of
// the window, the reply box raises its own from the sentence at the bottom.

import type { ModelPick } from './composer-rules';
import type { EffortChoice } from '../effort';
import { codexFreePlan } from '../models';
import { useAgentUpdates } from '../components/AgentUpdates';
// The menu's own ink, wherever it is drawn: the reply box has no other reason
// to load the card's stylesheet.
import './thread-composer.css';

export function ModelMenu({
  className, page, onPage, recent, every, more, pick, onPick, labelOf, engineLabel,
  engineTags = false, effortRows, effortLit, onEffort, onKeyDown, onHover,
}: {
  /** The popover's own classes, because each box positions its own. */
  className: string;
  page: 'recent' | 'all';
  onPage: (page: 'recent' | 'all') => void;
  recent: readonly ModelPick[];
  every: { claude: readonly ModelPick[]; codex: readonly ModelPick[] };
  more: number;
  pick: ModelPick;
  onPick: (p: ModelPick) => void;
  labelOf: (p: ModelPick) => string;
  engineLabel: (id: string) => string;
  /** NAME THE AGENT BESIDE EACH RECENT MODEL (w-c9da359466). The All models
   *  columns are headed by their agent, so a model picked there says where it
   *  runs; Recent mixes both lists under one heading and said nothing, and a
   *  tester could not read "GPT-6.1-Sol, Sonnet 5.5, GPT-5.6-Terra" as two
   *  agents. Off on a Mac with one, where the word tells nobody anything. */
  engineTags?: boolean;
  effortRows: readonly EffortChoice[];
  effortLit: string | null;
  onEffort: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onHover: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const same = (a: ModelPick, b: ModelPick) => a.engine === b.engine && a.model === b.model;
  // EACH COLUMN'S HEADING SAYS WHAT LIMITS ITS LIST: "Free plan" when every
  // Codex login is on ChatGPT's free plan, and "Update" when that agent is
  // out of date, which the old picker offered and this menu did not.
  const { updates, start } = useAgentUpdates();
  const free = every.codex.length > 0 ? codexFreePlan() : null;
  const freeDate = free?.endedAt ? new Date(free.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
  const freeWhy = freeDate
    ? `Your ChatGPT plan ended ${freeDate}, so Codex offers fewer models.`
    : 'Codex offers fewer models on the ChatGPT free plan.';
  const head = (engine: 'claude' | 'codex') => {
    const u = updates[engine];
    const due = u && ['available', 'running', 'failed'].includes(u.state) ? u.state : null;
    const tag = engine === 'codex' && free;
    if (!due && !tag) return <span className="tc-menu-head">{engineLabel(engine)}</span>;
    return (
      <span className="tc-menu-head tc-head-split">
        <span>{engineLabel(engine)}</span>
        <span className="tc-head-side">
          {tag && <span className="tc-head-tag" title={freeWhy}>Free plan</span>}
          {due && (
            <button type="button" className="tc-head-link" title={`Update ${engineLabel(engine)} in the app terminal`} onClick={() => start(engine)}>
              {due === 'running' ? 'Updating…' : due === 'failed' ? 'Retry update' : 'Update'}
            </button>
          )}
        </span>
      </span>
    );
  };
  // `tag` names the agent beside the model, which Recent needs and the All
  // models columns do not: there the heading over the column has said it.
  const row = (p: ModelPick, tag = false) => (
    <button
      key={`${p.engine}:${p.model}`}
      type="button"
      data-item
      className={`tc-row ${same(p, pick) ? 'on' : ''}`}
      onPointerEnter={onHover}
      onClick={() => onPick(p)}
    >
      <span className="tc-row-label">{labelOf(p)}</span>
      {tag && <small>{engineLabel(p.engine)}</small>}
    </button>
  );
  return (
    <div className={className} role="listbox" aria-label="Model" onKeyDown={onKeyDown}>
      {page === 'recent' ? (<>
        <span className="tc-menu-head">Recent</span>
        {recent.map((p) => row(p, engineTags))}
        <span className="tc-sep" />
        <button type="button" data-item className="tc-row" onPointerEnter={onHover} onClick={() => onPage('all')}>
          <span className="tc-row-label">All models</span>
          {more > 0 && <small>{more} more ›</small>}
        </button>
      </>) : (<>
        <button type="button" data-item className="tc-row" onPointerEnter={onHover} onClick={() => onPage('recent')}>
          <span className="tc-row-label">‹ Recent</span>
        </button>
        <span className="tc-sep" />
        <div className="tc-cols">
          {/* Only a column with rows (w-db6f5e331e): a Mac without Claude
              Code drew an empty CLAUDE CODE heading here. */}
          {every.claude.length > 0 && (
            <div className="tc-col">
              {head('claude')}
              {every.claude.map((p) => row(p))}
            </div>
          )}
          {every.codex.length > 0 && (
            <div className="tc-col">
              {head('codex')}
              {every.codex.map((p) => row(p))}
            </div>
          )}
        </div>
      </>)}
      {effortRows.length > 0 && (<>
        <span className="tc-sep" />
        <span className="tc-effort-head" id="tc-effort-head">Effort</span>
        <span className="tc-effort" role="radiogroup" aria-labelledby="tc-effort-head">
          {effortRows.map((e) => (
            <button
              key={e.id}
              type="button"
              data-item
              role="radio"
              aria-checked={e.id === effortLit}
              className={e.id === effortLit ? 'lit' : ''}
              onPointerEnter={onHover}
              // The level stays in the menu: she may be here to set the model
              // and the level both, and closing on the first makes her reopen it.
              onClick={() => onEffort(e.id)}
            >{e.label}</button>
          ))}
        </span>
      </>)}
    </div>
  );
}

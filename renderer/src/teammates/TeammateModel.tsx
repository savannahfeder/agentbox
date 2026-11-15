// The model chip in a teammate's chat box: the thread reply box's chip and
// menu, worked out from the same rules. A pick is set on the teammate, because
// each of its runs is a fresh start on whatever it is set to.
import { useMemo } from 'react';
import type { WorkItem } from '../types';
import type { ModelChoice } from '../models';
import { defaultModelFor, engineModelLabel } from '../models';
import { defaultEffortFor, effortChoicesFor, effortShown } from '../effort';
import { effortSaid } from '../reply-pick';
import { allModels, moreCount, recentModels, type Harness, type ModelPick } from '../threads/composer-rules';
import { ReplyModel } from '../components/ReplyModel';
import { ENGINES } from '../../../shared/engines.mts';

export type ModelSetting = { engine: string | null; model: string | null; effort: string | null };

export function TeammateModel({ value, items, engines, codexModels, codexDefault, defaultEngine, onPick }: {
  value: ModelSetting;
  items: WorkItem[];
  engines: { id: string; label: string }[];
  codexModels: ModelChoice[];
  codexDefault: string | null;
  /** The engine a teammate with none runs on. */
  defaultEngine: string | null;
  onPick: (patch: Partial<ModelSetting>) => void;
}) {
  const engineRows = engines.length ? engines : [ENGINES[0]];
  const codexOffered = engineRows.some((e) => e.id === 'codex');
  const claudeOffered = engineRows.some((e) => e.id === 'claude');
  const opts = { codexModels, codexDefault };
  const engine: Harness = (value.engine ?? defaultEngine) === 'codex' ? 'codex' : 'claude';
  const pick: ModelPick = { engine, model: value.model ?? defaultModelFor(engine, codexDefault) };
  const recent = useMemo(
    () => recentModels(items, { codexModels, codexDefault, codexOffered, claudeOffered }),
    [items, codexModels, codexDefault, codexOffered, claudeOffered],
  );
  const every = useMemo(() => allModels({ codexModels, codexOffered, claudeOffered }), [codexModels, codexOffered, claudeOffered]);
  const effortRows = effortChoicesFor(engine, pick.model, opts);
  const level = effortSaid({ model: value.model, effort: value.effort }, { engine, codexModels, codexDefault });
  return <ReplyModel chip
    label={`${engineModelLabel(engine, value.model, opts)}${level ? ` · ${level}` : ''}`}
    pick={pick}
    // A level belongs to the model it was picked for, so crossing engines drops it.
    onPick={(p) => onPick({ engine: p.engine, model: p.model, ...(p.engine !== engine ? { effort: null } : {}) })}
    recent={recent} every={every} more={moreCount(recent, every)}
    labelOf={(p) => engineModelLabel(p.engine, p.model, opts)}
    engineLabel={(id) => engineRows.find((e) => e.id === id)?.label ?? ENGINES.find((e) => e.id === id)?.label ?? id}
    engineTags={engineRows.length > 1}
    effortRows={effortRows}
    effortLit={effortShown(value.effort, effortRows, defaultEffortFor(engine, pick.model, opts))}
    onEffort={(id) => onPick({ effort: id === value.effort ? null : id })}
    title="Which model this teammate runs on" />;
}

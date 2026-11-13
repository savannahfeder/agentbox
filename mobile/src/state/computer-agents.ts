import { useEffect, useState } from 'react';
import { readSettingsRows } from '../../../renderer/src/phone-rows';
import { computerAgents } from '../../../renderer/src/web-settings';
import { keepAgents, keptAgents } from '../lib/compose';
import { computerOf } from '../lib/settings-view';
import { appStore } from '../platform/persist';
import { useCloud } from './cloud';

/** The coding agents and Codex models the computer offers, off its settings copy; the last read until this one answers, Claude Code alone before any. */
export function useComputerAgents() {
  const c = useCloud();
  const [agents, setAgents] = useState(() => keptAgents(appStore) ?? computerAgents(null));
  useEffect(() => {
    const cloud = c.cloud;
    if (!cloud?.signedIn()) return;
    let gone = false;
    readSettingsRows((t, q) => cloud.select(t, q))
      .then((rows) => {
        const computer = computerOf(rows);
        if (gone || !computer?.settings?.workspace) return;
        const read = computerAgents(computer);
        keepAgents(appStore, read);
        setAgents(read);
      })
      .catch(() => { /* the last read stands */ });
    return () => { gone = true; };
  }, [c.cloud]);
  return agents;
}

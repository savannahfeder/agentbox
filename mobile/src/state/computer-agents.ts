import { useEffect, useState } from 'react';
import { readSettingsRows } from '../../../renderer/src/phone-rows';
import { computerAgents } from '../../../renderer/src/web-settings';
import { computerOf } from '../lib/settings-view';
import { useCloud } from './cloud';

/** The coding agents and Codex models the computer offers, off its settings copy; Claude Code alone until that is read. */
export function useComputerAgents() {
  const c = useCloud();
  const [agents, setAgents] = useState(() => computerAgents(null));
  useEffect(() => {
    const cloud = c.cloud;
    if (!cloud?.signedIn()) return;
    let gone = false;
    readSettingsRows((t, q) => cloud.select(t, q))
      .then((rows) => { if (!gone) setAgents(computerAgents(computerOf(rows))); })
      .catch(() => { /* Claude Code alone, as before */ });
    return () => { gone = true; };
  }, [c.cloud]);
  return agents;
}

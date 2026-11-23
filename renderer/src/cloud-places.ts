import type { CloudMode } from './cloud-menu';

/** An agent with no login in a set-up cloud runs its threads on this computer, so its page shows the empty cloud card. */
export const showsCloudSlot = ({ setUp, cloudLogins }: { setUp: boolean; cloudLogins: number }): boolean => setUp && cloudLogins === 0;

export const cloudSlotWords = (agent: string): { title: string; line: string } => ({
  title: `No ${agent} account in the cloud`,
  line: `${agent} threads run on this computer.`,
});

/**
 * Where a login is the one in use. The cloud's login is while the cloud is on
 * and can run; this computer's chosen one is unless the cloud takes every thread.
 */
export function inUseWhere({ chosenHere, isCloudInUse, cloudCanRun, mode }: {
  chosenHere: boolean; isCloudInUse: boolean; cloudCanRun: boolean; mode: CloudMode;
}): { here: boolean; cloud: boolean } {
  const cloud = isCloudInUse && cloudCanRun && mode !== 'mac';
  return { here: chosenHere && !(cloudCanRun && mode === 'all'), cloud };
}

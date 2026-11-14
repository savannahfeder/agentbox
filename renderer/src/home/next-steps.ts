// HOME'S NEXT CARD: what to do once the walkthrough is finished. HomePage.tsx draws it.
import { tourFinishing, tourOver, type Tour } from '../tour';
import { TEAM_LOOK } from '../../../shared/team-look.mts';

export type NextKey = 'walkthrough' | 'thread' | 'team' | 'tools' | 'files';
export interface NextRow { key: NextKey; words: string; where: string; done: boolean }

/** Each line is ticked by what has really happened, not by a visit to its page. */
export function nextRows({ thread, invited, tools, files, team }: { thread: boolean; invited: boolean; tools: boolean; files: boolean; team: boolean }): NextRow[] {
  const rows: NextRow[] = [
    { key: 'walkthrough', words: 'Finish the walkthrough', where: '', done: true },
    { key: 'thread', words: 'Start your first thread', where: 'Home', done: thread },
    { key: 'team', words: 'Invite your team', where: 'Team', done: invited },
    { key: 'tools', words: 'Connect your tools', where: 'Connections', done: tools },
    { key: 'files', words: 'Add a file', where: 'Files', done: files },
  ];
  return team ? rows : rows.filter((r) => r.key !== 'team');
}

/** A file you put there: not the team look the app keeps for every team, and not one an agent wrote. */
export const addedAFile = (files: readonly { name: string; agent?: string }[]): boolean => files.some((f) => f.name !== TEAM_LOOK && !f.agent);

/** Whether the walkthrough left a Next card that has not been hidden. */
export const nextOwed = (t: Tour | null): boolean => !!t && !t.skipped && !!t.next && !t.next.hidden && tourOver(t);
export const nextShown = (t: Tour | null, rows: NextRow[]): boolean => nextOwed(t) && rows.some((r) => !r.done);

export function finishedHello(name?: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `You finished the walkthrough, ${first}` : 'You finished the walkthrough';
}
/** The greeting says it only once the tip that says it has gone, until a first thread is sent. */
export const saysFinished = (t: Tour | null, cardShown: boolean): boolean => cardShown && !!t && !tourFinishing(t) && !t.next?.thread;

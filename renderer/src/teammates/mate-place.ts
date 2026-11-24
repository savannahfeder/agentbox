import { createContext } from 'react';
import { teammateIdOf, type Labelled } from '../../../shared/teammates.mts';

/** AI teammates are on (Settings, General). On unless the app says otherwise. */
export const MatesOnContext = createContext(true);

/** The threads the team's day is written from: with AI teammates off, none of theirs. */
export function theDaysThreads<T extends Labelled>(items: readonly T[], matesOn: boolean): T[] {
  return matesOn ? [...items] : items.filter((i) => !teammateIdOf(i));
}

/** Where a Team page left on `mate:<id>` goes once that teammate is gone: the Standup. `mateIds` null means not read yet. */
export function placeWithoutGoneMate(place: string | null, mateIds: readonly string[] | null): string | null {
  if (!place?.startsWith('mate:') || !mateIds) return place;
  return mateIds.includes(place.slice('mate:'.length)) ? place : 'team';
}

/** Where a Team page left on `mate:<id>` goes once that teammate is gone: the Standup. `mateIds` null means not read yet. */
export function placeWithoutGoneMate(place: string | null, mateIds: readonly string[] | null): string | null {
  if (!place?.startsWith('mate:') || !mateIds) return place;
  return mateIds.includes(place.slice('mate:'.length)) ? place : 'team';
}

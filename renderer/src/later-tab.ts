/** Later is drawn once something is in it: an empty tab on a first day is one more thing to wonder about. */
export const laterTabShown = ({ count, view, walking }: { count: number; view: string; walking: boolean }): boolean =>
  count > 0 || view === 'snoozed' || walking;

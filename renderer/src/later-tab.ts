/** Later is drawn once something is in it: an empty tab on a first day is one more thing to wonder about. */
export const laterTabShown = ({ count, view }: { count: number; view: string }): boolean =>
  count > 0 || view === 'snoozed';

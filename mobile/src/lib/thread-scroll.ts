// WHERE THE READER IS IN A THREAD ON THE PHONE APP. The end is followed only
// while she rests at it (renderer/src/thread-bottom.ts), and the middle coming
// back above her leaves the words she was reading where they were (Thread.tsx).

/** How near the end still counts as resting at it. */
export const AT_END_PX = 40;

export const atEnd = ({ y, view, content }: { y: number; view: number; content: number }) => content - (y + view) <= AT_END_PX;

/** The offset that keeps her the same distance from the bottom of a page that grew. */
export const keptPlace = (fromBottom: number, content: number) => Math.max(0, content - fromBottom);

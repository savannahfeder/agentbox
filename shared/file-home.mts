// A document made in Files lives on a thread of its own, because Files lists
// only what a thread names. That thread is the app's, not the person's: it is
// left out of every list of threads they read.
export const FILE_HOME = 'file-home';

export const isFileHome = (item: { labels?: readonly string[] | null } | null | undefined): boolean => Array.isArray(item?.labels) && item.labels.includes(FILE_HOME);

export const withoutFileHomes = <T extends { labels?: readonly string[] | null }>(items: T[]): T[] => items.filter((i) => !isFileHome(i));

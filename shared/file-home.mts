// A document made in Files lives on a thread of its own, because Files lists
// only what a thread names. That thread is the app's, not the person's: it is
// left out of every list of threads they read.
export const FILE_HOME = 'file-home';

export const isFileHome = (item) => Array.isArray(item?.labels) && item.labels.includes(FILE_HOME);

export const withoutFileHomes = (items) => items.filter((i) => !isFileHome(i));

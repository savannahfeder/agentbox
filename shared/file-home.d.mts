export declare const FILE_HOME: string;
export declare function isFileHome(item: { labels?: string[] } | null | undefined): boolean;
export declare function withoutFileHomes<T extends { labels?: string[] }>(items: T[]): T[];

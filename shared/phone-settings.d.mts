export declare const SETTINGS_VERSION: number;
export declare function accountIdOf(profile: string | null | undefined): string;
/** Why the computer should not carry out this change, or null. */
export declare function checkSetting(p: { scope: 'workspace' | 'project'; key: string; value?: unknown; product?: string } | null | undefined): string | null;
export declare function settingRoute(p: unknown, model: unknown): [string, Record<string, unknown>];
export declare function phoneSettingsOf(model: unknown, opts: { version?: string }): any;

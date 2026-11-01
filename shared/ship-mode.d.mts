export type ShipMode = 'ask' | 'unseen' | 'tested';
export declare const SHIP_MODES: ShipMode[];
export declare function isShipMode(v: unknown): v is ShipMode;
export declare function shipModeOf(config: unknown, slug: string): ShipMode;
export declare const SHIP_MODE_WORDS: Record<ShipMode, string>;
export declare const SHIP_MODE_SENTENCE: Record<ShipMode, string>;
export declare function shipModeBrief(mode: unknown): string;

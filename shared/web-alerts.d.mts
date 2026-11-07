export declare const WEB_ALERTS_KEY: 'webAlerts';
export declare const WEB_ALERTS_TEST_KEY: 'webAlertsTest';
export declare function endpointOk(e: unknown): boolean;
export declare function webAlertsOk(v: unknown): boolean;
export declare function webAlertsTestOk(v: unknown): boolean;
export declare function webAlertsOn(commands: Array<{ payload?: any; created_at?: string }>): Array<{ on: true; endpoint: string; keys: { p256dh: string; auth: string }; vapid: { publicKey: string; privateKey: string } }>;
export declare function makeVapidKeys(subtle: SubtleCrypto): Promise<{ publicKey: string; privateKey: string }>;

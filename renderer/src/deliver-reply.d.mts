export function deliverReply(options: { send: () => Promise<unknown>; accepted: () => unknown | Promise<unknown>; failed: (error: Error) => unknown | Promise<unknown> }): Promise<boolean>;

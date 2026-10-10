export function inputQueue(send: (data: string) => Promise<unknown>, options?: { chunk?: number; onError?: (e: unknown) => void }): { push(data: string): void };

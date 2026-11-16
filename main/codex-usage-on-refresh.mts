// The one place the app asks for Codex's usage rather than waiting to be told.
// `account/rateLimits/read` makes Codex's app-server ask OpenAI on the
// person's own login, so it is a network call: it runs only when someone
// presses Refresh on Settings › Codex, never for the corner meter or for
// opening the page (tests/refresh-asks-codex-for-the-live-usage-and-nothing-else-does).

export const ASK_DEADLINE_MS = 20_000;

type Request = (method: string, params?: unknown) => Promise<unknown>;

/** Codex's answer (`{ rateLimits, ... }`), or a throw on error or at the deadline. */
export async function askCodexForUsage(request: Request, { deadlineMs = ASK_DEADLINE_MS }: { deadlineMs?: number } = {}): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Codex did not answer for its usage within ${Math.round(deadlineMs / 1000)}s`)), deadlineMs);
  });
  try {
    return await Promise.race([request('account/rateLimits/read', {}), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

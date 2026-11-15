// A send is successful only after the main process accepts it. UI refresh is
// separate: a refresh error must not invite resending an already accepted input.
export interface ReplyDelivery {
  send: () => Promise<unknown>;
  accepted: () => unknown;
  failed: (error: unknown) => unknown;
}

export async function deliverReply({ send, accepted, failed }: ReplyDelivery): Promise<boolean> {
  try { await send(); }
  catch (error) { await failed(error); return false; }
  await accepted();
  return true;
}

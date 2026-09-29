// A send is successful only after the main process accepts it. UI refresh is
// separate: a refresh error must not invite resending an already accepted input.
export async function deliverReply({ send, accepted, failed }) {
  try { await send(); }
  catch (error) { await failed(error); return false; }
  await accepted();
  return true;
}

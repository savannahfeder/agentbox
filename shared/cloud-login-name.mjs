// How a Mac on the managed cloud names a sign-in it may not read: in place of
// a link, this prefix and the sign-in's key. The cloud server swaps it for a
// real link only inside a call to the sandbox (cloud/gateway/gateway.mjs).
export const LOGIN_NAME = 'agentbox-login:';

// THE ONE TERMINAL THAT BELONGS TO NO TASK.
//
// Every other shell in this app is opened against a work item, and
// `terminalFolder` refuses a key whose item does not exist. Signing a second
// Codex account in needs a shell and has no item, so it gets this one reserved
// key, and main resolves it to the folder main itself just made rather than to
// anything the window asked for.
//
// THE PRODUCT WORD CARRIES A COLON ON PURPOSE. A key is `{product, id}`, and a
// product here is a slug taken from a folder name; a colon never survives that,
// so no project anybody creates can collide with this and be handed a shell
// pointed somewhere else. Both sides import this rather than spelling it,
// because the whole value of a reserved key is that there is one of it.
export const SETTINGS_TERMINAL = { product: 'zero:settings', id: 'codex-login' };

// WHAT FINISHING A TASK IS CALLED, in one place (w-581dbc6cc4).
//
// Out of six pairs drawn on the sidebar, Done was the one chosen. One word
// rather than two, because the button and the mark are both called Done.
//
// EVERY SURFACE THAT NAMES THIS VERB READS IT FROM HERE. Before this they
// disagreed three ways, which is half of what this fixes: the key was E for
// done, the palette said "Close This Task" and the sidebar tab said "Closed".
// The verb has to match whatever the sidebar calls it, and "Closed" was not the
// right word.
//
// The three readers are the button in the corner (Focus.tsx), the inbox row's
// hover hint (`rowKeys` in list-rules.ts), the palette row (App.tsx) and the
// sidebar tab with its page heading (workspace-navigation.mjs). Add a fourth
// and it reads this, so they cannot drift apart again.
export const DONE = { verb: 'Done', short: 'Done', noun: 'Done' };

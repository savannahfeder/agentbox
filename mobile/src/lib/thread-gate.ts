// EVERY SCREEN BEHIND SIGN-IN ASKS THIS, as the site gates its whole page
// (App.tsx): nothing until the app has opened, then sign-in when signed out.
export const screenGate = ({ opened, signedIn }: { opened: boolean; signedIn: boolean }): 'wait' | 'sign-in' | 'show' =>
  (!opened ? 'wait' : !signedIn ? 'sign-in' : 'show');
